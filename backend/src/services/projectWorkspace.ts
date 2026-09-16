import { createHash } from "node:crypto";
import prisma from "../prisma";
import { FinanceError, text } from "./projectFinance";
import { driveClient } from "./driveStorage";
import { getRevision } from "./budgetService";
import { exportRevisionPdf } from "./budgetPdf";

export const starters: Record<string, { label: string; sections: [string, string[]][] }> = {
  STILLS: { label: "Stills shoot", sections: [["Creative & preparation", ["Photographer", "Producer", "Pre-production"]], ["Crew & equipment", ["Assistants", "Lighting", "Digital capture"]], ["Talent & location", ["Talent", "Location", "Styling"]], ["Travel & post", ["Travel", "Catering", "Retouching"]]] },
  MOTION: { label: "Motion campaign", sections: [["Preparation", ["Director", "Producer", "Pre-production"]], ["Shoot", ["Camera crew", "Lighting", "Sound", "Equipment"]], ["Talent & location", ["Talent", "Location", "Art department"]], ["Post-production", ["Editing", "Grade", "Sound mix"]]] },
  EVENTS: { label: "Event", sections: [["Planning", ["Producer", "Creative"]], ["Production", ["Venue", "Crew", "AV equipment", "Build"]], ["Delivery", ["Travel", "Catering", "Photography"]]] },
  BLANK: { label: "Simple project", sections: [["Production", []]] },
};
export const destinations: Record<string,string> = { Briefs:"01 Brief & scope", Estimates:"02 Client estimates", Budgets:"03 Internal finance", Contracts:"04 Supplier POs & contracts", "Crew Deals":"04 Supplier POs & contracts", Invoices:"05 Supplier invoices", Receipts:"05 Supplier invoices", "Client Invoices":"06 Client invoices", References:"07 Production documents", Selects:"07 Production documents", "Mail Attachments":"07 Production documents", Delivery:"08 Deliverables", Reconciliation:"09 Reconciliation" };
const include = { sections: { orderBy: { order: "asc" as const }, include: { lineItems: { orderBy: { order: "asc" as const } } } } };
const fingerprint = (body: unknown) => createHash("sha256").update(JSON.stringify(body)).digest("hex");
const optional = (value: unknown, max=3000) => typeof value === "string" ? value.trim().slice(0,max) : "";
function number(value: unknown, label: string, max=1_000_000) { const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; if (!Number.isFinite(n) || n < 0 || n > max || Math.abs(n*100-Math.round(n*100))>0.00001) throw new FinanceError(`${label} must be between 0 and ${max}, with up to two decimals.`); return n; }
export async function createWorkspace(body: Record<string,unknown>) {
  const requestId = text(body.requestId,"Request ID",100); const hash = fingerprint(body);
  const existing = await prisma.production.findUnique({where:{creationRequestId:requestId}});
  if(existing) { if(existing.creationHash!==hash) throw new FinanceError("This creation request was already used. Start a new request.",409); return existing; }
  const title=text(body.title,"Project name",200); const template=String(body.template||"STILLS");
  if(!starters[template]) throw new FinanceError("Choose a project template.");
  const currency=String(body.currency||"GBP"); if(!["GBP","EUR","USD","CHF","CAD","AUD"].includes(currency)) throw new FinanceError("Unsupported currency.");
  const used=new Set<string>();
  // Read existing project codes before allocating; never infer that a matching folder belongs to this project.
  if(body.createDrive!==false) {
    const {client,connection}=await driveClient(); let token: string|undefined;
    do { const page=await client.children(connection.rootFolderId,token,true); page.files.forEach(f=>{const code=f.name.match(/^(\d{4,})\b/)?.[1];if(code)used.add(code);}); token=page.nextPageToken; } while(token);
  }
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('project-job-code'))`;
    const repeat=await tx.production.findUnique({where:{creationRequestId:requestId}});
    if(repeat) { if(repeat.creationHash!==hash)throw new FinanceError("Creation request changed.",409); return repeat; }
    const settings=await tx.settings.findFirst({orderBy:{createdAt:"asc"}}); if(!settings)throw new FinanceError("Workspace settings are missing.");
    const year=new Date().getFullYear(); let seq=settings.jobCodeYear===year?settings.jobCodeSequence:0; let jobCode:string;
    do {jobCode=`${String(year).slice(2)}${String(++seq).padStart(2,"0")}`;} while(used.has(jobCode)||await tx.production.findUnique({where:{jobCode},select:{id:true}}));
    await tx.settings.update({where:{id:settings.id},data:{jobCodeYear:year,jobCodeSequence:seq}});
    const project=await tx.production.create({data:{title,clientName:optional(body.clientName,200),brand:optional(body.brand,200),jobCode,jobType:template==="BLANK"?"STILLS":template as "STILLS"|"MOTION"|"EVENTS",workspaceVersion:2,creationRequestId:requestId,creationHash:hash,starterTemplate:template,driveSetupStatus:body.createDrive===false?"NOT_REQUESTED":"PENDING"}});
    const budget=await tx.budget.create({data:{productionId:project.id,currencyBase:currency,jobName:title}});
    const revision=await tx.budgetRevision.create({data:{budgetId:budget.id,revisionNumber:1,paymentTerms:"50% deposit required before shoot.",sections:{create:starters[template].sections.map(([name,lines],index)=>({code:String.fromCharCode(65+index),name,order:index,lineItems:{create:lines.map((description,i)=>({description,lineCode:`${String.fromCharCode(65+index)}${i+1}`,order:i}))}}))}}});
    await tx.budget.update({where:{id:budget.id},data:{currentRevisionId:revision.id}});
    return project;
  },{timeout:15000});
}
export async function processProjectSetups() {
  const pending=await prisma.production.findMany({where:{driveSetupStatus:"PENDING"},take:3,select:{id:true}}); if(!pending.length)return;
  let access: Awaited<ReturnType<typeof driveClient>>;
  try { access=await driveClient(); } catch { await prisma.production.updateMany({where:{id:{in:pending.map(p=>p.id)},driveSetupStatus:"PENDING"},data:{driveSetupStatus:"ERROR",driveSetupError:"Reconnect Google Drive in Files, then retry project folder setup."}}); return; }
  const {client,connection}=access;
  for(const {id} of pending) {
    try {await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`drive:${id}`}))`;
      const p=await tx.production.findUniqueOrThrow({where:{id}}); if(p.driveSetupStatus!=="PENDING")return;
      const root=await client.ensureTaggedFolder(connection.rootFolderId,`${p.jobCode} | ${p.title}`,id);
      await client.withinRoot(root.id,connection.rootFolderId);
      const mapped=new Map<string,string>();
      for(const [category,name] of Object.entries(destinations)) {
        let folder=mapped.get(name); if(!folder) { folder=(await client.ensureTaggedFolder(root.id,name,`${id}:${name}`)).id; mapped.set(name,folder); }
        await tx.projectDriveFolder.upsert({where:{productionId_category:{productionId:id,category}},create:{productionId:id,category,driveFolderId:folder},update:{driveFolderId:folder}});
      }
      await tx.production.update({where:{id},data:{driveFolderId:root.id,driveFolderName:root.name,driveSetupStatus:"READY",driveSetupError:null}});
    },{timeout:240000,maxWait:5000});} catch(e) {await prisma.production.updateMany({where:{id,driveSetupStatus:"PENDING"},data:{driveSetupStatus:"ERROR",driveSetupError:e instanceof Error?e.message.slice(0,300):"Folder setup failed. Retry."}});}
  }
}
export async function readWorkspace(id:string) {
  const project=await prisma.production.findUnique({where:{id},select:{id:true,title:true,workspaceVersion:true,driveFolderId:true,driveSetupStatus:true,driveSetupError:true,driveFolders:true,budgets:{select:{id:true,currentRevisionId:true,currencyBase:true}},estimateApprovals:{orderBy:{approvedAt:"desc"},select:{revisionId:true,revisionNumber:true,clientTotalMinor:true,plannedCostMinor:true,approvedAt:true}}}});
  if(!project||project.workspaceVersion!==2)throw new FinanceError("New project workspace not found.",404);
  const budget=project.budgets[0]; const revision=budget?.currentRevisionId?await getRevision(budget.currentRevisionId):null;
  const revisions=budget?await prisma.budgetRevision.findMany({where:{budgetId:budget.id},orderBy:{revisionNumber:"desc"},select:{id:true,revisionNumber:true,status:true,isLocked:true}}):[];
  return {project,currency:budget?.currencyBase,revision,revisions};
}
export async function changeEstimate(id:string,actorId:string,action:string,body:Record<string,unknown>) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance:${id}`}))`;
    const p=await tx.production.findUnique({where:{id},include:{budgets:true}}); if(!p||p.workspaceVersion!==2)throw new FinanceError("Project not found.",404);
    const budget=p.budgets[0]; if(!budget?.currentRevisionId)throw new FinanceError("Estimate missing.");
    const r=await tx.budgetRevision.findUniqueOrThrow({where:{id:budget.currentRevisionId},include});
    if(body.revisionId!==r.id||body.editVersion!==r.editVersion)throw new FinanceError("The estimate changed. Refresh before continuing.",409);
    if(action==="version") {
      if(!r.isLocked)throw new FinanceError("Finish the current draft before starting another version.");
      const {id:oldId,budgetId,createdAt,updatedAt,sections,...copy}=r;
      const next=await tx.budgetRevision.create({data:{...copy,budgetId,revisionNumber:r.revisionNumber+1,majorVersion:r.majorVersion+1,minorVersion:0,label:`Revision ${r.revisionNumber+1}`,sourceRevisionId:oldId,status:"DRAFT",isLocked:false,lockedAt:null,editVersion:1,sections:{create:sections.map(s=>({code:s.code,name:s.name,order:s.order,lineItems:{create:s.lineItems.map(l=>({lineCode:l.lineCode,description:l.description,qty:l.qty,days:l.days,rate:l.rate,estimatedTotal:l.estimatedTotal,plannedUnitCost:l.plannedUnitCost,plannedSupplier:l.plannedSupplier,stableCostKey:l.stableCostKey,order:l.order,clientNotes:l.clientNotes,internalNotes:l.internalNotes}))}}))}}});
      await tx.budget.update({where:{id:budget.id},data:{currentRevisionId:next.id}});return {id:next.id};
    }
    if(action==="approve"&&await tx.projectEstimateApproval.findUnique({where:{revisionId:r.id}}))return {id:r.id};
    if(r.isLocked)throw new FinanceError("This estimate is frozen. Start a new version to change it.",409);
    if(action==="save") {
      if(!Array.isArray(body.sections)||body.sections.length!==r.sections.length)throw new FinanceError("Refresh the estimate sections.");
      const seen=new Set<string>(); let count=0;
      for(const raw of body.sections) {
        const s=raw as {id:string;name:unknown;lineItems:Record<string,unknown>[]};
        const original=r.sections.find(v=>v.id===s.id);if(!original||seen.has(s.id)||!Array.isArray(s.lineItems))throw new FinanceError("Invalid section.");seen.add(s.id);
        await tx.budgetSection.update({where:{id:s.id},data:{name:text(s.name,"Section",200)}});
        const ids:string[]=[];
        for(const [i,l] of s.lineItems.entries()) {
          if(++count>500)throw new FinanceError("Use up to 500 estimate lines.");
          const old=original.lineItems.find(o=>o.id===l.id); if(l.id&&!old)throw new FinanceError("Estimate row does not belong to this section.");
          const qty=number(l.qty,"Quantity",10000),days=number(l.days,"Days",10000),rate=number(l.rate,"Client rate");
          const plannedUnitCost=l.plannedUnitCost===null||l.plannedUnitCost===""?null:number(l.plannedUnitCost,"Planned rate");
          const estimatedTotal=Math.round(qty*days*rate*100)/100;
          if(estimatedTotal>10_000_000||qty*days*(plannedUnitCost||0)>10_000_000)throw new FinanceError("Line total exceeds the supported range.");
          const data={description:text(l.description,"Line description",500),qty,days,rate,plannedUnitCost,plannedSupplier:optional(l.plannedSupplier,200),estimatedTotal,order:i,lineCode:`${original.code}${i+1}`};
          if(old) {if(ids.includes(old.id))throw new FinanceError("Duplicate estimate row.");await tx.budgetLineItem.update({where:{id:old.id},data});ids.push(old.id);}
          else ids.push((await tx.budgetLineItem.create({data:{...data,sectionId:s.id}})).id);
        }
        await tx.budgetLineItem.deleteMany({where:{sectionId:s.id,id:{notIn:ids}}});
      }
      await tx.budgetRevision.update({where:{id:r.id},data:{productionFeePercent:number(body.productionFeePercent,"Production fee",100),insurancePercent:number(body.insurancePercent,"Insurance",100),assumptions:optional(body.assumptions),paymentTerms:optional(body.paymentTerms),notes:optional(body.notes),editVersion:{increment:1}}});return {id:r.id};
    }
    if(action!=="approve")throw new FinanceError("Unknown estimate action.");
    const lines=r.sections.flatMap(s=>s.lineItems); if(!lines.length||lines.some(l=>l.qty*l.days>0&&l.plannedUnitCost===null))throw new FinanceError("Enter a planned supplier rate for every active line, or use zero where there is no cost.");
    const subtotal=lines.reduce((sum,l)=>sum+Math.round(l.estimatedTotal*100),0);
    const fee=r.productionFeeEnabled?Math.round(subtotal*r.productionFeePercent/100):0;
    const insurance=r.insuranceEnabled?Math.round((subtotal+fee)*r.insurancePercent/100):0;
    const clientTotalMinor=subtotal+fee+insurance; const plannedCostMinor=lines.reduce((sum,l)=>sum+Math.round(l.qty*l.days*(l.plannedUnitCost||0)*100),0);
    if(clientTotalMinor<=0||clientTotalMinor>1_000_000_000||plannedCostMinor>1_000_000_000)throw new FinanceError("Estimate total must be positive and totals cannot exceed 10 million.");
    const ledger=await tx.projectFinanceLedger.upsert({where:{productionId:id},create:{productionId:id,currency:budget.currencyBase},update:{}}); if(ledger.currency!==budget.currencyBase)throw new FinanceError("Estimate and live cost currencies differ.");
    for(const line of lines) {
      const supplier=line.plannedSupplier||"Unassigned";
      await tx.projectFinanceCost.upsert({where:{productionId_estimateLineKey:{productionId:id,estimateLineKey:line.stableCostKey}},create:{productionId:id,estimateLineKey:line.stableCostKey,description:line.description,supplier,supplierKey:supplier.normalize("NFKC").toLocaleLowerCase("en-GB").replace(/\s+/g," ").trim(),commitmentStatus:"PLANNED",committedMinor:Math.round(line.qty*line.days*(line.plannedUnitCost||0)*100)},update:{}});
    }
    await tx.projectEstimateApproval.create({data:{productionId:id,revisionId:r.id,revisionNumber:r.revisionNumber,currency:budget.currencyBase,clientTotalMinor,plannedCostMinor,snapshot:JSON.parse(JSON.stringify(r)),approvedBy:actorId}});
    await tx.production.update({where:{id},data:{value:clientTotalMinor/100}});
    await tx.budgetRevision.update({where:{id:r.id},data:{status:"APPROVED",isLocked:true,lockedAt:new Date()}});
    await tx.projectFinanceOperation.create({data:{productionId:id,requestId:`estimate-${r.id}`,payloadHash:fingerprint(r),action:"estimate.approve",actorId,detail:{revisionId:r.id,clientTotalMinor,plannedCostMinor},result:{id:r.id}}});
    return {id:r.id};
  },{timeout:20000});
}
// PDFs are immutable dated exports; editing native Drive documents never rewrites an approved budget.
export async function exportWorkspace(id:string,revisionId:string) {
  const r=await prisma.budgetRevision.findFirst({where:{id:revisionId,budget:{productionId:id,production:{workspaceVersion:2}}}}); if(!r)throw new FinanceError("Estimate not found.",404);
  return exportRevisionPdf(r.id,"client");
}
