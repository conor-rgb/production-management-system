import { processClientInvoiceDocuments } from "./clientBilling";
import { processPurchaseOrderDocuments } from "./financePurchaseOrders";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../prisma";
import { decrypt } from "./encryptionService";
import { processProjectSetups } from "./projectWorkspace";
import { DriveClient } from "./driveClient";

export async function driveClient() {
  const connection = await prisma.driveConnection.findUnique({ where: { id: "workspace" } });
  if (!connection) throw new Error("Connect Google Drive in Files first.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", refresh_token: decrypt(connection.refreshToken), grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const token = await response.json() as { access_token?: string };
  if (!response.ok || !token.access_token) throw new Error("Google Drive connection needs attention. Reconnect in Files.");
  return { client: new DriveClient(token.access_token), connection };
}

// One worker at a time per deployment, including multiple app processes. Network calls have
// bounded timeouts; the database lease recovers after a process exits mid-upload.
export async function processDriveQueue() {
  const connection = await prisma.driveConnection.findUnique({ where: { id: "workspace" }, select: { id: true } });
  if (!connection) return;
  const candidates = await prisma.jobFile.findMany({
    where: { production: { driveFolderId: { not: null } }, OR: [{ driveSyncStatus: "PENDING" }, { driveSyncStatus: "SYNCING", driveLeaseUntil: { lt: new Date() } }] },
    orderBy: { uploadedAt: "asc" }, take: 10, select: { id: true },
  });
  if (!candidates.length) return;
  let access: Awaited<ReturnType<typeof driveClient>>;
  try { access = await driveClient(); } catch (error) {
    await prisma.jobFile.updateMany({ where: { id: { in: candidates.map(file => file.id) }, OR: [{ driveSyncStatus: "PENDING" }, { driveSyncStatus: "SYNCING", driveLeaseUntil: { lt: new Date() } }] }, data: { driveSyncStatus: "ERROR", driveSyncError: "Google Drive connection needs attention. Reconnect in Files, then retry." } });
    return;
  }
  const { client, connection: config } = access;
  for (const candidate of candidates) {
    const claimed = await prisma.jobFile.updateMany({
      where: { id: candidate.id, OR: [{ driveSyncStatus: "PENDING" }, { driveSyncStatus: "SYNCING", driveLeaseUntil: { lt: new Date() } }] },
      data: { driveSyncStatus: "SYNCING", driveLeaseUntil: new Date(Date.now() + 5 * 60_000) },
    });
    if (!claimed.count) continue;
    try {
      const file = await prisma.jobFile.findUniqueOrThrow({ where: { id: candidate.id }, include: { production: true } });
      if (!file.production?.driveFolderId || !file.production.storagePath) throw new Error("Project folder or local source file is missing.");
      await client.withinRoot(file.production.driveFolderId, config.rootFolderId);
      if (!file.driveFileId) {
        file.driveFileId = await client.reserveId();
        await prisma.jobFile.update({ where: { id: file.id }, data: { driveFileId: file.driveFileId } });
      }
      // Lock per project so different workers cannot create the same destination folders.
      const published = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`drive:${file.productionId}`}))`;
        const mapping = await tx.projectDriveFolder.findUnique({ where: { productionId_category: { productionId: file.productionId!, category: file.folder } } });
        const folder = mapping ? await client.folder(mapping.driveFolderId) : await client.ensureFolder((await client.ensureFolder(file.production!.driveFolderId!, "Production Hub")).id, file.folder);
        await client.withinRoot(folder.id, file.production!.driveFolderId!);
        const local = path.resolve(file.production!.storagePath!, file.folder, file.storedFilename);
        const base = path.resolve(file.production!.storagePath!);
        if (!local.startsWith(`${base}${path.sep}`)) throw new Error("Invalid local file path.");
        const buffer = await fs.readFile(local);
        return client.upload(folder.id, { id: file.id, name: file.originalFilename, mimeType: file.mimeType, buffer, driveFileId: file.driveFileId });
      }, { timeout: 200_000, maxWait: 5000 });
      await prisma.jobFile.update({ where: { id: file.id }, data: { driveFileId: published.id, driveWebViewLink: published.webViewLink ?? null, driveSyncStatus: "SYNCED", driveSyncError: null, driveSyncedAt: new Date(), driveLeaseUntil: null } });
    } catch (error) {
      await prisma.jobFile.updateMany({ where: { id: candidate.id }, data: { driveSyncStatus: "ERROR", driveSyncError: error instanceof Error ? error.message.slice(0, 300) : "Drive upload failed.", driveLeaseUntil: null } });
    }
  }
}
let running = false;
export function startDriveWorker() {
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processPurchaseOrderDocuments(); await processClientInvoiceDocuments(); await processProjectSetups(); await processDriveQueue(); } catch { console.error("[DRIVE] Queue unavailable; check connection and database migration."); }
    finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 15_000);
  timer.unref();
  return timer;
}
