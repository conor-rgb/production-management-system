import { documentIdentity } from "./supplierFinance";
import prisma from "../prisma";
import { driveClient } from "./driveStorage";
import { DRIVE_FOLDER } from "./driveClient";
import { FinanceError } from "./projectFinance";
export async function invoiceInbox(productionId:string,pageToken?:string) {
  const folder=await prisma.projectDriveFolder.findUnique({where:{productionId_category:{productionId,category:"Invoices"}}});
  if(!folder)return {files:[],folderUrl:null,message:"The project invoice folder will appear after Drive setup finishes."};
  const p=await prisma.production.findUniqueOrThrow({where:{id:productionId},select:{driveFolderId:true}});
  const {client,connection}=await driveClient();
  await client.withinRoot(folder.driveFolderId,p.driveFolderId!);await client.withinRoot(p.driveFolderId!,connection.rootFolderId);
  const page=await client.children(folder.driveFolderId,pageToken);
  const linked=await prisma.projectSupplierInvoice.findMany({where:{productionId,OR:[{driveFileId:{in:page.files.map(f=>f.id)}},{documentUrl:{not:null}}]},select:{id:true,driveFileId:true,documentUrl:true}});
  return {...page,subfolderCount:page.files.filter(f=>f.mimeType===DRIVE_FOLDER).length,folderUrl:`https://drive.google.com/drive/folders/${folder.driveFolderId}`,files:page.files.filter(f=>f.mimeType!==DRIVE_FOLDER).map(f=>({...f,linked:linked.some(i=>i.driveFileId===f.id||documentIdentity(i.documentUrl)===f.id),linkedRecordId:linked.find(i=>i.driveFileId===f.id||documentIdentity(i.documentUrl)===f.id)?.id}))};
}
export async function verifyInvoiceFile(productionId:string,fileId:string) {
  if(!/^[\w-]{10,200}$/.test(fileId))throw new FinanceError("Invalid invoice file.");
  const p=await prisma.production.findUnique({where:{id:productionId},select:{driveFolderId:true}});if(!p?.driveFolderId)throw new FinanceError("Link this project's Drive folder first.");
  const {client,connection}=await driveClient();const file=await client.metadata(fileId);
  if(file.trashed||file.mimeType===DRIVE_FOLDER||!file.parents?.[0])throw new FinanceError("Choose an available invoice document.");
  await client.withinRoot(p.driveFolderId,connection.rootFolderId);await client.withinRoot(file.parents[0],p.driveFolderId);
  return file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`;
}
