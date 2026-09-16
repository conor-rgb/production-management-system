import { readFinance } from "./projectFinance";
import { invoiceInbox, verifyInvoiceFile } from "./driveInvoiceInbox";
import { documentIdentity } from "./supplierFinance";
export type CloseItem={key:string;label:string;detail:string;view:string};
export function financialCloseItems(data:Awaited<ReturnType<typeof readFinance>>) {
  const items:CloseItem[]=[];
  const money=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:data.currency}).format(n/100);
  const add=(key:string,label:string,detail:string,view:string)=>items.push({key,label,detail,view});
  if(!data.approval)add("approval","Client estimate","Record the client's approved estimate.","estimate");
  if(data.estimateDraft)add("estimate-draft","Estimate revision","Review the current draft revision before closing.","estimate");
  if(data.project.workspaceVersion!==2)add("legacy","Existing project records","Review unmigrated estimates, invoices and payments separately. This register cannot certify the old workflow.","estimate");
  for(const c of data.costs)if(c.remainingToInvoiceMinor>0)add(`cost-${c.id}`,c.description,c.commitmentStatus==="PLANNED"?"Planned work still needs booking or a revised remaining-work forecast.":"Unbilled work remains. Confirm the final cost or update remaining work.","live");
  for(const i of data.invoices) {
    if(i.status==="VOID")continue;
    if(i.status==="DRAFT")add(`invoice-${i.id}`,`${i.supplier} · ${i.number}`,`Draft ${i.kind==="CREDIT"?"credit note":"invoice"}: review, allocate and approve.${!i.documentUrl?" Source document missing.":""}`,"invoices");
    if(i.status==="APPROVED"&&i.balanceMinor>0)add(`pay-${i.id}`,i.number,`${i.dueDate&&i.dueDate.toISOString().slice(0,10)<new Date().toISOString().slice(0,10)?"Overdue":"Outstanding"} · ${money(i.balanceMinor)} incl. tax`,"invoices");
    if(i.status==="APPROVED"&&i.refundDueMinor>0)add(`refund-${i.id}`,i.number,"A supplier refund is still due.","invoices");
    if(i.possibleDuplicates.length&&!i.reviewNote)add(`duplicate-${i.id}`,i.number,`Possible duplicate of ${i.possibleDuplicates.map(d=>d.number).join(", ")}: same supplier, date and amounts. Review the source documents and record a reason if both are valid.`,"invoices");
    if(i.overPo.length&&!i.reviewNote)add(`over-po-${i.id}`,i.number,`Invoiced cost exceeds ${[...new Set(i.overPo.map(p=>p.poNumber))].join(", ")}. Review and record the agreement.`,"invoices");
  }
  const document=(key:string,label:string,status:string,file:{driveSyncStatus:string}|null,view:string)=>{
    if(status!=="READY"||file?.driveSyncStatus!=="SYNCED")add(key,label,"Issued document is not yet confirmed in Drive. Review Files & publishing.",view);
  };
  for(const po of data.purchaseOrders){if(po.status==="DRAFT")add(`po-${po.id}`,po.poNumber,"Supplier PO remains a draft. Issue or cancel it.","pos");if(po.status==="ISSUED")document(`po-file-${po.id}`,po.poNumber,po.documentStatus,po.pdfJobFile,"pos");}
  for(const i of data.clientInvoices){if(i.status==="DRAFT")add(`client-draft-${i.id}`,i.number,"Client invoice or credit note remains a draft.","billing");if(i.status==="ISSUED"){if(i.balanceMinor!==0)add(`client-cash-${i.id}`,i.number,i.balanceMinor>0?"Client payment is outstanding.":"A client refund is still due.","billing");document(`client-file-${i.id}`,i.number,i.documentStatus,i.pdfJobFile,"billing");}}
  if((data.clientBilling.remainingNetMinor||0)>0)add("unbilled","Client billing","Approved revenue remains unbilled. Issue the final invoice or review the approved scope.","billing");
  if(data.clientBilling.overBilledNetMinor>0)add("overbilled","Client billing","Issued revenue exceeds the latest approval.","billing");
  return items;
}
// Drive checks are explicit and separate from the fast ledger endpoint. Never silently
// call missing/unavailable or partially scanned source documents reconciled.
export async function readReconciliation(productionId:string) {
  const data=await readFinance(productionId);
  const items=financialCloseItems(data);
  let scannedFiles=0,driveComplete=false;
  try {
    let token:string|undefined;let hasNested=false;
    for(let pageNumber=0;pageNumber<10;pageNumber++) {
      const page=await invoiceInbox(productionId,token);
      if(!page.folderUrl){items.push({key:"drive-folder",label:"Supplier documents",detail:page.message||"Link the project's supplier invoice folder.",view:"invoices"});break;}
      scannedFiles+=page.files.length;
      for(const file of page.files)if(!file.linked)items.push({key:`drive-${file.id}`,label:file.name,detail:"Drive document has not been reviewed into the supplier register.",view:"invoices"});
      if("subfolderCount" in page&&page.subfolderCount){hasNested=true;items.push({key:`subfolders-${pageNumber}`,label:"Invoice subfolders",detail:"Documents in nested folders need manual review. The inbox scans direct files only.",view:"invoices"});}
      token="nextPageToken" in page?page.nextPageToken:undefined;
      if(!token){driveComplete=!hasNested;break;}
    }
    if(token)items.push({key:"drive-incomplete",label:"Supplier documents",detail:"More Drive pages remain. Review the invoice folder; this check is incomplete.",view:"invoices"});
    const approved=[...data.invoices.filter(i=>i.status==="APPROVED").map(i=>({id:i.id,number:i.number,driveFileId:i.driveFileId,documentUrl:i.documentUrl,view:"invoices"})),...data.purchaseOrders.filter(p=>p.status==="ISSUED"&&p.pdfJobFile?.driveSyncStatus==="SYNCED").map(p=>({id:p.id,number:p.poNumber,driveFileId:p.pdfJobFile!.driveFileId,documentUrl:p.pdfJobFile!.driveWebViewLink,view:"pos"})),...data.clientInvoices.filter(i=>i.status==="ISSUED"&&i.pdfJobFile?.driveSyncStatus==="SYNCED").map(i=>({id:i.id,number:i.number,driveFileId:i.pdfJobFile!.driveFileId,documentUrl:i.pdfJobFile!.driveWebViewLink,view:"billing"}))];
    if(approved.length>100){driveComplete=false;items.push({key:"source-limit",label:"Source documents",detail:"More than 100 approved sources need review. This check is incomplete.",view:"invoices"});}
    for(let start=0;start<Math.min(100,approved.length);start+=5)await Promise.all(approved.slice(start,Math.min(start+5,100)).map(async invoice=>{
      try {await verifyInvoiceFile(productionId,invoice.driveFileId||documentIdentity(invoice.documentUrl)||"");}
      catch {items.push({key:`source-${invoice.id}`,label:invoice.number,detail:"Source document is missing, inaccessible or outside this project's Drive folder.",view:invoice.view});}
    }));
  } catch {items.push({key:"drive-error",label:"Drive verification",detail:"Could not finish checking Drive. Reconnect or retry; documents are not verified.",view:"invoices"});driveComplete=false;}
  return {checkedAt:new Date().toISOString(),currency:data.currency,items,drive:{complete:driveComplete,scannedFiles},readyForFinalReview:items.length===0&&driveComplete,
    summary:{approvedRevenueMinor:data.approval?.clientTotalMinor??null,forecastCostMinor:data.totals.forecastMinor,expectedProfitMinor:data.approval?data.approval.clientTotalMinor-data.totals.forecastMinor:null,clientReceivableMinor:data.clientBilling.outstandingGrossMinor,supplierPayableMinor:data.totals.outstandingGrossMinor,supplierRefundDueMinor:data.totals.refundDueGrossMinor,clientRefundDueMinor:data.clientBilling.refundDueGrossMinor}};
}
