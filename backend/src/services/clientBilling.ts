import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { FinanceError, amount, text, date } from "./projectFinance";
import { autoFileDocument } from "./fileStorage";
import { renderClientInvoicePdf, type ClientInvoiceDocument } from "./clientInvoicePdf";

export const clientInvoiceInclude = {
  receipts: { orderBy: { createdAt: "asc" as const } },
  originalInvoice: { select: { id:true, number:true } },
  adjustments: { where: {kind:"CREDIT",status:"ISSUED"}, select: {netMinor:true,taxMinor:true} },
  pdfJobFile: { select: { id:true, driveFileId:true, driveSyncStatus:true, driveSyncError:true, driveWebViewLink:true } },
};
type BillingRecord = {kind:string;status:string;netMinor:number;taxMinor:number;dueDate:Date;receipts:{amountMinor:number;reversedAt:Date|null;direction:string}[];adjustments:{netMinor:number;taxMinor:number}[]};
export function clientInvoiceBalance(invoice:BillingRecord) {
  const creditedNetMinor=invoice.adjustments.reduce((s,c)=>s+c.netMinor,0);
  const creditedTaxMinor=invoice.adjustments.reduce((s,c)=>s+c.taxMinor,0);
  const active=invoice.receipts.filter(r=>!r.reversedAt);
  const refundedMinor=active.filter(r=>r.direction==="REFUND").reduce((s,r)=>s+r.amountMinor,0);
  const receivedMinor=active.filter(r=>r.direction!=="REFUND").reduce((s,r)=>s+r.amountMinor,0);
  const balanceMinor=invoice.kind==="CREDIT"?0:invoice.netMinor+invoice.taxMinor-creditedNetMinor-creditedTaxMinor-receivedMinor+refundedMinor;
  return {creditedNetMinor,creditedTaxMinor,receivedMinor,refundedMinor,balanceMinor,refundDueMinor:Math.max(0,-balanceMinor),fullyCredited:creditedNetMinor===invoice.netMinor&&creditedTaxMinor===invoice.taxMinor};
}
export function clientBillingTotals(invoices:BillingRecord[], approvedNetMinor: number|null) {
  const issued=invoices.filter(i=>i.status==="ISSUED"&&i.kind!=="CREDIT");
  const billedNetMinor=issued.reduce((s,i)=>s+i.netMinor-clientInvoiceBalance(i).creditedNetMinor,0);
  const receivedGrossMinor=issued.reduce((s,i)=>{const b=clientInvoiceBalance(i);return s+b.receivedMinor-b.refundedMinor;},0);
  const today=new Date().toISOString().slice(0,10);
  return {approvedNetMinor,billedNetMinor,receivedGrossMinor,
    creditedNetMinor:issued.reduce((s,i)=>s+clientInvoiceBalance(i).creditedNetMinor,0),
    refundDueGrossMinor:issued.reduce((s,i)=>s+clientInvoiceBalance(i).refundDueMinor,0),
    outstandingGrossMinor:issued.reduce((s,i)=>s+Math.max(0,clientInvoiceBalance(i).balanceMinor),0),
    overdueGrossMinor:issued.filter(i=>i.dueDate.toISOString().slice(0,10)<today).reduce((s,i)=>s+Math.max(0,clientInvoiceBalance(i).balanceMinor),0),
    remainingNetMinor:approvedNetMinor===null?null:Math.max(0,approvedNetMinor-billedNetMinor),overBilledNetMinor:approvedNetMinor===null?0:Math.max(0,billedNetMinor-approvedNetMinor)};
}
function reference(value:unknown) {
  const number=text(value,"Document reference",80).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9/._-]*$/.test(number))throw new FinanceError("Reference must use letters, numbers, dots, slashes, hyphens or underscores.");
  return number;
}
function creditFields(body:Record<string,unknown>, original: {netMinor:number;taxMinor:number;invoiceDate:Date;adjustments:{netMinor:number;taxMinor:number}[]}) {
  const netMinor=amount(body.net,"Credit net"),taxMinor=amount(body.tax,"Credit tax");
  if(netMinor+taxMinor===0)throw new FinanceError("Enter a positive net or tax credit.");
  const issuedNet=original.adjustments.reduce((s,c)=>s+c.netMinor,0),issuedTax=original.adjustments.reduce((s,c)=>s+c.taxMinor,0);
  if(netMinor>original.netMinor-issuedNet||taxMinor>original.taxMinor-issuedTax)throw new FinanceError("Credit exceeds the original invoice's remaining net or tax. Review existing credits.");
  const invoiceDate=date(body.invoiceDate,"Credit date");
  if(invoiceDate<original.invoiceDate)throw new FinanceError("Credit date cannot precede the original invoice date.");
  return {number:reference(body.number),description:text(body.description,"Credit reason",3000),invoiceDate,dueDate:invoiceDate,netMinor,taxMinor};
}
function fields(body:Record<string,unknown>) {
  const number=reference(body.number);
  const kind=text(body.kind,"Invoice type");if(!["DEPOSIT","PROGRESS","FINAL"].includes(kind))throw new FinanceError("Choose deposit, progress or final invoice.");
  const invoiceDate=date(body.invoiceDate,"Invoice date"),dueDate=date(body.dueDate,"Due date");
  if(dueDate<invoiceDate)throw new FinanceError("Due date cannot be before the invoice date.");
  const netMinor=amount(body.net,"Invoice net",false),taxMinor=amount(body.tax,"Tax amount");
  if(netMinor+taxMinor>1_000_000_000)throw new FinanceError("Invoice total cannot exceed 10 million.");
  return {number,kind,clientName:text(body.clientName,"Client legal name"),billingAddress:text(body.billingAddress,"Billing address",1500),description:text(body.description,"Client-facing description",3000),paymentInstructions:text(body.paymentInstructions,"Payment instructions",2000),invoiceDate,dueDate,netMinor,taxMinor};
}
function snapshot(invoice:ReturnType<typeof fields>,project:{title:string;jobCode:string|null},currency:string,draft:boolean):ClientInvoiceDocument {
  return {number:invoice.number,kind:invoice.kind,clientName:invoice.clientName,billingAddress:invoice.billingAddress,description:invoice.description,paymentInstructions:invoice.paymentInstructions,invoiceDate:invoice.invoiceDate.toISOString(),dueDate:invoice.dueDate.toISOString(),netMinor:invoice.netMinor,taxMinor:invoice.taxMinor,projectTitle:project.title,jobCode:project.jobCode,currency,draft};
}
export async function writeClientBilling(tx:Prisma.TransactionClient,productionId:string,actorId:string,action:string,body:Record<string,unknown>,currency:string) {
  if(action==="client.create") {
    const invoice=await tx.projectClientInvoice.create({data:{productionId,...fields(body)}});
    return {result:{id:invoice.id,version:invoice.version},before:null};
  }
  const invoice=await tx.projectClientInvoice.findFirst({where:{id:text(body.id,"Client invoice"),productionId},include:clientInvoiceInclude});
  if(!invoice)throw new FinanceError("Client invoice not found.",404);
  if(invoice.version!==body.version)throw new FinanceError("This client invoice changed. Refresh and review it before saving.",409);
  const before=invoice;
  if(action==="client.credit"||action==="client.replacement") {
    if(invoice.status!=="ISSUED"||invoice.kind==="CREDIT")throw new FinanceError("Choose an issued invoice to correct.");
    const original=invoice.documentSnapshot as unknown as ClientInvoiceDocument;
    if(!original)throw new FinanceError("Original issued document is unavailable.");
    let created;
    if(action==="client.credit") {
      created=await tx.projectClientInvoice.create({data:{productionId,originalInvoiceId:invoice.id,kind:"CREDIT",clientName:original.clientName,billingAddress:original.billingAddress,paymentInstructions:"",...creditFields(body,invoice)}});
    } else {
      if(!clientInvoiceBalance(invoice).fullyCredited)throw new FinanceError("Fully credit the original invoice before creating its replacement.");
      if(await tx.projectClientInvoice.count({where:{originalInvoiceId:invoice.id,kind:{not:"CREDIT"},status:{not:"VOID"}}}))throw new FinanceError("A replacement already exists. Open it instead.",409);
      const now=date(new Date().toISOString().slice(0,10),"Today");
      created=await tx.projectClientInvoice.create({data:{productionId,originalInvoiceId:invoice.id,number:reference(body.number),kind:invoice.kind,clientName:original.clientName,billingAddress:original.billingAddress,description:original.description,paymentInstructions:original.paymentInstructions,invoiceDate:now,dueDate:now,netMinor:invoice.netMinor,taxMinor:invoice.taxMinor}});
    }
    await tx.projectClientInvoice.update({where:{id:invoice.id},data:{version:{increment:1}}});
    return {result:{id:created.id,version:created.version},before};
  }
  if(action==="client.update") {
    if(invoice.status!=="DRAFT")throw new FinanceError("Only draft client invoices can be edited.");
    if(invoice.kind==="CREDIT") {
      const original=await tx.projectClientInvoice.findFirst({where:{id:invoice.originalInvoiceId!,productionId,status:"ISSUED",kind:{not:"CREDIT"}},include:clientInvoiceInclude});
      if(!original)throw new FinanceError("Original invoice is unavailable.");
      await tx.projectClientInvoice.update({where:{id:invoice.id},data:creditFields(body,original)});
    } else await tx.projectClientInvoice.update({where:{id:invoice.id},data:fields(body)});
  } else if(action==="client.issue") {
    if(invoice.status!=="DRAFT")throw new FinanceError("Only a draft client invoice can be issued.");
    if(invoice.invoiceDate>new Date())throw new FinanceError("An issued invoice cannot have a future invoice date.");
    const project=await tx.production.findUniqueOrThrow({where:{id:productionId},select:{title:true,jobCode:true}});
    let document:ClientInvoiceDocument;
    if(invoice.kind==="CREDIT") {
      const original=await tx.projectClientInvoice.findFirst({where:{id:invoice.originalInvoiceId!,productionId,status:"ISSUED",kind:{not:"CREDIT"}},include:clientInvoiceInclude});
      if(!original?.documentSnapshot)throw new FinanceError("Original issued invoice is unavailable.");
      creditFields({number:invoice.number,description:invoice.description,net:(invoice.netMinor/100).toFixed(2),tax:(invoice.taxMinor/100).toFixed(2),invoiceDate:invoice.invoiceDate.toISOString().slice(0,10)},original);
      const frozen=original.documentSnapshot as unknown as ClientInvoiceDocument;
      if(frozen.currency!==currency)throw new FinanceError("Original invoice currency does not match this register.");
      document={...frozen,kind:"CREDIT",number:invoice.number,description:invoice.description,invoiceDate:invoice.invoiceDate.toISOString(),dueDate:invoice.invoiceDate.toISOString(),netMinor:invoice.netMinor,taxMinor:invoice.taxMinor,draft:false,originalNumber:original.number,originalDate:original.invoiceDate.toISOString()};
      await tx.projectClientInvoice.update({where:{id:original.id},data:{version:{increment:1}}});
    } else {
      const approval=await tx.projectEstimateApproval.findFirst({where:{productionId},orderBy:{approvedAt:"desc"}});
      if(!approval)throw new FinanceError("Record an approved client estimate before issuing client invoices.");
      if(approval.currency!==currency)throw new FinanceError("The approved estimate currency does not match this register.");
      const issued=await tx.projectClientInvoice.findMany({where:{productionId,status:"ISSUED"},include:clientInvoiceInclude});
      if(clientBillingTotals(issued,approval.clientTotalMinor).billedNetMinor+invoice.netMinor>approval.clientTotalMinor)throw new FinanceError("This invoice exceeds the approved amount left to bill. Approve the revised estimate before billing extra work.");
      document={...snapshot(invoice,project,currency,false),originalNumber:invoice.originalInvoice?.number};
    }
    await tx.projectClientInvoice.update({where:{id:invoice.id},data:{status:"ISSUED",issuedAt:new Date(),issuedBy:actorId,documentSnapshot:JSON.parse(JSON.stringify(document)),documentStatus:"PENDING"}});
  } else if(action==="client.void") {
    if(invoice.status!=="DRAFT")throw new FinanceError("Issued invoices are retained. Use a credit note to correct an invoice; issued credit notes stay fixed.");
    text(body.reason,"Void reason",500);
    await tx.projectClientInvoice.update({where:{id:invoice.id},data:{status:"VOID"}});
  } else if(action==="client.receipt"||action==="client.refund") {
    if(invoice.status!=="ISSUED"||invoice.kind==="CREDIT")throw new FinanceError("Record receipts and refunds against the original issued invoice.");
    const direction=action==="client.refund"?"REFUND":"RECEIPT";
    const amountMinor=amount(body.amount,"Received amount",false),receivedAt=date(body.receivedAt,"Received date"),reference=text(body.reference,"Bank reference",500);
    if(receivedAt>new Date())throw new FinanceError("A receipt cannot have a future date.");
    const active=invoice.receipts.filter(r=>!r.reversedAt);
    if(active.some(r=>r.direction===direction&&r.amountMinor===amountMinor&&r.receivedAt.getTime()===receivedAt.getTime()&&r.reference.trim().toLowerCase()===reference.toLowerCase()))throw new FinanceError("This receipt is already recorded. Review its history.",409);
    const balance=clientInvoiceBalance(invoice);
    if(direction==="RECEIPT"&&amountMinor>Math.max(0,balance.balanceMinor))throw new FinanceError("Receipt exceeds this invoice's outstanding balance.");
    if(direction==="REFUND"&&amountMinor>balance.refundDueMinor)throw new FinanceError("Refund exceeds the amount owed back on this invoice. Issue the credit first.");
    await tx.projectClientReceipt.create({data:{invoiceId:invoice.id,amountMinor,receivedAt,reference,direction}});
  } else if(action==="client.reverse") {
    const receipt=invoice.receipts.find(r=>r.id===body.receiptId&&!r.reversedAt);
    if(!receipt)throw new FinanceError("Active receipt or refund not found.");
    const balance=clientInvoiceBalance(invoice);
    if(receipt.direction==="RECEIPT"&&balance.receivedMinor-receipt.amountMinor<balance.refundedMinor)throw new FinanceError("Correct the recorded refunds before reversing this receipt.");
    await tx.projectClientReceipt.update({where:{id:receipt.id},data:{reversedAt:new Date(),reversalReason:text(body.reason,"Correction reason",500)}});
  } else if(action==="client.retry-document") {
    if(invoice.documentStatus!=="ERROR"||!invoice.documentSnapshot)throw new FinanceError("There is no failed invoice document to retry.");
    await tx.projectClientInvoice.update({where:{id:invoice.id},data:{documentStatus:"PENDING",documentError:null}});
  } else throw new FinanceError("Unknown client billing action.");
  const updated=await tx.projectClientInvoice.update({where:{id:invoice.id},data:{version:{increment:1}}});
  return {result:{id:updated.id,version:updated.version},before};
}
export async function previewClientInvoice(productionId:string,id:string) {
  const invoice=await prisma.projectClientInvoice.findFirst({where:{id,productionId,status:"DRAFT"},include:{ledger:true,originalInvoice:true}});
  if(!invoice)throw new FinanceError("Draft client invoice not found.",404);
  const project=await prisma.production.findUniqueOrThrow({where:{id:productionId},select:{title:true,jobCode:true}});
  if(invoice.kind==="CREDIT") {
    if(!invoice.originalInvoice?.documentSnapshot)throw new FinanceError("Original invoice is unavailable.");
    return renderClientInvoicePdf({...invoice.originalInvoice.documentSnapshot as unknown as ClientInvoiceDocument,kind:"CREDIT",number:invoice.number,description:invoice.description,invoiceDate:invoice.invoiceDate.toISOString(),netMinor:invoice.netMinor,taxMinor:invoice.taxMinor,draft:true,originalNumber:invoice.originalInvoice.number,originalDate:invoice.originalInvoice.invoiceDate.toISOString()});
  }
  return renderClientInvoicePdf({...snapshot(invoice,project,invoice.ledger.currency,true),originalNumber:invoice.originalInvoice?.number});
}
export async function processClientInvoiceDocuments() {
  const pending=await prisma.projectClientInvoice.findMany({where:{documentStatus:"PENDING"},take:5,select:{id:true}});
  for(const {id} of pending) {
    try {await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`client-document:${id}`}))`;
      const invoice=await tx.projectClientInvoice.findUniqueOrThrow({where:{id}});
      if(invoice.documentStatus!=="PENDING"||!invoice.documentSnapshot)return;
      const sourceKey=`finance-client:${id}:issued`;
      let file=await prisma.jobFile.findUnique({where:{sourceKey}});
      if(!file)file=await autoFileDocument(invoice.productionId,"Client Invoices",await renderClientInvoicePdf(invoice.documentSnapshot as unknown as ClientInvoiceDocument),`${invoice.number.replace(/[^A-Za-z0-9._-]/g,"-")}_issued.pdf`,"application/pdf",{sourceKey,notes:`Issued client ${invoice.kind==="CREDIT"?"credit note":"invoice"} ${invoice.number}. Adjustments and payments are tracked in Client billing.`});
      await tx.projectClientInvoice.update({where:{id},data:{pdfJobFileId:file.id,documentStatus:"READY",documentError:null}});
    },{timeout:60000,maxWait:5000});}catch(e){await prisma.projectClientInvoice.updateMany({where:{id,documentStatus:"PENDING"},data:{documentStatus:"ERROR",documentError:e instanceof Error?e.message.slice(0,250):"Invoice document failed. Retry."}});}
  }
}
