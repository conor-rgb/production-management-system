import { Prisma } from "@prisma/client";
import { FinanceError } from "./projectFinance";
export const supplierInvoiceInclude = {
  allocations:true,
  originalInvoice:{select:{id:true,number:true}},
  credits:{where:{kind:"CREDIT",status:"APPROVED"},include:{allocations:true}},
  payments:{orderBy:{createdAt:"asc" as const}},
};
type SupplierAmounts={kind:string;netMinor:number;taxMinor:number;credits:{netMinor:number;taxMinor:number}[];payments:{amountMinor:number;direction:string;reversedAt:Date|null}[]};
export function supplierBalance(invoice:SupplierAmounts) {
  const creditedNetMinor=invoice.credits.reduce((s,c)=>s+c.netMinor,0),creditedTaxMinor=invoice.credits.reduce((s,c)=>s+c.taxMinor,0);
  const paidMinor=invoice.payments.filter(p=>!p.reversedAt&&p.direction==="PAYMENT").reduce((s,p)=>s+p.amountMinor,0);
  const refundedMinor=invoice.payments.filter(p=>!p.reversedAt&&p.direction==="REFUND").reduce((s,p)=>s+p.amountMinor,0);
  const balanceMinor=invoice.kind==="CREDIT"?0:invoice.netMinor+invoice.taxMinor-creditedNetMinor-creditedTaxMinor-paidMinor+refundedMinor;
  return {creditedNetMinor,creditedTaxMinor,paidMinor,refundedMinor,balanceMinor,refundDueMinor:Math.max(0,-balanceMinor)};
}
export function costAmounts(committedMinor:number,remainingOverride:number|null,allocations:{netMinor:number;kind:string}[]) {
  const billedBeforeCreditsMinor=allocations.filter(a=>a.kind!=="CREDIT").reduce((s,a)=>s+a.netMinor,0);
  const creditedMinor=allocations.filter(a=>a.kind==="CREDIT").reduce((s,a)=>s+a.netMinor,0);
  const invoicedMinor=billedBeforeCreditsMinor-creditedMinor;
  // A credit reduces actual cost; it must not silently reinstate unbilled work.
  const remainingToInvoiceMinor=remainingOverride??Math.max(0,committedMinor-billedBeforeCreditsMinor);
  return {billedBeforeCreditsMinor,creditedMinor,invoicedMinor,remainingToInvoiceMinor,forecastMinor:invoicedMinor+remainingToInvoiceMinor};
}
export function documentIdentity(value:string|null|undefined) {
  if(!value)return null;
  try {const url=new URL(value);return url.pathname.match(/\/d\/([\w-]+)/)?.[1]||url.searchParams.get("id")||`${url.hostname}${url.pathname.replace(/\/$/,"")}`;}catch{return value;}
}
export async function checkSupplierCredit(tx:Prisma.TransactionClient,productionId:string,credit:{originalInvoiceId:string|null;netMinor:number;taxMinor:number;invoiceDate:Date;allocations?:{costId:string;netMinor:number}[]}) {
  const original=await tx.projectSupplierInvoice.findFirst({where:{id:credit.originalInvoiceId||"",productionId,status:"APPROVED",kind:"INVOICE"},include:supplierInvoiceInclude});
  if(!original)throw new FinanceError("Select an approved original invoice in this project.");
  const balance=supplierBalance(original);
  if(credit.netMinor>original.netMinor-balance.creditedNetMinor||credit.taxMinor>original.taxMinor-balance.creditedTaxMinor)throw new FinanceError("Credit exceeds the original invoice's remaining net or tax.");
  if(credit.invoiceDate<original.invoiceDate)throw new FinanceError("Credit date cannot precede the original invoice date.");
  for(const allocation of credit.allocations||[]) {
    const originalNet=original.allocations.find(a=>a.costId===allocation.costId)?.netMinor||0;
    const already=original.credits.flatMap(c=>c.allocations).filter(a=>a.costId===allocation.costId).reduce((s,a)=>s+a.netMinor,0);
    if(allocation.netMinor>originalNet-already)throw new FinanceError("Credit allocations must fit the original invoice's remaining amounts on each cost.");
  }
  return original;
}
