import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import { OptionAvailability, OptionStatus, Prisma } from "@prisma/client";
import prisma from "../prisma";
import { ensureProductionFolders, fileExtension, autoFileDocument } from "../services/fileStorage";
import { renderOptionsPdf } from "../services/optionsPdf";

const router = Router();
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

type OptionFieldBody = {
  name?: string;
  subtitle?: string | null;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  rate?: number | string | null;
  rateUnit?: string | null;
  currency?: string;
  status?: OptionStatus;
  isAvailable?: OptionAvailability;
  internalNotes?: string | null;
  clientNotes?: string | null;
  order?: number;
};

function cleanPathPart(value: string): string {
  const cleaned = value.replace(/[\\/:\*\?"<>\|]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled";
}

function asNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionDataFromBody(body: OptionFieldBody): Prisma.OptionUpdateInput {
  const data: Prisma.OptionUpdateInput = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle;
  if (body.website !== undefined) data.website = body.website;
  if (body.contactName !== undefined) data.contactName = body.contactName;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone;
  if (body.rate !== undefined) data.rate = asNumber(body.rate);
  if (body.rateUnit !== undefined) data.rateUnit = body.rateUnit;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.status !== undefined) data.status = body.status;
  if (body.isAvailable !== undefined) data.isAvailable = body.isAvailable;
  if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes;
  if (body.clientNotes !== undefined) data.clientNotes = body.clientNotes;
  if (body.order !== undefined) data.order = body.order;
  return data;
}

function photoUrl(photoId: string): string {
  return `/api/options/photos/${photoId}/serve`;
}

async function boardResponse(boardId: string) {
  const board = await prisma.optionsBoard.findUnique({
    where: { id: boardId },
    include: {
      production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true } },
      categories: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: { photos: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!board) return null;
  return {
    ...board,
    production: {
      jobCode: board.production.jobCode,
      client: board.production.clientName,
      brand: board.production.brand,
      title: board.production.title,
    },
    categories: board.categories.map((category) => ({
      ...category,
      options: category.options.map((option) => ({
        ...option,
        photos: option.photos.map((photo) => ({ ...photo, url: photoUrl(photo.id) })),
      })),
    })),
  };
}

async function getBoardWithPdfData(boardId: string) {
  return prisma.optionsBoard.findUnique({
    where: { id: boardId },
    include: {
      production: true,
      categories: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: { photos: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
}

async function optionWithProduction(optionId: string) {
  return prisma.option.findUnique({
    where: { id: optionId },
    include: {
      category: {
        include: {
          board: {
            include: {
              production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, storagePath: true } },
            },
          },
        },
      },
      photos: true,
    },
  });
}

async function optionPhotoDirectory(optionId: string): Promise<string> {
  const option = await optionWithProduction(optionId);
  if (!option) throw new Error("Option not found");
  const productionRoot = await ensureProductionFolders(option.category.board.productionId);
  const categoryName = cleanPathPart(option.category.name);
  const dir = path.join(productionRoot, "Options", categoryName, option.id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function deletePhotosFromDisk(photos: Array<{ storedPath: string }>): Promise<void> {
  await Promise.all(photos.map((photo) => fs.unlink(photo.storedPath).catch(() => undefined)));
}

function handlePhotoUpload(req: Request, res: Response, next: (err?: unknown) => void): void {
  upload.single("photo")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Maximum photo size is 10MB" });
      return;
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    next();
  });
}

router.get("/production/:productionId", async (req: Request, res: Response): Promise<void> => {
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }

  const board = await prisma.optionsBoard.upsert({
    where: { productionId: req.params.productionId },
    update: {},
    create: { productionId: req.params.productionId },
  });
  res.json(await boardResponse(board.id));
});

router.patch("/boards/:boardId", async (req: Request, res: Response): Promise<void> => {
  const { title } = req.body as { title?: string };
  if (title === undefined) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const board = await prisma.optionsBoard.update({ where: { id: req.params.boardId }, data: { title } });
  res.json(await boardResponse(board.id));
});

router.post("/boards/:boardId/categories", async (req: Request, res: Response): Promise<void> => {
  const { name, emoji, order } = req.body as { name?: string; emoji?: string | null; order?: number };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  await prisma.optionsCategory.create({
    data: {
      boardId: req.params.boardId,
      name: name.trim(),
      emoji,
      order: order ?? (await prisma.optionsCategory.count({ where: { boardId: req.params.boardId } })),
    },
  });
  res.status(201).json(await boardResponse(req.params.boardId));
});

router.patch("/categories/:categoryId", async (req: Request, res: Response): Promise<void> => {
  const { name, emoji, order } = req.body as { name?: string; emoji?: string | null; order?: number };
  const data: Prisma.OptionsCategoryUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (emoji !== undefined) data.emoji = emoji;
  if (order !== undefined) data.order = order;
  const category = await prisma.optionsCategory.update({ where: { id: req.params.categoryId }, data });
  res.json(await boardResponse(category.boardId));
});

router.delete("/categories/:categoryId", async (req: Request, res: Response): Promise<void> => {
  const category = await prisma.optionsCategory.findUnique({
    where: { id: req.params.categoryId },
    include: { options: { include: { photos: true } } },
  });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await deletePhotosFromDisk(category.options.flatMap((option) => option.photos));
  await prisma.optionsCategory.delete({ where: { id: category.id } });
  res.json(await boardResponse(category.boardId));
});

router.patch("/boards/:boardId/categories/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!orderedIds?.length) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }
  await prisma.$transaction(orderedIds.map((id, order) => prisma.optionsCategory.update({ where: { id }, data: { order } })));
  res.json(await boardResponse(req.params.boardId));
});

router.post("/categories/:categoryId/options", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionFieldBody;
  const category = await prisma.optionsCategory.findUnique({ where: { id: req.params.categoryId } });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const count = await prisma.option.count({ where: { categoryId: category.id } });
  await prisma.option.create({
    data: {
      categoryId: category.id,
      name: body.name?.trim() || "New option",
      subtitle: body.subtitle,
      website: body.website,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      rate: asNumber(body.rate),
      rateUnit: body.rateUnit,
      currency: body.currency ?? "GBP",
      status: body.status ?? "OPTION",
      isAvailable: body.isAvailable ?? "UNKNOWN",
      internalNotes: body.internalNotes,
      clientNotes: body.clientNotes,
      order: body.order ?? count,
    },
  });
  res.status(201).json(await boardResponse(category.boardId));
});

router.patch("/:optionId", async (req: Request, res: Response): Promise<void> => {
  const option = await prisma.option.update({ where: { id: req.params.optionId }, data: optionDataFromBody(req.body as OptionFieldBody) });
  const category = await prisma.optionsCategory.findUnique({ where: { id: option.categoryId }, select: { boardId: true } });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(await boardResponse(category.boardId));
});

router.delete("/:optionId", async (req: Request, res: Response): Promise<void> => {
  const option = await optionWithProduction(req.params.optionId);
  if (!option) {
    res.status(404).json({ error: "Option not found" });
    return;
  }
  const optionDir = path.join(await ensureProductionFolders(option.category.board.productionId), "Options", cleanPathPart(option.category.name), option.id);
  await deletePhotosFromDisk(option.photos);
  await prisma.option.delete({ where: { id: option.id } });
  await fs.rm(optionDir, { recursive: true, force: true }).catch(() => undefined);
  res.json(await boardResponse(option.category.boardId));
});

router.patch("/categories/:categoryId/options/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!orderedIds?.length) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }
  const category = await prisma.optionsCategory.findUnique({ where: { id: req.params.categoryId }, select: { boardId: true } });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await prisma.$transaction(orderedIds.map((id, order) => prisma.option.update({ where: { id }, data: { order } })));
  res.json(await boardResponse(category.boardId));
});

router.patch("/:optionId/move", async (req: Request, res: Response): Promise<void> => {
  const { categoryId } = req.body as { categoryId?: string };
  if (!categoryId) {
    res.status(400).json({ error: "categoryId is required" });
    return;
  }
  const category = await prisma.optionsCategory.findUnique({ where: { id: categoryId }, select: { boardId: true } });
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const order = await prisma.option.count({ where: { categoryId } });
  await prisma.option.update({ where: { id: req.params.optionId }, data: { categoryId, order } });
  res.json(await boardResponse(category.boardId));
});

router.post("/:optionId/photos", handlePhotoUpload, async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "photo is required" });
    return;
  }
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    res.status(400).json({ error: "Only JPG, PNG, and WEBP photos are supported" });
    return;
  }
  const option = await optionWithProduction(req.params.optionId);
  if (!option) {
    res.status(404).json({ error: "Option not found" });
    return;
  }
  if (option.photos.length >= 10) {
    res.status(400).json({ error: "Maximum 10 photos per option" });
    return;
  }

  const dir = await optionPhotoDirectory(option.id);
  const storedFilename = `${randomUUID()}${fileExtension(file.originalname, file.mimetype)}`;
  const storedPath = path.join(dir, storedFilename);
  await fs.writeFile(storedPath, file.buffer);
  await prisma.optionPhoto.create({
    data: {
      optionId: option.id,
      filename: file.originalname,
      storedPath,
      sizeBytes: file.size,
      order: option.photos.length,
    },
  });
  res.status(201).json(await boardResponse(option.category.boardId));
});

router.delete("/photos/:photoId", async (req: Request, res: Response): Promise<void> => {
  const photo = await prisma.optionPhoto.findUnique({
    where: { id: req.params.photoId },
    include: { option: { include: { category: true } } },
  });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  await fs.unlink(photo.storedPath).catch(() => undefined);
  await prisma.optionPhoto.delete({ where: { id: photo.id } });
  res.json(await boardResponse(photo.option.category.boardId));
});

router.patch("/:optionId/photos/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  const option = await prisma.option.findUnique({ where: { id: req.params.optionId }, include: { category: true } });
  if (!option) {
    res.status(404).json({ error: "Option not found" });
    return;
  }
  if (!orderedIds?.length) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }
  await prisma.$transaction(orderedIds.map((id, order) => prisma.optionPhoto.update({ where: { id }, data: { order } })));
  res.json(await boardResponse(option.category.boardId));
});

router.get("/photos/:photoId/serve", async (req: Request, res: Response): Promise<void> => {
  const photo = await prisma.optionPhoto.findUnique({ where: { id: req.params.photoId } });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  if (!fsSync.existsSync(photo.storedPath)) {
    res.status(404).json({ error: "Photo missing on disk" });
    return;
  }
  res.setHeader("Content-Type", "image/*");
  res.setHeader("Content-Disposition", `inline; filename="${photo.filename.replace(/"/g, "'")}"`);
  fsSync.createReadStream(photo.storedPath).pipe(res);
});

router.post("/boards/:boardId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  const board = await getBoardWithPdfData(req.params.boardId);
  if (!board) {
    res.status(404).json({ error: "Board not found" });
    return;
  }
  const pdfBuffer = await renderOptionsPdf(board);
  const date = new Date().toISOString().slice(0, 10);
  const jobCode = board.production.jobCode ?? "JOB";
  const filename = `${jobCode}_Options_${date}.pdf`;
  await autoFileDocument(board.productionId, "Estimates", pdfBuffer, filename, "application/pdf", {
    notes: `Options board export: ${board.title}`,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

export default router;
