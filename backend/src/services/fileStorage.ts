import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import mime from "mime-types";
import prisma from "../prisma";

export const JOB_STORAGE_ROOT = path.resolve(__dirname, "../../storage/jobs");

export const JOB_FOLDERS = [
  "Briefs",
  "Estimates",
  "Budgets",
  "Contracts",
  "Crew Deals",
  "Receipts",
  "References",
  "Selects",
  "Delivery",
] as const;

export type JobFolder = typeof JOB_FOLDERS[number];

export function isJobFolder(value: string): value is JobFolder {
  return (JOB_FOLDERS as readonly string[]).includes(value);
}

function cleanPathPart(value: string | null | undefined): string {
  const cleaned = (value ?? "")
    .replace(/[\\/:\*\?"<>\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled";
}

export function buildJobFolderName(production: {
  jobCode: string | null;
  clientName: string | null;
  brand: string | null;
  title: string;
}): string {
  const jobCode = cleanPathPart(production.jobCode);
  const clientBrand = cleanPathPart([production.clientName, production.brand].filter(Boolean).join(" ") || production.title);
  return `${jobCode} — ${clientBrand}`;
}

export function fileExtension(filename: string, mimeType?: string | false): string {
  const ext = path.extname(filename);
  if (ext) return ext.toLowerCase();
  const resolved = mimeType ? mime.extension(mimeType) : false;
  return resolved ? `.${resolved}` : "";
}

export async function ensureProductionFolders(productionId: string): Promise<string> {
  const production = await prisma.production.findUnique({
    where: { id: productionId },
    select: { id: true, jobCode: true, clientName: true, brand: true, title: true, storagePath: true },
  });
  if (!production) throw new Error("Production not found");

  const storagePath = production.storagePath ?? path.join(JOB_STORAGE_ROOT, buildJobFolderName(production));
  await fs.mkdir(storagePath, { recursive: true });
  await Promise.all(JOB_FOLDERS.map((folder) => fs.mkdir(path.join(storagePath, folder), { recursive: true })));

  if (production.storagePath !== storagePath) {
    await prisma.production.update({ where: { id: productionId }, data: { storagePath } });
  }

  return storagePath;
}

export async function ensureProductionFoldersForRecord(production: {
  id: string;
  jobCode: string | null;
  clientName: string | null;
  brand: string | null;
  title: string;
  storagePath: string | null;
}): Promise<string> {
  const storagePath = production.storagePath ?? path.join(JOB_STORAGE_ROOT, buildJobFolderName(production));
  await fs.mkdir(storagePath, { recursive: true });
  await Promise.all(JOB_FOLDERS.map((folder) => fs.mkdir(path.join(storagePath, folder), { recursive: true })));

  if (production.storagePath !== storagePath) {
    await prisma.production.update({ where: { id: production.id }, data: { storagePath } });
  }

  return storagePath;
}

export async function resolveProductionFilePath(productionId: string, folder: string, storedFilename: string): Promise<string> {
  if (!isJobFolder(folder)) throw new Error("Invalid folder");
  const basePath = await ensureProductionFolders(productionId);
  return path.join(basePath, folder, storedFilename);
}

export async function autoFileDocument(
  productionId: string,
  folder: JobFolder,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options?: {
    notes?: string;
    linkedBudgetLineId?: string;
    isReceipt?: boolean;
    receiptVendor?: string;
    receiptAmount?: number;
    receiptDate?: Date;
  }
) {
  const basePath = await ensureProductionFolders(productionId);
  const storedFilename = `${randomUUID()}${fileExtension(filename, mimeType)}`;
  const destination = path.join(basePath, folder, storedFilename);

  await fs.writeFile(destination, buffer);

  try {
    return await prisma.jobFile.create({
      data: {
        productionId,
        folder,
        originalFilename: filename,
        storedFilename,
        mimeType,
        sizeBytes: buffer.byteLength,
        notes: options?.notes,
        linkedBudgetLineId: options?.linkedBudgetLineId,
        isReceipt: options?.isReceipt ?? folder === "Receipts",
        receiptVendor: options?.receiptVendor,
        receiptAmount: options?.receiptAmount,
        receiptDate: options?.receiptDate,
      },
    });
  } catch (err) {
    await fs.unlink(destination).catch(() => undefined);
    throw err;
  }
}

export async function autoFileReceipt(
  productionId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options?: {
    notes?: string;
    linkedBudgetLineId?: string;
    receiptVendor?: string;
    receiptAmount?: number;
    receiptDate?: Date;
  }
) {
  return autoFileDocument(productionId, "Receipts", buffer, filename, mimeType, {
    ...options,
    isReceipt: true,
  });
}
