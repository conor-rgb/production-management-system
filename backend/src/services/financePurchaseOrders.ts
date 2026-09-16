import { Prisma } from "@prisma/client";
import { reservePurchaseOrderNumber } from "../utils/purchaseOrderNumber";
import prisma from "../prisma";
import { FinanceError, amount, text } from "./projectFinance";
import { autoFileDocument } from "./fileStorage";
import { renderFinancePurchaseOrderPdf, type FinancePoDocument } from "./purchaseOrderPdf";

const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-GB").replace(/\s+/g, " ").trim();
export const financePoInclude = {
  financeLines: { orderBy: { order: "asc" as const } },
  pdfJobFile: { select: { id: true, driveFileId: true, driveSyncStatus: true, driveSyncError: true, driveWebViewLink: true } },
};
function supplierFields(body: Record<string, unknown>) {
  const email = body.supplierEmail ? text(body.supplierEmail, "Supplier email", 254) : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FinanceError("Enter a valid supplier email.");
  return { supplierEmail: email, notes: body.notes ? text(body.notes, "Supplier scope", 4000) : null, supplierTerms: body.supplierTerms ? text(body.supplierTerms, "Supplier terms", 2000) : null };
}
function rows(body: Record<string, unknown>) {
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > 50) throw new FinanceError("Select between 1 and 50 supplier costs.");
  const lines = body.lines.map((raw, order) => {
    if (!raw || typeof raw !== "object") throw new FinanceError("Invalid PO line.");
    const line = raw as Record<string, unknown>;
    return { costId: text(line.costId, "Cost"), netMinor: amount(line.net, "Agreed cost", false), order };
  });
  if (new Set(lines.map(l => l.costId)).size !== lines.length) throw new FinanceError("Include each cost only once.");
  if (lines.reduce((sum,l) => sum+l.netMinor,0) > 1_000_000_000) throw new FinanceError("PO total cannot exceed 10 million.");
  return lines;
}
function snapshot(po: { poNumber: string; currency: string; supplierName: string; supplierEmail: string|null; notes: string|null; supplierTerms: string|null; financeLines: {description:string;netMinor:number}[] }, project: { title: string; jobCode: string|null }, issuedAt: Date, draft: boolean): FinancePoDocument {
  return { poNumber: po.poNumber, currency: po.currency, supplierName: po.supplierName, supplierEmail: po.supplierEmail, projectTitle: project.title, jobCode: project.jobCode, issuedAt: issuedAt.toISOString(), draft, scope: po.notes, terms: po.supplierTerms, lines: po.financeLines.map(l=>({description:l.description,netMinor:l.netMinor})) };
}

// Called inside the finance transaction and per-project lock. No estimate writes or messages.
export async function writePurchaseOrder(tx: Prisma.TransactionClient, productionId: string, actorId: string, action: string, body: Record<string, unknown>, currency: string) {
  const project = await tx.production.findUniqueOrThrow({ where: { id: productionId }, select: { title:true, jobCode:true } });
  if (action === "po.create") {
    if (!project.jobCode) throw new FinanceError("Set the project's job code before creating a PO.");
    const lines = rows(body);
    const costs = await tx.projectFinanceCost.findMany({ where: { productionId, id: { in: lines.map(l=>l.costId) } } });
    if (costs.length !== lines.length) throw new FinanceError("Every selected cost must belong to this project.");
    const supplier = costs[0].supplier;
    if (normalize(supplier) === "unassigned" || costs.some(c=>c.supplierKey !== costs[0].supplierKey)) throw new FinanceError("Assign all selected costs to the same supplier before making a PO.");
    if (costs.some(c=>c.activePurchaseOrderId)) throw new FinanceError("A selected cost already belongs to an active PO. Open that PO instead.",409);
    const number = await reservePurchaseOrderNumber(tx, productionId);
    const po = await tx.purchaseOrderGroup.create({data:{productionId,financeManaged:true,currency,poNumber:number,supplierName:supplier,...supplierFields(body),financeLines:{create:lines.map(l=>({...l,description:costs.find(c=>c.id===l.costId)!.description}))}}});
    await tx.projectFinanceCost.updateMany({where:{id:{in:costs.map(c=>c.id)}},data:{activePurchaseOrderId:po.id,version:{increment:1}}});
    return { result:{id:po.id,version:po.version}, before:null };
  }
  const po = await tx.purchaseOrderGroup.findFirst({where:{id:text(body.id,"Purchase order"),productionId,financeManaged:true},include:financePoInclude});
  if (!po) throw new FinanceError("Purchase order not found.",404);
  if (po.version !== body.version) throw new FinanceError("This PO changed. Refresh and review it before saving.",409);
  const before = po;
  if (action === "po.update") {
    if (po.status !== "DRAFT") throw new FinanceError("Only draft POs can be edited.");
    const lines=rows(body);
    if(lines.length!==po.financeLines.length || lines.some(l=>!po.financeLines.some(old=>old.costId===l.costId))) throw new FinanceError("Cancel this draft and create another to change its selected costs.");
    for(const line of lines) await tx.projectPurchaseOrderLine.update({where:{purchaseOrderId_costId:{purchaseOrderId:po.id,costId:line.costId}},data:{netMinor:line.netMinor,order:line.order}});
    await tx.purchaseOrderGroup.update({where:{id:po.id},data:supplierFields(body)});
  } else if (action === "po.issue") {
    if(po.status!=="DRAFT") throw new FinanceError("Only a draft PO can be issued.");
    const costs=await tx.projectFinanceCost.findMany({where:{productionId,activePurchaseOrderId:po.id},include:{allocations:{where:{invoice:{status:"APPROVED"}},include:{invoice:{select:{kind:true}}}}}});
    if(costs.length!==po.financeLines.length || costs.some(c=>c.supplierKey!==normalize(po.supplierName))) throw new FinanceError("The selected costs changed. Review this PO before issuing.",409);
    for(const line of po.financeLines) {
      const cost=costs.find(c=>c.id===line.costId);
      if(!cost)throw new FinanceError("A PO cost is unavailable.");
      if(cost.allocations.reduce((sum,a)=>sum+(a.invoice.kind==="CREDIT"?-a.netMinor:a.netMinor),0)>line.netMinor) throw new FinanceError("An agreed PO amount is below invoices already approved against that cost.");
      await tx.projectFinanceCost.update({where:{id:cost.id},data:{committedMinor:line.netMinor,commitmentStatus:"COMMITTED",version:{increment:1}}});
    }
    const issuedAt=new Date();
    await tx.purchaseOrderGroup.update({where:{id:po.id},data:{status:"ISSUED",issuedAt,issuedBy:actorId,documentSnapshot:JSON.parse(JSON.stringify(snapshot(po,project,issuedAt,false))),documentStatus:"PENDING",documentError:null}});
  } else if (action === "po.cancel") {
    if(!["DRAFT","ISSUED"].includes(po.status)) throw new FinanceError("This PO cannot be cancelled.");
    text(body.reason,"Cancellation reason",500);
    const attached=await tx.projectInvoiceAllocation.count({where:{costId:{in:po.financeLines.map(l=>l.costId)},invoice:{status:{not:"VOID"}}}});
    if(attached) throw new FinanceError("Review and correct the invoices allocated to these costs before cancelling the PO.");
    await tx.projectFinanceCost.updateMany({where:{productionId,activePurchaseOrderId:po.id},data:{activePurchaseOrderId:null,...(po.status==="ISSUED"?{commitmentStatus:"PLANNED"}:{}),version:{increment:1}}});
    await tx.purchaseOrderGroup.update({where:{id:po.id},data:{status:"CANCELLED",cancelledAt:new Date(),cancellationReason:text(body.reason,"Cancellation reason",500)}});
  } else if (action === "po.retry-document") {
    if(!po.documentSnapshot || po.documentStatus!=="ERROR") throw new FinanceError("There is no failed PO document to retry.");
    await tx.purchaseOrderGroup.update({where:{id:po.id},data:{documentStatus:"PENDING",documentError:null}});
  } else throw new FinanceError("Unknown purchase order action.");
  const updated = await tx.purchaseOrderGroup.update({where:{id:po.id},data:{version:{increment:1}}});
  return {result:{id:po.id,version:updated.version},before};
}
export async function previewFinancePurchaseOrder(productionId:string,id:string) {
  const po=await prisma.purchaseOrderGroup.findFirst({where:{id,productionId,financeManaged:true,status:"DRAFT"},include:{...financePoInclude,production:{select:{title:true,jobCode:true}}}});
  if(!po)throw new FinanceError("Draft purchase order not found.",404);
  return renderFinancePurchaseOrderPdf(snapshot(po,po.production,new Date(),true));
}
// Durable DB state plus a unique source key recovers a crash after filing but before linking.
export async function processPurchaseOrderDocuments() {
  const pending=await prisma.purchaseOrderGroup.findMany({where:{financeManaged:true,documentStatus:"PENDING"},take:5,select:{id:true}});
  for(const {id} of pending) {
    try { await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`po-document:${id}`}))`;
      const po=await tx.purchaseOrderGroup.findUniqueOrThrow({where:{id}});
      if(po.documentStatus!=="PENDING"||!po.documentSnapshot)return;
      const sourceKey=`finance-po:${po.id}:issued`;
      let file=await prisma.jobFile.findUnique({where:{sourceKey}});
      if(!file) {
        const buffer=await renderFinancePurchaseOrderPdf(po.documentSnapshot as unknown as FinancePoDocument);
        file=await autoFileDocument(po.productionId,"Contracts",buffer,`${po.poNumber}_issued.pdf`,"application/pdf",{sourceKey,notes:`Issued supplier PO ${po.poNumber}. Check current PO status in Costs before sharing.`});
      }
      await tx.purchaseOrderGroup.update({where:{id},data:{pdfJobFileId:file.id,documentStatus:"READY",documentError:null}});
    },{timeout:60000,maxWait:5000}); } catch(e) {
      await prisma.purchaseOrderGroup.updateMany({where:{id,documentStatus:"PENDING"},data:{documentStatus:"ERROR",documentError:e instanceof Error?e.message.slice(0,250):"PO document failed. Retry."}});
    }
  }
}
