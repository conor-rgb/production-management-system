import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import mime from "mime-types";
import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import {
  fileExtension,
  ensureProductionFolders,
  isJobFolder,
  JOB_FOLDERS,
  resolveProductionFilePath,
} from "../services/fileStorage";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const previewableTypes = new Set(["application/pdf"]);

function fileSelect() {
  return {
    id: true,
    productionId: true,
    folder: true,
    originalFilename: true,
    storedFilename: true,
    mimeType: true,
    sizeBytes: true,
    uploadedAt: true,
    linkedBudgetLineId: true,
    isReceipt: true,
    receiptVendor: true,
    receiptAmount: true,
    receiptDate: true,
    notes: true,
  } satisfies Prisma.JobFileSelect;
}

async function fileWithProduction(fileId: string) {
  return prisma.jobFile.findUnique({
    where: { id: fileId },
    include: {
      production: { select: { id: true, jobCode: true, clientName: true, brand: true, title: true, storagePath: true } },
    },
  });
}

function detectMimeType(filename: string): string {
  return mime.lookup(filename) || "application/octet-stream";
}

function isPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || previewableTypes.has(mimeType);
}

function contentDispositionFilename(filename: string): string {
  return filename.replace(/"/g, "'");
}

function pageNumber(value: unknown): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

// GET /api/files/production/:productionId/tree
router.get("/production/:productionId/tree", async (req: Request, res: Response): Promise<void> => {
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }

  await ensureProductionFolders(req.params.productionId);
  const files = await prisma.jobFile.findMany({
    where: { productionId: req.params.productionId },
    orderBy: { uploadedAt: "desc" },
    select: fileSelect(),
  });

  res.json({
    productionId: req.params.productionId,
    folders: JOB_FOLDERS.map((folder) => ({
      name: folder,
      files: files.filter((file) => file.folder === folder),
    })),
  });
});

// POST /api/files/production/:productionId/upload
router.post(
  "/production/:productionId/upload",
  upload.array("files", 20),
  async (req: Request, res: Response): Promise<void> => {
    const { folder, notes } = req.body as { folder?: string; notes?: string };
    if (!folder || !isJobFolder(folder)) {
      res.status(400).json({ error: `folder must be one of: ${JOB_FOLDERS.join(", ")}` });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: "At least one file is required" });
      return;
    }

    const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
    if (!production) { res.status(404).json({ error: "Production not found" }); return; }

    const basePath = await ensureProductionFolders(req.params.productionId);
    const created = [];

    for (const file of files) {
      const mimeType = detectMimeType(file.originalname);
      const storedFilename = `${randomUUID()}${fileExtension(file.originalname, mimeType)}`;
      const destination = path.join(basePath, folder, storedFilename);

      try {
        await fs.writeFile(destination, file.buffer);
        const record = await prisma.jobFile.create({
          data: {
            productionId: req.params.productionId,
            folder,
            originalFilename: file.originalname,
            storedFilename,
            mimeType,
            sizeBytes: file.size,
            notes: notes || undefined,
            isReceipt: folder === "Receipts",
          },
        });
        created.push(record);
      } catch (err) {
        await fs.unlink(destination).catch(() => undefined);
        res.status(500).json({ error: err instanceof Error ? err.message : "File upload failed" });
        return;
      }
    }

    res.status(201).json(created.length === 1 ? created[0] : created);
  }
);

// GET /api/files/all
router.get("/all", async (req: Request, res: Response): Promise<void> => {
  const { folder, search, productionId } = req.query;
  const page = pageNumber(req.query.page);
  const where: Prisma.JobFileWhereInput = {};

  if (typeof folder === "string" && folder && folder !== "All") {
    if (!isJobFolder(folder)) { res.status(400).json({ error: "Invalid folder" }); return; }
    where.folder = folder;
  }
  if (typeof productionId === "string" && productionId) where.productionId = productionId;
  if (typeof search === "string" && search.trim()) {
    where.originalFilename = { contains: search.trim(), mode: "insensitive" };
  }

  const [files, total] = await Promise.all([
    prisma.jobFile.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: 50,
      skip: (page - 1) * 50,
      include: {
        production: { select: { id: true, jobCode: true, clientName: true, brand: true, title: true } },
      },
    }),
    prisma.jobFile.count({ where }),
  ]);

  res.json({ files, page, hasMore: page * 50 < total, total });
});

// GET /api/files/storage-info
router.get("/storage-info", async (_req: Request, res: Response): Promise<void> => {
  const aggregate = await prisma.jobFile.aggregate({
    _sum: { sizeBytes: true },
    _count: { id: true },
  });
  res.json({
    totalBytes: aggregate._sum.sizeBytes ?? 0,
    fileCount: aggregate._count.id,
    basePath: path.resolve(__dirname, "../../storage/jobs"),
  });
});

// GET /api/files/:fileId/download
router.get("/:fileId/download", async (req: Request, res: Response): Promise<void> => {
  const file = await fileWithProduction(req.params.fileId);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  const filePath = await resolveProductionFilePath(file.productionId, file.folder, file.storedFilename);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }

  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${contentDispositionFilename(file.originalFilename)}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

// GET /api/files/:fileId/preview
router.get("/:fileId/preview", async (req: Request, res: Response): Promise<void> => {
  const file = await fileWithProduction(req.params.fileId);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  if (!isPreviewable(file.mimeType)) {
    res.json({ ...file, previewable: false });
    return;
  }

  const filePath = await resolveProductionFilePath(file.productionId, file.folder, file.storedFilename);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }

  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${contentDispositionFilename(file.originalFilename)}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

// PATCH /api/files/:fileId
router.patch("/:fileId", async (req: Request, res: Response): Promise<void> => {
  const { originalFilename, folder, notes, linkedBudgetLineId } = req.body as {
    originalFilename?: string;
    folder?: string;
    notes?: string | null;
    linkedBudgetLineId?: string | null;
  };

  const file = await fileWithProduction(req.params.fileId);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  let nextFolder = file.folder;
  if (folder !== undefined) {
    if (!isJobFolder(folder)) { res.status(400).json({ error: "Invalid folder" }); return; }
    nextFolder = folder;
  }

  if (nextFolder !== file.folder) {
    const currentPath = await resolveProductionFilePath(file.productionId, file.folder, file.storedFilename);
    const nextPath = await resolveProductionFilePath(file.productionId, nextFolder, file.storedFilename);
    await fs.rename(currentPath, nextPath);
  }

  const updated = await prisma.jobFile.update({
    where: { id: req.params.fileId },
    data: {
      originalFilename,
      folder: nextFolder,
      notes,
      linkedBudgetLineId,
    },
  });
  res.json(updated);
});

// DELETE /api/files/:fileId
router.delete("/:fileId", async (req: Request, res: Response): Promise<void> => {
  const file = await fileWithProduction(req.params.fileId);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }

  const filePath = await resolveProductionFilePath(file.productionId, file.folder, file.storedFilename);
  await fs.unlink(filePath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
  await prisma.jobFile.delete({ where: { id: req.params.fileId } });
  res.status(204).end();
});

export default router;
