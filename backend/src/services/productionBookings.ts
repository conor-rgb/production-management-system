import { Prisma, CrewStatus } from '@prisma/client';
import prisma from '../prisma';
import { FinanceError, text } from './projectFinance';
import { fxInput, readFx } from './financeFx';
export async function readBookings(productionId:string){
 const project=await prisma.production.findUnique({where:{id:productionId},select:{budgets:{select:{currencyBase:true}},dates:{orderBy:{date:'asc'},select:{id:true,date:true,label:true,dateType:true,status:true,location:true}},crewMembers:{include:{financeCost:true,role:true},orderBy:{name:'asc'}}}});
 if(!project)throw new FinanceError('Project not found.',404);
 return {currency:project.budgets[0]?.currencyBase||'GBP',dates:project.dates,crew:project.crewMembers.map(c=>({...c,issues:bookingIssues(c,project.dates)})),costs:await prisma.projectFinanceCost.findMany({where:{productionId,crewMemberId:null,activePurchaseOrderId:null},select:{id:true,description:true,supplier:true,commitmentStatus:true}})};
}
export function bookingIssues(crew:{name:string;status:string;bookedDates:unknown;financeCost:{commitmentStatus:string;remainingMinor:number|null;activePurchaseOrderId:string|null}|null},dates:{id:string;status:string}[]){
 if(!crew.financeCost)return [];
 const ids=Array.isArray(crew.bookedDates)?crew.bookedDates as string[]:[];const issues:string[]=[];
 if(!ids.length)issues.push('No booked dates');
 if(ids.some(id=>!dates.some(d=>d.id===id&&!['CANCELLED','RELEASED'].includes(d.status))))issues.push('A booked date was removed or released');
 if(['FIRST_OPTION','SECOND_OPTION','REQUESTED'].includes(crew.status)&&crew.financeCost.commitmentStatus==='COMMITTED')issues.push('Option status differs from the committed cost');
 if(crew.status==='CONFIRMED'&&crew.financeCost.commitmentStatus!=='COMMITTED')issues.push('Confirmed booking needs a committed cost');
 if(crew.status==='RELEASED'&&(crew.financeCost.activePurchaseOrderId||crew.financeCost.remainingMinor!==0))issues.push('Released booking still has committed or remaining work');
 return issues;
}
export async function writeBooking(tx:Prisma.TransactionClient,productionId:string,body:Record<string,unknown>,currency:string){
 const crew=body.crewId?await tx.crewMember.findFirst({where:{id:text(body.crewId,'Crew member'),productionId},include:{financeCost:{include:{allocations:true}}}}):null;
 if(body.crewId&&!crew)throw new FinanceError('Crew member not found.',404);
 if(crew&&(body.bookingVersion!==crew.bookingVersion||body.updatedAt!==crew.updatedAt.toISOString()))throw new FinanceError('Booking changed. Refresh before saving.',409);
 const status=String(body.status||'FIRST_OPTION') as CrewStatus;if(!['FIRST_OPTION','SECOND_OPTION','CONFIRMED','RELEASED'].includes(status))throw new FinanceError('Choose optioned, confirmed or released.');
 if(!Array.isArray(body.dateIds)||body.dateIds.length>90)throw new FinanceError('Choose up to 90 dates.');
 const ids=body.dateIds.map(v=>text(v,'Booked date'));if(new Set(ids).size!==ids.length||(!ids.length&&status!=='RELEASED'))throw new FinanceError('Choose distinct project dates.');
 const dates=await tx.productionDate.findMany({where:{productionId,id:{in:ids}}});if(dates.length!==ids.length||status!=='RELEASED'&&dates.some(d=>['CANCELLED','RELEASED'].includes(d.status)))throw new FinanceError('Choose available dates in this project.');
 const day=fxInput(body.fx,currency,body.dayRate);const source=readFx(day.fx);const totalSource=((source?.netMinor??day.netMinor)*ids.length/100).toFixed(2);const total=fxInput(body.fx,currency,totalSource);
 const name=crew?.name??text(body.name,'Crew name');const supplier=text(body.supplier||name,'Supplier');const supplierKey=supplier.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/\s+/g,' ').trim();const description=text(body.description,'Role / cost description',500);
 const linked=crew?.financeCost;const cost=linked??(body.costId?await tx.projectFinanceCost.findFirst({where:{id:text(body.costId,'Cost'),productionId,crewMemberId:null},include:{allocations:true}}):null);
 if(body.costId&&!linked&&!cost)throw new FinanceError('Choose an unlinked project cost.');
 if(cost?.activePurchaseOrderId)throw new FinanceError('This booking has an active PO. Cancel or amend the agreement before changing the booking.');
 if(cost?.allocations.length&&cost.supplierKey!==supplierKey)throw new FinanceError('A booking with invoice allocations cannot change supplier.');
 if(status==='RELEASED'&&!linked)throw new FinanceError('Only a linked booking can be released.');
 const member=crew?await tx.crewMember.update({where:{id:crew.id},data:{status,bookedDates:ids,dayRate:status==='RELEASED'?crew.dayRate:day.netMinor/100,numberOfDays:ids.length,bookingVersion:{increment:1}}}):await tx.crewMember.create({data:{productionId,name,status,bookedDates:ids,dayRate:day.netMinor/100,numberOfDays:ids.length}});
 const data={crewMemberId:member.id,description,supplier,supplierKey,commitmentStatus:status==='CONFIRMED'?'COMMITTED':'PLANNED',...(status==='RELEASED'?{remainingMinor:0}:{committedMinor:total.netMinor,fx:total.fx,remainingMinor:null})};
 const result=cost?await tx.projectFinanceCost.update({where:{id:cost.id},data:{...data,version:{increment:1}}}):await tx.projectFinanceCost.create({data:{productionId,committedMinor:total.netMinor,...data}});
 return {result:{id:result.id,version:result.version},before:{crew,cost}};
}
