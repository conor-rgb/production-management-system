import PDFDocument from "pdfkit";
import { drawBrandLogo } from "./pdfBrand";
// Client-facing allowlist: never load costs, margins, project notes or bank credentials.
export type ClientInvoiceDocument={originalNumber?:string;originalDate?:string;number:string;kind:string;clientName:string;billingAddress:string;description:string;paymentInstructions:string;invoiceDate:string;dueDate:string;netMinor:number;taxMinor:number;projectTitle:string;jobCode:string|null;currency:string;draft:boolean};
export async function renderClientInvoicePdf(data:ClientInvoiceDocument):Promise<Buffer> {
  const doc=new PDFDocument({size:"A4",margins:{top:55,bottom:65,left:52,right:52},bufferPages:true});
  const chunks:Buffer[]=[];doc.on("data",c=>chunks.push(c));
  const complete=new Promise<Buffer>((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
  const money=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:data.currency}).format(minor/100);
  const credit=data.kind==="CREDIT";
  drawBrandLogo(doc,52,55,235);
  doc.font("Helvetica-Bold").fontSize(12).text(credit?data.draft?"DRAFT CREDIT NOTE":"CREDIT NOTE":data.draft?"DRAFT INVOICE":"INVOICE",320,60,{width:220,align:"right"});
  doc.font("Helvetica").fontSize(10).text(data.number,320,83,{width:220,align:"right"});doc.y=130;
  const paragraph=(label:string,value:string)=>{doc.x=52;if(doc.y>690)doc.addPage();doc.font("Helvetica-Bold").fontSize(9).text(label,{width:490});doc.moveDown(.3);doc.font("Helvetica").fontSize(10).text(value,{width:490,lineGap:3});doc.moveDown(.8);};
  paragraph("From","BOND UN LIMITED trading as unlimited.bond\n128 City Road, London EC1V 2NX\nCompany 16215041 · VAT GB 493336372");
  paragraph("Bill to",`${data.clientName}\n${data.billingAddress}`);
  paragraph("Project",`${data.jobCode||""} · ${data.projectTitle}`);
  if(data.originalNumber)paragraph(credit?"Credit against invoice":"Replaces invoice",`${data.originalNumber}${data.originalDate?" · "+data.originalDate.slice(0,10):""}`);
  paragraph(credit?"Credit date":"Invoice date / due date",credit?data.invoiceDate.slice(0,10):`${data.invoiceDate.slice(0,10)} / ${data.dueDate.slice(0,10)}`);
  paragraph(credit?"Reason for credit":`${data.kind.charAt(0)+data.kind.slice(1).toLowerCase()} invoice`,data.description);
  paragraph(`Amounts (${data.currency})`,`Net: ${money(data.netMinor)}\nTax: ${money(data.taxMinor)}\n${credit?"Total credited":"Total due"}: ${money(data.netMinor+data.taxMinor)}`);
  if(credit)paragraph("Credit application","This credit reduces the invoice referenced above. Any refund is recorded separately; this document does not confirm that a refund has been paid.");
  else {paragraph("Payment instructions",data.paymentInstructions);paragraph("Payment reference",data.number); }
  if(data.draft)paragraph("Draft only",credit?"For review. This is not an issued credit note.":"For review. This is not an issued invoice.");
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font("Helvetica").fontSize(8).fillColor("#666666").text(`${data.number} · ${i+1}/${range.count}`,52,795,{width:490,lineBreak:false});doc.page.margins.bottom=bottom;}
  doc.end();return complete;
}
