import { supplierInvoiceInclude, supplierBalance, costAmounts, documentIdentity, checkSupplierCredit } from "./supplierFinance";
import { clientInvoiceInclude, clientInvoiceBalance, clientBillingTotals, writeClientBilling } from "./clientBilling";
import { financePoInclude, writePurchaseOrder } from "./financePurchaseOrders";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { verifyInvoiceFile } from "./driveInvoiceInbox";
import prisma from "../prisma";

export class FinanceError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function amount(value: unknown, label: string, allowZero = true): number {
  if (typeof value !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(value.trim())) throw new FinanceError(`${label} must be a positive amount with up to two decimal places.`);
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (minor > 1_000_000_000 || (!allowZero && minor === 0)) throw new FinanceError(`${label} is outside the supported range.`);
  return minor;
}
export function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new FinanceError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
const key = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-GB").replace(/\s+/g, " ").trim();
export function date(value: unknown, label: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceError(`${label} must be a date.`);
  const result = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new FinanceError(`${label} is invalid.`);
  return result;
}
function documentUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const url = new URL(text(value, "Document link", 2000));
    if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname) || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new FinanceError("Use a Google Drive or Google Docs link for the invoice document."); }
}
function checkVersion(existing: { version: number }, value: unknown) {
  if (value !== existing.version) throw new FinanceError("This record changed. Refresh and review it before saving again.", 409);
}
const invoiceInclude = supplierInvoiceInclude;
export async function readFinance(productionId: string) {
  return prisma.$transaction(async tx => {
    const project = await tx.production.findUnique({ where: { id: productionId }, select: { id: true, title: true, jobCode: true, workspaceVersion: true, estimateApprovals: { take: 1, orderBy: { approvedAt: "desc" }, select: { clientTotalMinor: true, plannedCostMinor: true, revisionNumber: true } }, budgets: { take: 1, select: { currencyBase: true, currentRevisionId: true,currentRevision:{select:{isLocked:true}} } } } });
    if (!project) throw new FinanceError("Project not found.", 404);
    const ledger = await tx.projectFinanceLedger.findUnique({ where: { productionId } });
    const [costs, invoices, operations, legacyCostCount, purchaseOrders, clientInvoices] = await Promise.all([
      tx.projectFinanceCost.findMany({ where: { productionId }, include: { activePurchaseOrder: { select: { id: true, poNumber: true, status: true } } }, orderBy: { createdAt: "asc" } }),
      tx.projectSupplierInvoice.findMany({ where: { productionId }, include: invoiceInclude, orderBy: { createdAt: "desc" } }),
      tx.projectFinanceOperation.findMany({ where: { productionId }, select: { id: true, action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 }),
      project.budgets[0]?.currentRevisionId ? tx.subCost.count({ where: { lineItem: { section: { revisionId: project.budgets[0].currentRevisionId } } } }) : 0,
      tx.purchaseOrderGroup.findMany({ where: { productionId, financeManaged: true }, include: financePoInclude, orderBy: { createdAt: "desc" } }),
      tx.projectClientInvoice.findMany({where:{productionId},include:clientInvoiceInclude,orderBy:{createdAt:"desc"}}),
    ]);
    const costRows = costs.map(cost => {
      const allocations=invoices.filter(i=>i.status==="APPROVED").flatMap(i=>i.allocations.filter(a=>a.costId===cost.id).map(a=>({...a,kind:i.kind})));
      return {...cost,...costAmounts(cost.committedMinor,cost.remainingMinor,allocations)};
    });
    const invoiceRows = invoices.map(invoice => {
      const duplicates=invoice.status!=="VOID"?invoices.filter(other=>other.id!==invoice.id&&other.status!=="VOID"&&other.kind===invoice.kind&&other.supplierKey===invoice.supplierKey&&other.invoiceDate.getTime()===invoice.invoiceDate.getTime()&&other.netMinor===invoice.netMinor&&other.taxMinor===invoice.taxMinor).map(i=>({id:i.id,number:i.number})):[];
      const overPo=invoice.kind!=="CREDIT"?invoice.allocations.flatMap(a=>{
        const cost=costRows.find(c=>c.id===a.costId);if(!cost?.activePurchaseOrderId)return [];
        const po=purchaseOrders.find(p=>p.id===cost.activePurchaseOrderId&&p.status==="ISSUED");
        const line=po?.financeLines.find(l=>l.costId===a.costId);if(!line)return [];
        const proposed=cost.billedBeforeCreditsMinor+(invoice.status==="DRAFT"?a.netMinor:0);
        return proposed>line.netMinor?[{costId:a.costId,poNumber:po!.poNumber,excessMinor:proposed-line.netMinor}]:[];
      }):[];
      return {...invoice,...supplierBalance(invoice),possibleDuplicates:duplicates,overPo,grossMinor:invoice.netMinor+invoice.taxMinor,allocatedMinor:invoice.allocations.reduce((sum,a)=>sum+a.netMinor,0)};
    });
    const poRows = purchaseOrders.map(po => {
      const totalMinor = po.financeLines.reduce((sum,l)=>sum+l.netMinor,0);
      const costIds = new Set(po.financeLines.map(l=>l.costId));
      const invoicedMinor = po.status === "ISSUED" ? invoices.filter(i=>i.status==="APPROVED").flatMap(i=>i.allocations.map(a=>({...a,kind:i.kind}))).filter(a=>costIds.has(a.costId)).reduce((sum,a)=>sum+(a.kind==="CREDIT"?-a.netMinor:a.netMinor),0) : 0;
      return { ...po, documentSnapshot: undefined, totalMinor, invoicedMinor, remainingMinor: Math.max(0,totalMinor-costRows.filter(c=>costIds.has(c.id)).reduce((sum,c)=>sum+c.billedBeforeCreditsMinor,0)) };
    });
    const approved = invoiceRows.filter(i => i.status === "APPROVED" && i.kind!=="CREDIT");
    return { project: { id: project.id, title: project.title, jobCode: project.jobCode, workspaceVersion: project.workspaceVersion }, approval: project.estimateApprovals[0] ?? null, currency: ledger?.currency ?? project.budgets[0]?.currencyBase ?? "GBP", legacyCostCount, estimateDraft:project.budgets[0]?.currentRevision?.isLocked===false, clientInvoices: clientInvoices.map(i=>({...i,documentSnapshot:undefined,...clientInvoiceBalance(i)})), clientBilling:clientBillingTotals(clientInvoices,project.estimateApprovals[0]?.clientTotalMinor??null), costs: costRows, invoices: invoiceRows, purchaseOrders: poRows, operations,
      totals: { plannedMinor: costRows.filter(c=>c.commitmentStatus==="PLANNED").reduce((s,c)=>s+c.committedMinor,0), committedMinor: costRows.filter(c=>c.commitmentStatus==="COMMITTED").reduce((s,c) => s+c.committedMinor,0), forecastMinor: costRows.reduce((s,c) => s+c.forecastMinor,0), invoicedNetMinor: approved.reduce((s,i)=>s+i.netMinor-i.creditedNetMinor,0), paidGrossMinor: approved.reduce((s,i)=>s+i.paidMinor-i.refundedMinor,0), refundDueGrossMinor:approved.reduce((s,i)=>s+i.refundDueMinor,0), outstandingGrossMinor: approved.reduce((s,i)=>s+Math.max(0,i.balanceMinor),0) } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

// All financial writes serialize per project. Request IDs prevent duplicate retries;
// record versions reject stale edits. Audit and mutation commit together.
export async function writeFinance(productionId: string, actorId: string, action: string, body: Record<string, unknown>) {
  let verifiedUrl: string | undefined;
  if ((action === "invoice.create" || action === "invoice.update") && body.driveFileId) verifiedUrl = await verifyInvoiceFile(productionId, text(body.driveFileId, "Drive file", 200));
  const requestId = text(body.requestId, "Request ID", 100);
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) throw new FinanceError("Invalid request ID.");
  const hash = createHash("sha256").update(JSON.stringify({ action, body })).digest("hex");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance:${productionId}`}))`;
    const old = await tx.projectFinanceOperation.findUnique({ where: { productionId_requestId: { productionId, requestId } } });
    if (old) { if (old.payloadHash !== hash) throw new FinanceError("This request ID was already used for a different change.", 409); return old.result; }
    const project = await tx.production.findUnique({ where: { id: productionId }, select: { budgets: { take: 1, select: { currencyBase: true } } } });
    if (!project) throw new FinanceError("Project not found.", 404);
    const currency = project.budgets[0]?.currencyBase ?? "GBP";
    if (!["GBP", "EUR", "USD", "CHF", "CAD", "AUD"].includes(currency)) throw new FinanceError("This register currently supports GBP, EUR, USD, CHF, CAD or AUD. Other currencies need a currency conversion workflow.");
    const ledger = await tx.projectFinanceLedger.upsert({ where: { productionId }, create: { productionId, currency }, update: {} });
    if (ledger.currency !== currency) throw new FinanceError("The estimate currency changed. Reconcile the register currency before adding records.", 409);
    if (body.currency !== ledger.currency) throw new FinanceError(`Enter amounts in ${ledger.currency}. Foreign-currency invoices need a reviewed conversion workflow.`);
    let result: { id: string; version?: number };
    let before: unknown = null;
    if (action.startsWith("client.")) {
      const billing = await writeClientBilling(tx,productionId,actorId,action,body,ledger.currency); result=billing.result; before=billing.before;
    } else if (action.startsWith("po.")) {
      const po = await writePurchaseOrder(tx, productionId, actorId, action, body, ledger.currency);
      result = po.result; before = po.before;
    } else if (action === "cost.create" || action === "cost.update") {
      const commitmentStatus = body.commitmentStatus ?? "COMMITTED";
      if (commitmentStatus !== "PLANNED" && commitmentStatus !== "COMMITTED") throw new FinanceError("Choose planned or committed cost.");
      const data = { commitmentStatus, description: text(body.description, "Description", 500), supplier: text(body.supplier, "Supplier"), supplierKey: key(text(body.supplier, "Supplier")), committedMinor: amount(body.committed, "Committed net"), remainingMinor: body.remaining === "" || body.remaining === null || body.remaining === undefined ? null : amount(body.remaining, "Remaining net") };
      if (action === "cost.create") result = await tx.projectFinanceCost.create({ data: { productionId, ...data } });
      else {
        const cost = await tx.projectFinanceCost.findFirst({ where: { id: text(body.id, "Cost"), productionId }, include: { allocations: true } });
        if (!cost) throw new FinanceError("Cost not found.", 404);
        checkVersion(cost, body.version); before = cost;
        if (body.commitmentStatus === undefined) data.commitmentStatus = cost.commitmentStatus === "PLANNED" ? "PLANNED" : "COMMITTED";
        if (cost.activePurchaseOrderId && (data.supplierKey !== cost.supplierKey || data.committedMinor !== cost.committedMinor || data.commitmentStatus !== cost.commitmentStatus)) throw new FinanceError("This cost belongs to an active PO. Edit its draft or cancel the PO before changing the supplier or commitment. Remaining-work forecasts can still be updated.");
        if (cost.allocations.length && data.supplierKey !== cost.supplierKey) throw new FinanceError("A cost with invoice allocations cannot change supplier.");
        result = await tx.projectFinanceCost.update({ where: { id: cost.id }, data: { ...data, version: { increment: 1 } } });
      }
    } else if (action === "invoice.create" || action === "invoice.update") {
      const existing=action==="invoice.update"?await tx.projectSupplierInvoice.findFirst({where:{id:text(body.id,"Invoice"),productionId},include:invoiceInclude}):null;
      if(action==="invoice.update"&&!existing)throw new FinanceError("Invoice not found.",404);
      if(existing){checkVersion(existing,body.version);before=existing;if(existing.status!=="DRAFT")throw new FinanceError("Only draft invoices can be edited.");}
      const kind=existing?.kind??body.kind??"INVOICE";
      if(kind!=="INVOICE"&&kind!=="CREDIT")throw new FinanceError("Choose invoice or credit note.");
      if(existing&&body.kind&&body.kind!==existing.kind)throw new FinanceError("Void this draft and create a new document to change its type.");
      const originalInvoiceId=kind==="CREDIT"?(existing?.originalInvoiceId??text(body.originalInvoiceId,"Original invoice")):null;
      const number = text(body.number, "Invoice number");
      const invoiceDate = date(body.invoiceDate, "Invoice date"); const dueDate = kind==="CREDIT"?null:body.dueDate ? date(body.dueDate, "Due date") : null;
      if(dueDate&&dueDate<invoiceDate)throw new FinanceError("Due date cannot precede the invoice date.");
      const netMinor=amount(body.net,"Document net",kind==="CREDIT"),taxMinor=amount(body.tax,"Document tax");
      if(netMinor+taxMinor===0||netMinor+taxMinor>1_000_000_000)throw new FinanceError("Document total is outside the supported range.");
      const original=kind==="CREDIT"?await checkSupplierCredit(tx,productionId,{originalInvoiceId,netMinor,taxMinor,invoiceDate,allocations:existing?.allocations}):null;
      const supplier=original?.supplier??text(body.supplier,"Supplier");
      const url=verifiedUrl??documentUrl(body.documentUrl);
      if(url){const other=await tx.projectSupplierInvoice.findMany({where:{productionId,id:{not:existing?.id||""},documentUrl:{not:null}},select:{documentUrl:true}});if(other.some(i=>documentIdentity(i.documentUrl)===documentIdentity(url)))throw new FinanceError("This Drive document is already in the register. Open its existing record.",409);}
      const data={kind,originalInvoiceId,supplier,supplierKey:key(supplier),number,numberKey:key(number),invoiceDate,dueDate,netMinor,taxMinor,documentUrl:url,driveFileId:verifiedUrl?String(body.driveFileId):null,reviewNote:null};
      if(!existing)result=await tx.projectSupplierInvoice.create({data:{productionId,...data}});
      else {
        if(existing.allocations.length&&existing.supplierKey!==data.supplierKey)throw new FinanceError("Clear allocations before changing the supplier.");
        if(existing.allocations.reduce((sum,a)=>sum+a.netMinor,0)>data.netMinor)throw new FinanceError("Reduce the allocations before reducing the invoice net.");
        result=await tx.projectSupplierInvoice.update({where:{id:existing.id},data:{...data,version:{increment:1}}});
      }
    } else {
      const invoice = await tx.projectSupplierInvoice.findFirst({ where: { id: text(body.invoiceId, "Invoice"), productionId }, include: invoiceInclude });
      if (!invoice) throw new FinanceError("Invoice not found.", 404);
      checkVersion(invoice, body.version); before = invoice;
      if (action === "invoice.allocate") {
        if (invoice.status !== "DRAFT") throw new FinanceError("Only draft invoices can be allocated.");
        if (!Array.isArray(body.allocations) || body.allocations.length > 100) throw new FinanceError("Provide up to 100 cost allocations.");
        const allocations = body.allocations.map(value => {
          if (!value || typeof value !== "object") throw new FinanceError("Invalid allocation.");
          const row = value as Record<string, unknown>;
          return { invoiceId: invoice.id, costId: text(row.costId, "Cost"), netMinor: amount(row.net, "Allocated net", false) };
        });
        if (new Set(allocations.map(a=>a.costId)).size !== allocations.length) throw new FinanceError("Allocate to each cost only once.");
        if (allocations.reduce((s,a)=>s+a.netMinor,0) > invoice.netMinor) throw new FinanceError("Allocations exceed the invoice net.");
        const costs = await tx.projectFinanceCost.findMany({ where: { id: { in: allocations.map(a=>a.costId) }, productionId, supplierKey: invoice.supplierKey } });
        if (costs.length !== allocations.length) throw new FinanceError("Every allocation must use a cost for this project and supplier.");
        if(invoice.kind==="CREDIT")await checkSupplierCredit(tx,productionId,{...invoice,allocations});
        await tx.projectInvoiceAllocation.deleteMany({ where: { invoiceId: invoice.id } });
        if (allocations.length) await tx.projectInvoiceAllocation.createMany({ data: allocations });
        await tx.projectSupplierInvoice.update({where:{id:invoice.id},data:{reviewNote:null}});
      } else if (action === "invoice.approve") {
        if (invoice.status !== "DRAFT") throw new FinanceError("Only a draft invoice can be approved.");
        if (!invoice.documentUrl) throw new FinanceError("Link the invoice document before approval.");
        if (invoice.allocations.reduce((s,a)=>s+a.netMinor,0) !== invoice.netMinor) throw new FinanceError("Allocate the full invoice net before approval.");
        if(invoice.kind==="CREDIT") {
          await checkSupplierCredit(tx,productionId,invoice);
          await tx.projectSupplierInvoice.update({where:{id:invoice.originalInvoiceId!},data:{version:{increment:1}}});
        }
        await tx.projectSupplierInvoice.update({ where: { id: invoice.id }, data: { status: "APPROVED",reviewNote:body.reviewNote?text(body.reviewNote,"Review note",1000):invoice.reviewNote } });
      } else if (action === "invoice.reopen") {
        if (invoice.status !== "APPROVED") throw new FinanceError("Only an approved invoice can be reopened for correction.");
        if(invoice.kind==="CREDIT"||await tx.projectSupplierInvoice.count({where:{originalInvoiceId:invoice.id,status:{not:"VOID"}}}))throw new FinanceError("Invoices with credit notes and approved credits stay fixed. Review the correction documents instead.");
        if (invoice.payments.some(payment => !payment.reversedAt)) throw new FinanceError("Correct the recorded payments before reopening this invoice.");
        text(body.reason, "Correction reason", 500);
        await tx.projectSupplierInvoice.update({ where: { id: invoice.id }, data: { status: "DRAFT",reviewNote:null } });
      } else if (action === "invoice.void") {
        if (invoice.status !== "DRAFT") throw new FinanceError("Only a draft invoice can be voided. Approved invoices require a reviewed correction.");
        await tx.projectSupplierInvoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
      } else if(action === "invoice.review") {
        if(invoice.status==="VOID")throw new FinanceError("Voided documents cannot be reviewed.");
        await tx.projectSupplierInvoice.update({where:{id:invoice.id},data:{reviewNote:text(body.reason,"Review reason",1000)}});
      } else if (action === "payment.record" || action === "payment.refund") {
        if (invoice.status !== "APPROVED"||invoice.kind==="CREDIT") throw new FinanceError("Record payments and refunds against the approved original invoice.");
        const direction=action==="payment.refund"?"REFUND":"PAYMENT";
        const amountMinor = amount(body.amount, "Payment", false);
        const balance=supplierBalance(invoice);
        const paidAt = date(body.paidAt, "Payment date");
        if (paidAt > new Date()) throw new FinanceError("A recorded payment cannot have a future date.");
        const reference = text(body.reference, "Payment reference", 500);
        if (invoice.payments.some(payment => !payment.reversedAt && payment.direction===direction && payment.amountMinor === amountMinor && payment.paidAt.getTime() === paidAt.getTime() && key(payment.reference) === key(reference))) throw new FinanceError("A payment with this date, amount and reference is already recorded. Review payment history before adding another.", 409);
        if(direction==="PAYMENT"&&amountMinor>Math.max(0,balance.balanceMinor))throw new FinanceError("Payment exceeds the invoice's outstanding balance.");
        if(direction==="REFUND"&&amountMinor>balance.refundDueMinor)throw new FinanceError("Refund exceeds the amount due back from this supplier.");
        await tx.projectInvoicePayment.create({ data: { invoiceId: invoice.id, amountMinor, paidAt, reference, direction } });
      } else if (action === "payment.reverse") {
        const payment = invoice.payments.find(p=>p.id===body.paymentId);
        if (!payment || payment.reversedAt) throw new FinanceError("Active payment not found.");
        const balance=supplierBalance(invoice);if(payment.direction==="PAYMENT"&&balance.paidMinor-payment.amountMinor<balance.refundedMinor)throw new FinanceError("Correct the recorded refunds before reversing this payment.");
        await tx.projectInvoicePayment.update({ where: { id: payment.id }, data: { reversedAt: new Date(), reversalReason: text(body.reason, "Correction reason", 500) } });
      } else throw new FinanceError("Unknown finance action.");
      result = await tx.projectSupplierInvoice.update({ where: { id: invoice.id }, data: { version: { increment: 1 } } });
    }
    const response = { id: result.id, version: result.version ?? 1 };
    await tx.projectFinanceOperation.create({ data: { productionId, requestId, action, actorId, payloadHash: hash, detail: JSON.parse(JSON.stringify({ before, input: body })), result: response } });
    return response;
  }, { timeout: 15_000 });
}

export async function financeSummaries() {
  const ledgers = await prisma.$transaction(tx => tx.projectFinanceLedger.findMany({ select: {
    productionId: true, currency: true,
    clientInvoices: { where:{status:"ISSUED"}, select:{kind:true,status:true,netMinor:true,taxMinor:true,dueDate:true,adjustments:{where:{kind:"CREDIT",status:"ISSUED"},select:{netMinor:true,taxMinor:true}},receipts:{select:{amountMinor:true,reversedAt:true,direction:true}}} },
    costs: { select: { committedMinor: true, remainingMinor: true, allocations: { where: { invoice: { status: "APPROVED" } }, select: { netMinor: true,invoice:{select:{kind:true}} } } } },
    invoices: { where: { status: "APPROVED",kind:"INVOICE" }, select: { kind:true,netMinor:true,taxMinor:true,credits:{where:{status:"APPROVED",kind:"CREDIT"},select:{netMinor:true,taxMinor:true}},payments:{select:{amountMinor:true,direction:true,reversedAt:true}} } },
  } }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return ledgers.map(ledger => {
    const invoiceRows=ledger.invoices.map(i=>({...i,...supplierBalance(i)}));
    const invoicedNetMinor=invoiceRows.reduce((s,i)=>s+i.netMinor-i.creditedNetMinor,0);
    const paidGrossMinor=invoiceRows.reduce((s,i)=>s+i.paidMinor-i.refundedMinor,0);
    const forecastMinor=ledger.costs.reduce((sum,c)=>sum+costAmounts(c.committedMinor,c.remainingMinor,c.allocations.map(a=>({netMinor:a.netMinor,kind:a.invoice.kind}))).forecastMinor,0);
    return {clientBilling:clientBillingTotals(ledger.clientInvoices,null),productionId:ledger.productionId,currency:ledger.currency,forecastMinor,invoicedNetMinor,paidGrossMinor,outstandingGrossMinor:invoiceRows.reduce((s,i)=>s+Math.max(0,i.balanceMinor),0),refundDueGrossMinor:invoiceRows.reduce((s,i)=>s+i.refundDueMinor,0)};
  });
}
