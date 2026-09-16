import { Prisma } from "@prisma/client";

// The production row lock coordinates legacy and live-register PO numbering.
export async function reservePurchaseOrderNumber(tx: Prisma.TransactionClient, productionId: string) {
  for (let attempts=0; attempts<10000; attempts++) {
    const project=await tx.production.update({where:{id:productionId},data:{lastPoSequence:{increment:1}},select:{jobCode:true,lastPoSequence:true}});
    const poNumber=`PO-${project.jobCode||"OPP"}-${String(project.lastPoSequence).padStart(3,"0")}`;
    const exists=await tx.purchaseOrderGroup.findUnique({where:{productionId_poNumber:{productionId,poNumber}},select:{id:true}});
    const legacy=await tx.subCost.findFirst({where:{poNumber},select:{id:true}});
    if(!exists&&!legacy)return poNumber;
  }
  throw new Error("PO sequence needs review before another number can be reserved.");
}
