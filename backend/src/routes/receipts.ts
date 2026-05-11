import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import mime from "mime-types";
import { ReceiptCaptureStatus, SubCostLineType, SubCostStatus } from "@prisma/client";
import prisma from "../prisma";
import { fileExtension, ensureProductionFolders, resolveJobFilePath } from "../services/fileStorage";
import { parseReceiptImage } from "../services/receiptParser";
import { recalculateAfterSubCost, syncProductionTotals } from "../services/budgetService";

const router = Router();
const RECEIPT_PENDING_ROOT = path.resolve(__dirname, "../../storage/receipts/pending");
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

function boolValue(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function intPence(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : undefined;
}

function dateValue(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(String(value));
}

function primaryReceiptAmount(capture: { parsedAmountNet?: number | null; parsedAmountGross?: number | null; parsedAmount?: number | null }): number | null {
  return capture.parsedAmountNet ?? capture.parsedAmount ?? capture.parsedAmountGross ?? null;
}

function contentDispositionFilename(filename: string): string {
  return filename.replace(/"/g, "'");
}

async function captureInclude(id: string) {
  return prisma.receiptCapture.findUnique({
    where: { id },
    include: {
      production: { select: { id: true, jobCode: true, clientName: true, brand: true, title: true } },
      lineItem: { select: { id: true, lineCode: true, description: true, section: { select: { code: true, name: true } } } },
      jobFile: true,
    },
  });
}

async function parseCapture(captureId: string) {
  const capture = await prisma.receiptCapture.findUnique({ where: { id: captureId } });
  if (!capture) throw new Error("Receipt capture not found");

  await prisma.receiptCapture.update({ where: { id: captureId }, data: { status: ReceiptCaptureStatus.PARSING } });

  try {
    const imageBuffer = await fs.readFile(capture.storedPath);
    const parsed = await parseReceiptImage(imageBuffer, capture.mimeType);
    const primaryAmount = parsed.amountNet ?? parsed.amountGross;
    const updated = await prisma.receiptCapture.update({
      where: { id: captureId },
      data: {
        status: ReceiptCaptureStatus.PARSED,
        parsedVendor: parsed.vendor,
        parsedAmount: primaryAmount,
        parsedAmountGross: parsed.amountGross,
        parsedAmountNet: parsed.amountNet,
        parsedVatAmount: parsed.vatAmount,
        parsedVatRate: parsed.vatRate,
        parsedDate: parsed.date ? new Date(parsed.date) : null,
        parsedCurrency: parsed.currency,
        parsedDescription: parsed.description,
        parsedAicpSection: parsed.suggestedAicpSection,
        parsedAicpSectionName: parsed.suggestedAicpSectionName,
        parseConfidence: parsed.confidence,
        parseRawText: parsed.rawText,
        parsedAt: new Date(),
      },
    });
    console.log(`[RECEIPT] Parsed capture ${capture.id}: ${parsed.vendor ?? "Unknown"} net £${((primaryAmount ?? 0) / 100).toFixed(2)}`);
    return updated;
  } catch (err) {
    console.error(`[RECEIPT] Parse failed for ${capture.id}:`, err instanceof Error ? err.message : err);
    return prisma.receiptCapture.update({
      where: { id: captureId },
      data: {
        status: ReceiptCaptureStatus.FAILED,
        parseConfidence: "low",
        parseRawText: err instanceof Error ? err.message : "Parse failed",
      },
    });
  }
}

function triggerParse(captureId: string) {
  setImmediate(() => {
    parseCapture(captureId).catch((err) => {
      console.error(`[RECEIPT] Parse failed for ${captureId}:`, err instanceof Error ? err.message : err);
    });
  });
}

router.post("/capture", (req: Request, res: Response): void => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Maximum receipt file size is 20MB" });
      return;
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "Receipt file is required" }); return; }
    const detectedMimeType = mime.lookup(file.originalname) || file.mimetype || "application/octet-stream";
    const mimeType = allowedMimeTypes.has(detectedMimeType) ? detectedMimeType : file.mimetype;
    if (!allowedMimeTypes.has(mimeType)) {
      res.status(400).json({ error: "Receipt must be an image or PDF" });
      return;
    }

    await fs.mkdir(RECEIPT_PENDING_ROOT, { recursive: true });
    const storedFilename = `${randomUUID()}${fileExtension(file.originalname, mimeType)}`;
    const storedPath = path.join(RECEIPT_PENDING_ROOT, storedFilename);

    try {
      await fs.writeFile(storedPath, file.buffer);
      const capture = await prisma.receiptCapture.create({
        data: {
          originalFilename: file.originalname,
          storedFilename,
          mimeType,
          sizeBytes: file.size,
          storedPath,
          capturedOffline: boolValue(req.body.capturedOffline),
          syncedAt: boolValue(req.body.capturedOffline) ? new Date() : undefined,
        },
      });
      triggerParse(capture.id);
      res.status(201).json({ id: capture.id, status: capture.status, message: "Receipt captured, parsing..." });
    } catch (writeErr) {
      await fs.unlink(storedPath).catch(() => undefined);
      res.status(500).json({ error: writeErr instanceof Error ? writeErr.message : "Receipt capture failed" });
    }
  });
});

router.post("/:captureId/parse", async (req: Request, res: Response): Promise<void> => {
  const capture = await parseCapture(req.params.captureId);
  res.json(await captureInclude(capture.id));
});

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const where: { status?: ReceiptCaptureStatus; productionId?: string } = {};
  if (typeof req.query.status === "string" && req.query.status in ReceiptCaptureStatus) {
    where.status = req.query.status as ReceiptCaptureStatus;
  }
  if (typeof req.query.productionId === "string" && req.query.productionId) where.productionId = req.query.productionId;
  const captures = await prisma.receiptCapture.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      production: { select: { id: true, jobCode: true, clientName: true, brand: true, title: true } },
      lineItem: { select: { id: true, lineCode: true, description: true, section: { select: { code: true, name: true } } } },
      jobFile: true,
    },
  });
  res.json(captures);
});

router.get("/:captureId", async (req: Request, res: Response): Promise<void> => {
  const capture = await captureInclude(req.params.captureId);
  if (!capture) { res.status(404).json({ error: "Receipt capture not found" }); return; }
  res.json(capture);
});

router.get("/:captureId/file", async (req: Request, res: Response): Promise<void> => {
  const capture = await prisma.receiptCapture.findUnique({ where: { id: req.params.captureId }, include: { jobFile: true } });
  if (!capture) { res.status(404).json({ error: "Receipt capture not found" }); return; }
  const filePath = capture.jobFile ? await resolveJobFilePath(capture.jobFile) : capture.storedPath;
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "Receipt file missing on disk" }); return; }
  res.setHeader("Content-Type", capture.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${contentDispositionFilename(capture.originalFilename)}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

router.patch("/:captureId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const parsedAmountGross = intPence(body.parsedAmountGross);
  const parsedAmountNet = intPence(body.parsedAmountNet);
  const parsedVatAmount = intPence(body.parsedVatAmount);
  const parsedVatRate = body.parsedVatRate === undefined
    ? undefined
    : body.parsedVatRate === null || body.parsedVatRate === ""
      ? null
      : Number(body.parsedVatRate);
  const parsedAmount = intPence(body.parsedAmount) ?? parsedAmountNet ?? parsedAmountGross;
  const updated = await prisma.receiptCapture.update({
    where: { id: req.params.captureId },
    data: {
      parsedVendor: body.parsedVendor as string | null | undefined,
      parsedAmount,
      parsedAmountGross,
      parsedAmountNet,
      parsedVatAmount,
      parsedVatRate: Number.isFinite(parsedVatRate) || parsedVatRate === null || parsedVatRate === undefined ? parsedVatRate : undefined,
      parsedDate: dateValue(body.parsedDate),
      parsedDescription: body.parsedDescription as string | null | undefined,
      parsedAicpSection: body.parsedAicpSection as string | null | undefined,
    },
  });
  res.json(await captureInclude(updated.id));
});

router.patch("/:captureId/assign", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { productionId?: string; lineItemId?: string; folder?: string };
  if (!body.productionId || !body.lineItemId) {
    res.status(400).json({ error: "productionId and lineItemId are required" });
    return;
  }

  const capture = await prisma.receiptCapture.findUnique({ where: { id: req.params.captureId } });
  if (!capture) { res.status(404).json({ error: "Receipt capture not found" }); return; }
  if (capture.status === ReceiptCaptureStatus.ASSIGNED) { res.status(400).json({ error: "Receipt already assigned" }); return; }

  const production = await prisma.production.findUnique({ where: { id: body.productionId }, select: { id: true } });
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const line = await prisma.budgetLineItem.findUnique({ where: { id: body.lineItemId }, select: { id: true } });
  if (!line) { res.status(404).json({ error: "Budget line not found" }); return; }

  const basePath = await ensureProductionFolders(body.productionId);
  const destination = path.join(basePath, "Receipts", capture.storedFilename);
  await fs.rename(capture.storedPath, destination);
  const receiptAmount = primaryReceiptAmount(capture);

  try {
    const jobFile = await prisma.jobFile.create({
      data: {
        productionId: body.productionId,
        folder: "Receipts",
        originalFilename: capture.originalFilename,
        storedFilename: capture.storedFilename,
        mimeType: capture.mimeType,
        sizeBytes: capture.sizeBytes,
        linkedBudgetLineId: body.lineItemId,
        isReceipt: true,
        receiptVendor: capture.parsedVendor,
        receiptAmount,
        receiptDate: capture.parsedDate,
        notes: capture.parsedDescription,
      },
    });
    const subCost = await prisma.subCost.create({
      data: {
        lineItemId: body.lineItemId,
        lineType: SubCostLineType.RECEIPT,
        description: capture.parsedDescription || capture.originalFilename,
        supplierName: capture.parsedVendor || "Unknown vendor",
        amount: (receiptAmount ?? 0) / 100,
        amountGross: capture.parsedAmountGross ? capture.parsedAmountGross / 100 : null,
        vatAmount: capture.parsedVatAmount ? capture.parsedVatAmount / 100 : null,
        vatRate: capture.parsedVatRate,
        invoiceDate: capture.parsedDate,
        status: SubCostStatus.PAID,
        invoiceFileId: jobFile.id,
        isAgreed: true,
        isInvoiced: true,
        isPaid: true,
        datePaid: capture.parsedDate ?? new Date(),
        receiptCaptureId: capture.id,
      },
    });
    const updated = await prisma.receiptCapture.update({
      where: { id: capture.id },
      data: {
        status: ReceiptCaptureStatus.ASSIGNED,
        productionId: body.productionId,
        lineItemId: body.lineItemId,
        jobFileId: jobFile.id,
        assignedAt: new Date(),
        storedPath: destination,
      },
    });
    await recalculateAfterSubCost(body.lineItemId);
    await syncProductionTotals(body.productionId);
    res.json({ ...await captureInclude(updated.id), subCost });
  } catch (assignErr) {
    await fs.rename(destination, capture.storedPath).catch(() => undefined);
    res.status(500).json({ error: assignErr instanceof Error ? assignErr.message : "Receipt assignment failed" });
  }
});

router.delete("/:captureId", async (req: Request, res: Response): Promise<void> => {
  const capture = await prisma.receiptCapture.findUnique({ where: { id: req.params.captureId } });
  if (!capture) { res.status(404).json({ error: "Receipt capture not found" }); return; }
  if (capture.status === ReceiptCaptureStatus.ASSIGNED || capture.status === ReceiptCaptureStatus.PARSING) {
    res.status(400).json({ error: "Only pending, parsed, or failed receipts can be deleted" });
    return;
  }
  await fs.unlink(capture.storedPath).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== "ENOENT") throw err;
  });
  await prisma.receiptCapture.delete({ where: { id: capture.id } });
  res.status(204).end();
});

export default router;
