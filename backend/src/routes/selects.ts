import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import mime from "mime-types";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { ZipArchive } from "archiver";
import { Prisma, StillActivityAction, StillAnnotationVisibility, StillShareRole, StillSourceAssetType, StillStatus } from "@prisma/client";
import prisma from "../prisma";
import { ensureProductionFolders, fileExtension, resolveJobFilePath } from "../services/fileStorage";
import { addSelectsRealtimeClient, broadcastSelectsEvent } from "../services/selectsRealtime";

const router = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1000 },
});
const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
});

const STILL_FOLDER = "Selects";
const SOURCE_ASSET_FOLDER = "Selects";

const imageInclude = {
  jobFile: true,
  thumbnailJobFile: true,
  folder: true,
  skuTags: { include: { sku: true }, orderBy: { createdAt: "asc" as const } },
  annotations: { orderBy: { createdAt: "asc" as const } },
  activities: { orderBy: { createdAt: "desc" as const }, take: 20 },
  retouchVersions: { include: { jobFile: true }, orderBy: { version: "desc" as const } },
  sourceAssets: { include: { jobFile: true }, orderBy: { createdAt: "asc" as const } },
};

const galleryImageInclude = {
  jobFile: true,
  thumbnailJobFile: true,
  folder: true,
  skuTags: { include: { sku: true }, orderBy: { createdAt: "asc" as const } },
  annotations: { select: { id: true, imageId: true, x: true, y: true, body: true, markup: true, visibility: true, resolved: true, authorName: true, authorEmail: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" as const } },
  retouchVersions: { include: { jobFile: true }, orderBy: { version: "desc" as const } },
  sourceAssets: { include: { jobFile: true }, orderBy: { createdAt: "asc" as const } },
};

function productionId(req: Request) {
  return req.params.id;
}

function serializeShareLink<T extends { token: string; passwordHash?: string | null }>(link: T) {
  const { passwordHash: _passwordHash, ...safeLink } = link;
  return { ...safeLink, hasPassword: Boolean(_passwordHash), url: `/selects/review/${link.token}` };
}

function zipSafeSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Untitled";
}

function uniqueZipName(name: string, used: Set<string>) {
  const safeName = name.split("/").map(zipSafeSegment).filter(Boolean).join("/") || "file";
  if (!used.has(safeName)) {
    used.add(safeName);
    return safeName;
  }
  const extension = path.extname(safeName);
  const stem = extension ? safeName.slice(0, -extension.length) : safeName;
  let index = 2;
  while (used.has(`${stem}-${index}${extension}`)) index += 1;
  const next = `${stem}-${index}${extension}`;
  used.add(next);
  return next;
}

function detectMimeType(filename: string): string {
  return mime.lookup(filename) || "application/octet-stream";
}

function isUploadableImage(filename: string, mimeType: string): boolean {
  return mimeType.startsWith("image/") || /\.(avif|heic|heif|jpeg|jpg|png|tif|tiff|webp)$/i.test(filename);
}

function imageMimeType(filename: string, detectedMimeType: string): string {
  if (detectedMimeType.startsWith("image/")) return detectedMimeType;
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".tif" || extension === ".tiff") return "image/tiff";
  if (extension === ".heic") return "image/heic";
  if (extension === ".heif") return "image/heif";
  if (extension === ".avif") return "image/avif";
  return detectedMimeType;
}

async function createStillThumbnail(params: {
  productionIdValue: string;
  sourceBuffer?: Buffer;
  sourcePath?: string;
  originalFilename: string;
}) {
  try {
    const pipeline = params.sourceBuffer ? sharp(params.sourceBuffer) : sharp(params.sourcePath);
    const buffer = await pipeline
      .rotate()
      .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76, effort: 4 })
      .toBuffer();
    const basePath = await ensureProductionFolders(params.productionIdValue);
    const storedFilename = `${randomUUID()}.webp`;
    await fs.writeFile(path.join(basePath, STILL_FOLDER, storedFilename), buffer);
    return prisma.jobFile.create({
      data: {
        productionId: params.productionIdValue,
        folder: STILL_FOLDER,
        originalFilename: `${path.parse(params.originalFilename).name}.thumb.webp`,
        storedFilename,
        mimeType: "image/webp",
        sizeBytes: buffer.length,
      },
    });
  } catch (error) {
    console.warn("[SELECTS] thumbnail generation failed", params.originalFilename, error);
    return null;
  }
}

async function createSkuThumbnail(params: {
  productionIdValue: string;
  sourceBuffer?: Buffer;
  sourcePath?: string;
  originalFilename: string;
}) {
  const pipeline = params.sourceBuffer ? sharp(params.sourceBuffer) : sharp(params.sourcePath);
  const buffer = await pipeline
    .rotate()
    .resize({ width: 320, height: 320, fit: "cover", withoutEnlargement: false })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();
  const basePath = await ensureProductionFolders(params.productionIdValue);
  const storedFilename = `${randomUUID()}.webp`;
  await fs.writeFile(path.join(basePath, STILL_FOLDER, storedFilename), buffer);
  return prisma.jobFile.create({
    data: {
      productionId: params.productionIdValue,
      folder: STILL_FOLDER,
      originalFilename: `${path.parse(params.originalFilename).name}.sku.webp`,
      storedFilename,
      mimeType: "image/webp",
      sizeBytes: buffer.length,
    },
  });
}

function nullableText(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function validStatus(value: unknown): value is StillStatus {
  return typeof value === "string" && Object.values(StillStatus).includes(value as StillStatus);
}

function validVisibility(value: unknown): value is StillAnnotationVisibility {
  return typeof value === "string" && Object.values(StillAnnotationVisibility).includes(value as StillAnnotationVisibility);
}

function validSourceAssetType(value: unknown): value is StillSourceAssetType {
  return typeof value === "string" && Object.values(StillSourceAssetType).includes(value as StillSourceAssetType);
}

function clampCoordinate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.5;
  return Math.min(1, Math.max(0, parsed));
}

function normalizedMarkup(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Prisma.InputJsonValue;
}

function serializeImage(image: Prisma.StillImageGetPayload<{ include: typeof imageInclude }> | Prisma.StillImageGetPayload<{ include: typeof galleryImageInclude }>, clientMode = false) {
  const annotations = clientMode
    ? image.annotations.filter((annotation) => annotation.visibility === "CLIENT")
    : image.annotations;

  return {
    ...image,
    annotations,
    skus: image.skuTags.map((tag) => tag.sku),
  };
}

function actorFromRequest(req: Request) {
  const bodyName = typeof req.body?.reviewerName === "string" ? req.body.reviewerName.trim() : "";
  const bodyEmail = typeof req.body?.reviewerEmail === "string" ? req.body.reviewerEmail.trim() : "";
  return {
    actorName: bodyName || req.session.email || "Internal",
    actorEmail: bodyEmail || req.session.email || undefined,
  };
}

export async function recordActivity(data: {
  productionId: string;
  imageId?: string | null;
  shareLinkId?: string | null;
  action: StillActivityAction;
  actorName?: string | null;
  actorEmail?: string | null;
  actorRole?: StillShareRole | null;
  fromValue?: string | null;
  toValue?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.stillImageActivity.create({ data }).catch((error) => {
    console.error("[SELECTS] activity log failed", error);
  });
}

export async function createRetouchVersion(params: {
  productionIdValue: string;
  imageId: string;
  file: Express.Multer.File;
  notes?: string;
  uploadedBy?: string;
}) {
  const sourceImage = await prisma.stillImage.findFirst({
    where: { id: params.imageId, productionId: params.productionIdValue },
    select: { id: true, productionId: true },
  });
  if (!sourceImage) throw new Error("Image not found");
  const detectedMimeType = detectMimeType(params.file.originalname);
  if (!isUploadableImage(params.file.originalname, detectedMimeType)) throw new Error("Upload an image file");
  const mimeType = imageMimeType(params.file.originalname, detectedMimeType);
  const basePath = await ensureProductionFolders(params.productionIdValue);
  const storedFilename = `${randomUUID()}${fileExtension(params.file.originalname, mimeType)}`;
  const destination = path.join(basePath, STILL_FOLDER, storedFilename);
  await fs.writeFile(destination, params.file.buffer);
  const latest = await prisma.stillRetouchVersion.findFirst({
    where: { imageId: params.imageId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;
  const jobFile = await prisma.jobFile.create({
    data: {
      productionId: params.productionIdValue,
      folder: STILL_FOLDER,
      originalFilename: params.file.originalname,
      storedFilename,
      mimeType,
      sizeBytes: params.file.size,
    },
  });
  const retouchVersion = await prisma.stillRetouchVersion.create({
    data: {
      imageId: params.imageId,
      jobFileId: jobFile.id,
      version,
      label: `v${version}`,
      notes: params.notes || undefined,
      uploadedBy: params.uploadedBy || undefined,
    },
    include: { jobFile: true },
  });
  await recordActivity({
    productionId: params.productionIdValue,
    imageId: params.imageId,
    action: StillActivityAction.VERSION_UPLOADED,
    actorName: params.uploadedBy || "Internal",
    toValue: `v${version}`,
  });
  return retouchVersion;
}

async function ensureProduction(productionIdValue: string) {
  const production = await prisma.production.findUnique({
    where: { id: productionIdValue },
    select: { id: true, title: true, jobCode: true, clientName: true, brand: true },
  });
  return production;
}

async function ensureFolder(productionIdValue: string, parts: string[], rootParentId: string | null = null): Promise<string | null> {
  let parentId: string | null = rootParentId;
  for (const rawPart of parts) {
    const name = rawPart.replace(/[\\/]/g, " ").trim();
    if (!name) continue;
    const existing: { id: string } | null = await prisma.stillFolder.findFirst({
      where: { productionId: productionIdValue, parentId, name },
      select: { id: true },
    });
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const count = await prisma.stillFolder.count({ where: { productionId: productionIdValue, parentId } });
    const created: { id: string } = await prisma.stillFolder.create({
      data: { productionId: productionIdValue, parentId, name, sortOrder: count },
      select: { id: true },
    });
    parentId = created.id;
  }
  return parentId;
}

async function assertFolderBelongsToProduction(folderId: string | null | undefined, productionIdValue: string): Promise<string | null | undefined> {
  if (folderId === undefined) return undefined;
  if (folderId === null || folderId === "") return null;
  const folder = await prisma.stillFolder.findFirst({ where: { id: folderId, productionId: productionIdValue }, select: { id: true } });
  if (!folder) throw new Error("Invalid folder");
  return folder.id;
}

async function descendantFolderIds(folderId: string): Promise<string[]> {
  const ids = [folderId];
  let cursor = [folderId];
  while (cursor.length > 0) {
    const children = await prisma.stillFolder.findMany({ where: { parentId: { in: cursor } }, select: { id: true } });
    cursor = children.map((child) => child.id);
    ids.push(...cursor);
  }
  return ids;
}

type StoredJobFile = {
  id: string;
  productionId: string | null;
  folder: string;
  storedFilename: string;
};

function addFileCandidate(map: Map<string, StoredJobFile>, file: StoredJobFile | null | undefined) {
  if (file) map.set(file.id, file);
}

async function unlinkStoredJobFiles(files: StoredJobFile[]) {
  await Promise.all(files.map(async (file) => {
    const filePath = await resolveJobFilePath(file);
    await fs.unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }));
}

async function permanentlyDeleteStillImages(productionIdValue: string, imageIds: string[]) {
  const uniqueImageIds = [...new Set(imageIds.filter(Boolean))];
  if (uniqueImageIds.length === 0) return { deletedImages: 0, deletedFiles: 0 };

  const images = await prisma.stillImage.findMany({
    where: { id: { in: uniqueImageIds }, productionId: productionIdValue },
    include: {
      jobFile: { select: { id: true, productionId: true, folder: true, storedFilename: true } },
      thumbnailJobFile: { select: { id: true, productionId: true, folder: true, storedFilename: true } },
      retouchVersions: {
        include: { jobFile: { select: { id: true, productionId: true, folder: true, storedFilename: true } } },
      },
      sourceAssets: {
        include: { jobFile: { select: { id: true, productionId: true, folder: true, storedFilename: true } } },
      },
    },
  });
  const fileCandidates = new Map<string, StoredJobFile>();
  for (const image of images) {
    addFileCandidate(fileCandidates, image.jobFile);
    addFileCandidate(fileCandidates, image.thumbnailJobFile);
    for (const version of image.retouchVersions) addFileCandidate(fileCandidates, version.jobFile);
    for (const sourceAsset of image.sourceAssets) addFileCandidate(fileCandidates, sourceAsset.jobFile);
  }
  const candidateIds = [...fileCandidates.keys()];

  const deletedFiles = await prisma.$transaction(async (tx) => {
    await tx.stillImage.deleteMany({ where: { id: { in: images.map((image) => image.id) }, productionId: productionIdValue } });
    if (candidateIds.length === 0) return [];
    const deletableFiles = await tx.jobFile.findMany({
      where: {
        id: { in: candidateIds },
        stillImage: { is: null },
        stillImageThumbnails: { none: {} },
        stillRetouchVersions: { none: {} },
        stillSourceAssets: { none: {} },
        skuThumbnails: { none: {} },
      },
      select: { id: true, productionId: true, folder: true, storedFilename: true },
    });
    if (deletableFiles.length > 0) {
      await tx.jobFile.deleteMany({ where: { id: { in: deletableFiles.map((file) => file.id) } } });
    }
    return deletableFiles;
  });

  await unlinkStoredJobFiles(deletedFiles);
  return { deletedImages: images.length, deletedFiles: deletedFiles.length };
}

function csvRows(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((part) => part.trim()));
}

function skuDataFromBody(body: Record<string, unknown>) {
  return {
    code: nullableText(body.code),
    name: nullableText(body.name),
    description: nullableText(body.description),
    colorway: nullableText(body.colorway),
    notes: nullableText(body.notes),
    materialSupplier: nullableText(body.materialSupplier),
    materialName: nullableText(body.materialName),
    composition: nullableText(body.composition),
    hardware: nullableText(body.hardware),
    price: nullableText(body.price),
    sourceSheet: nullableText(body.sourceSheet),
  };
}

async function findMatchingSku(productionIdValue: string, data: ReturnType<typeof skuDataFromBody>) {
  const code = data.code?.trim();
  if (code) {
    const byCode = await prisma.productionSku.findFirst({ where: { productionId: productionIdValue, code } });
    if (byCode) return byCode;
  }
  if (!data.name) return null;
  return prisma.productionSku.findFirst({
    where: {
      productionId: productionIdValue,
      name: data.name,
      colorway: data.colorway,
      materialName: data.materialName,
      hardware: data.hardware,
    },
  });
}

async function upsertSkuForProduction(productionIdValue: string, data: ReturnType<typeof skuDataFromBody>) {
  const existing = await findMatchingSku(productionIdValue, data);
  if (existing) return prisma.productionSku.update({ where: { id: existing.id }, data });
  return prisma.productionSku.create({ data: { productionId: productionIdValue, ...data } });
}

function isCaptureOnePath(value: string): boolean {
  return value.split(/[\\/]/).some((part) => part.toLowerCase() === "captureone");
}

function starRatingFromFolderName(value: string): number | null {
  const match = value.match(/^([0-5])_STAR$/i);
  if (!match) return null;
  return Number(match[1]);
}

function extractRatingFolder(parts: string[]): { folderParts: string[]; rating: number | null } {
  let rating: number | null = null;
  const folderParts = parts.filter((part) => {
    const parsed = starRatingFromFolderName(part);
    if (parsed === null) return true;
    rating = parsed;
    return false;
  });
  return { folderParts, rating };
}

// GET /api/productions/:id/selects
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }

  const { folderId, status, skuId, search, rating, selected, hero, notes, limit, offset } = req.query;
  const where: Prisma.StillImageWhereInput = { productionId: production.id };
  const take = limit === "all" ? undefined : Math.max(1, Math.min(500, Number(limit) || 180));
  const skip = Math.max(0, Number(offset) || 0);

  if (typeof folderId === "string" && folderId) where.folderId = folderId;
  if (typeof status === "string" && validStatus(status)) where.status = status;
  if (typeof rating === "string" && rating) where.rating = Number(rating);
  if (selected === "true") where.status = { in: [StillStatus.CLIENT_SELECT, StillStatus.TO_RETOUCH, StillStatus.RETOUCHING, StillStatus.APPROVED, StillStatus.DELIVERED] };
  if (hero === "true") where.isHero = true;
  if (notes === "open") where.annotations = { some: { resolved: false } };
  if (typeof skuId === "string" && skuId) where.skuTags = { some: { skuId } };
  if (typeof search === "string" && search.trim()) {
    where.OR = [
      { jobFile: { originalFilename: { contains: search.trim(), mode: "insensitive" } } },
      { retouchSummary: { contains: search.trim(), mode: "insensitive" } },
      { skuTags: { some: { sku: { code: { contains: search.trim(), mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { name: { contains: search.trim(), mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { colorway: { contains: search.trim(), mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { materialName: { contains: search.trim(), mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { hardware: { contains: search.trim(), mode: "insensitive" } } } } },
    ];
  }

  const scopedWhere: Prisma.StillImageWhereInput = { productionId: production.id };
  const [folders, images, totalImages, scopedTotalImages, folderCountRows, statusCountRows, skus, shareLinks] = await Promise.all([
    prisma.stillFolder.findMany({ where: { productionId: production.id }, orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    prisma.stillImage.findMany({ where, orderBy: [{ jobFile: { originalFilename: "asc" } }, { createdAt: "asc" }], skip: take === undefined ? undefined : skip, take, include: galleryImageInclude }),
    prisma.stillImage.count({ where }),
    prisma.stillImage.count({ where: scopedWhere }),
    prisma.stillImage.groupBy({ by: ["folderId"], where: scopedWhere, _count: { _all: true } }),
    prisma.stillImage.groupBy({ by: ["status"], where: scopedWhere, _count: { _all: true } }),
    prisma.productionSku.findMany({ where: { productionId: production.id }, orderBy: [{ name: "asc" }, { colorway: "asc" }, { materialName: "asc" }, { hardware: "asc" }, { code: "asc" }] }),
    prisma.stillShareLink.findMany({ where: { productionId: production.id }, orderBy: { createdAt: "desc" } }),
  ]);

  res.json({
    production,
    folders,
    images: images.map((image) => serializeImage(image)),
    skus,
    shareLinks: shareLinks.map(serializeShareLink),
    totalImages: scopedTotalImages,
    folderCounts: Object.fromEntries(folderCountRows.filter((row) => row.folderId).map((row) => [row.folderId, row._count._all])),
    statusCounts: Object.fromEntries(statusCountRows.map((row) => [row.status, row._count._all])),
    pagination: { total: totalImages, limit: take ?? totalImages, offset: take === undefined ? 0 : skip, hasMore: take !== undefined && skip + images.length < totalImages },
  });
});

router.get("/events", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  addSelectsRealtimeClient(production.id, res);
});

// POST /api/productions/:id/selects/folders
router.post("/folders", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const name = String(req.body.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const parentId = await assertFolderBelongsToProduction(req.body.parentId ?? null, production.id);
  const count = await prisma.stillFolder.count({ where: { productionId: production.id, parentId } });
  const folder = await prisma.stillFolder.create({ data: { productionId: production.id, parentId, name, sortOrder: count } });
  res.status(201).json(folder);
});

router.patch("/folders/:folderId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const folder = await prisma.stillFolder.findFirst({ where: { id: req.params.folderId, productionId: production.id } });
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  const parentId = await assertFolderBelongsToProduction(req.body.parentId === undefined ? undefined : req.body.parentId, production.id);
  if (parentId && parentId === folder.id) { res.status(400).json({ error: "Folder cannot be its own parent" }); return; }
  if (parentId) {
    const descendantIds = await descendantFolderIds(folder.id);
    if (descendantIds.includes(parentId)) {
      res.status(400).json({ error: "Folder cannot be moved inside itself" });
      return;
    }
  }
  const movingParent = parentId !== undefined && parentId !== folder.parentId;
  const nextSortOrder = movingParent
    ? await prisma.stillFolder.count({ where: { productionId: production.id, parentId: parentId ?? null } })
    : undefined;
  const updated = await prisma.stillFolder.update({
    where: { id: folder.id },
    data: {
      name: req.body.name === undefined ? undefined : String(req.body.name).trim(),
      parentId,
      sortOrder: movingParent ? nextSortOrder : req.body.sortOrder === undefined ? undefined : Number(req.body.sortOrder),
    },
  });
  res.json(updated);
});

router.delete("/folders/:folderId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const folder = await prisma.stillFolder.findFirst({ where: { id: req.params.folderId, productionId: production.id }, select: { id: true } });
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  const folderIds = await descendantFolderIds(folder.id);
  const images = await prisma.stillImage.findMany({ where: { productionId: production.id, folderId: { in: folderIds } }, select: { id: true } });
  const deleteResult = await permanentlyDeleteStillImages(production.id, images.map((image) => image.id));
  await prisma.stillFolder.deleteMany({ where: { productionId: production.id, id: { in: folderIds } } });
  res.json({ ...deleteResult, deletedFolders: folderIds.length });
});

router.post("/images/delete", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.map(String) : [];
  const result = await permanentlyDeleteStillImages(production.id, imageIds);
  res.json(result);
});

router.delete("/images/:imageId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const result = await permanentlyDeleteStillImages(production.id, [req.params.imageId]);
  if (result.deletedImages === 0) { res.status(404).json({ error: "Image not found" }); return; }
  res.json(result);
});

// POST /api/productions/:id/selects/upload
router.post("/upload", upload.array("files", 1000), async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) { res.status(400).json({ error: "At least one file is required" }); return; }

  const pathsRaw = req.body.paths;
  const paths = Array.isArray(pathsRaw) ? pathsRaw.map(String) : typeof pathsRaw === "string" ? [pathsRaw] : [];
  const fallbackFolderId = await assertFolderBelongsToProduction(req.body.folderId ?? null, production.id);
  const basePath = await ensureProductionFolders(production.id);
  const created = [];
  let skipped = 0;
  let skippedCaptureOne = 0;
  let skippedNonImage = 0;

  for (const [index, file] of files.entries()) {
    const relativePath = paths[index] || file.originalname;
    if (isCaptureOnePath(relativePath)) { skipped += 1; skippedCaptureOne += 1; continue; }
    const parts = relativePath.split(/[\\/]/).filter(Boolean);
    const filename = parts.pop() || file.originalname;
    const { folderParts, rating } = extractRatingFolder(parts);
    const folderId = folderParts.length > 0 ? await ensureFolder(production.id, folderParts, fallbackFolderId ?? null) : fallbackFolderId;
    const detectedMimeType = detectMimeType(filename);
    if (!isUploadableImage(filename, detectedMimeType)) { skipped += 1; skippedNonImage += 1; continue; }
    const mimeType = imageMimeType(filename, detectedMimeType);

    const storedFilename = `${randomUUID()}${fileExtension(filename, mimeType)}`;
    const destination = path.join(basePath, STILL_FOLDER, storedFilename);
    await fs.writeFile(destination, file.buffer);
    const thumbnailJobFile = await createStillThumbnail({ productionIdValue: production.id, sourceBuffer: file.buffer, originalFilename: filename });
    const jobFile = await prisma.jobFile.create({
      data: {
        productionId: production.id,
        folder: STILL_FOLDER,
        originalFilename: filename,
        storedFilename,
        mimeType,
        sizeBytes: file.size,
      },
    });
    const image = await prisma.stillImage.create({
      data: { productionId: production.id, jobFileId: jobFile.id, thumbnailJobFileId: thumbnailJobFile?.id, folderId, rating },
      include: galleryImageInclude,
    });
    created.push(serializeImage(image));
  }

  console.log(`[SELECTS] Uploaded ${created.length} stills to production ${production.id}; skipped ${skipped}`);
  res.status(201).json({
    images: created,
    createdCount: created.length,
    skippedCount: skipped,
    skippedCaptureOne,
    skippedNonImage,
    totalCount: files.length,
  });
});

router.post("/skus/import", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const csv = String(req.body.csv ?? "");
  const rows = csvRows(csv);
  const created = [];
  for (const [codeRaw, name, description, colorway, notes, materialSupplier, materialName, composition, hardware, price, sourceSheet] of rows) {
    const code = codeRaw?.trim();
    if (code?.toLowerCase() === "code" || code?.toLowerCase() === "sku") continue;
    const sku = await upsertSkuForProduction(production.id, skuDataFromBody({
      code,
      name,
      description,
      colorway,
      notes,
      materialSupplier,
      materialName,
      composition,
      hardware,
      price,
      sourceSheet,
    }));
    created.push(sku);
  }
  res.status(201).json(created);
});

router.post("/skus", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const data = skuDataFromBody(req.body);
  const sku = await prisma.productionSku.create({
    data: {
      productionId: production.id,
      ...data,
    },
  });
  res.status(201).json(sku);
});

router.patch("/skus/:skuId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const sku = await prisma.productionSku.update({
    where: { id: req.params.skuId, productionId: production.id },
    data: {
      code: req.body.code === undefined ? undefined : nullableText(req.body.code),
      name: req.body.name === undefined ? undefined : nullableText(req.body.name),
      description: req.body.description === undefined ? undefined : nullableText(req.body.description),
      colorway: req.body.colorway === undefined ? undefined : nullableText(req.body.colorway),
      notes: req.body.notes === undefined ? undefined : nullableText(req.body.notes),
      materialSupplier: req.body.materialSupplier === undefined ? undefined : nullableText(req.body.materialSupplier),
      materialName: req.body.materialName === undefined ? undefined : nullableText(req.body.materialName),
      composition: req.body.composition === undefined ? undefined : nullableText(req.body.composition),
      hardware: req.body.hardware === undefined ? undefined : nullableText(req.body.hardware),
      price: req.body.price === undefined ? undefined : nullableText(req.body.price),
      sourceSheet: req.body.sourceSheet === undefined ? undefined : nullableText(req.body.sourceSheet),
    },
  });
  res.json(sku);
});

router.delete("/skus/:skuId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  await prisma.productionSku.delete({ where: { id: req.params.skuId, productionId: production.id } });
  res.status(204).end();
});

router.post("/skus/:skuId/thumbnail", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const sku = await prisma.productionSku.findFirst({ where: { id: req.params.skuId, productionId: production.id }, select: { id: true } });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "file required" }); return; }
  const detectedMimeType = detectMimeType(file.originalname);
  if (!isUploadableImage(file.originalname, detectedMimeType)) { res.status(400).json({ error: "Upload an image file" }); return; }
  const jobFile = await createSkuThumbnail({ productionIdValue: production.id, sourceBuffer: file.buffer, originalFilename: file.originalname });
  const updated = await prisma.productionSku.update({ where: { id: sku.id }, data: { thumbnailJobFileId: jobFile.id } });
  res.json(updated);
});

router.post("/skus/:skuId/thumbnail-from-image", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const sku = await prisma.productionSku.findFirst({ where: { id: req.params.skuId, productionId: production.id }, select: { id: true } });
  if (!sku) { res.status(404).json({ error: "SKU not found" }); return; }
  const imageId = String(req.body.imageId ?? "");
  const image = await prisma.stillImage.findFirst({ where: { id: imageId, productionId: production.id }, include: { jobFile: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const sourcePath = await resolveJobFilePath(image.jobFile);
  const jobFile = await createSkuThumbnail({ productionIdValue: production.id, sourcePath, originalFilename: image.jobFile.originalFilename });
  const updated = await prisma.productionSku.update({ where: { id: sku.id }, data: { thumbnailJobFileId: jobFile.id } });
  res.json(updated);
});

router.patch("/images/:imageId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const folderId = await assertFolderBelongsToProduction(req.body.folderId === undefined ? undefined : req.body.folderId, production.id);
  const existing = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, select: { id: true, status: true, rating: true } });
  if (!existing) { res.status(404).json({ error: "Image not found" }); return; }
  const data: Prisma.StillImageUpdateInput = {
    folder: folderId === undefined ? undefined : folderId === null ? { disconnect: true } : { connect: { id: folderId } },
    status: req.body.status === undefined ? undefined : validStatus(req.body.status) ? req.body.status : undefined,
    rating: req.body.rating === undefined ? undefined : req.body.rating === null ? null : Number(req.body.rating),
    isHero: req.body.isHero === undefined ? undefined : Boolean(req.body.isHero),
    retouchSummary: req.body.retouchSummary,
    sortOrder: req.body.sortOrder === undefined ? undefined : Number(req.body.sortOrder),
  };
  if (req.body.status !== undefined && !validStatus(req.body.status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const image = await prisma.stillImage.update({
    where: { id: req.params.imageId, productionId: production.id },
    data,
    include: imageInclude,
  });
  const actor = actorFromRequest(req);
  if (req.body.status !== undefined && existing.status !== image.status) {
    await recordActivity({ productionId: production.id, imageId: image.id, action: StillActivityAction.STATUS_CHANGED, ...actor, fromValue: existing.status, toValue: image.status });
  }
  if (req.body.rating !== undefined && existing.rating !== image.rating) {
    await recordActivity({ productionId: production.id, imageId: image.id, action: StillActivityAction.RATING_CHANGED, ...actor, fromValue: existing.rating === null ? null : String(existing.rating), toValue: image.rating === null ? null : String(image.rating) });
  }
  res.json(serializeImage(image));
});

router.post("/images/:imageId/skus", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, select: { id: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const skuIds = Array.isArray(req.body.skuIds) ? req.body.skuIds.map(String) : [];
  const skus = await prisma.productionSku.findMany({ where: { id: { in: skuIds }, productionId: production.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.stillImageSku.deleteMany({ where: { imageId: image.id } }),
    prisma.stillImageSku.createMany({ data: skus.map((sku) => ({ imageId: image.id, skuId: sku.id })), skipDuplicates: true }),
  ]);
  const updated = await prisma.stillImage.findUniqueOrThrow({ where: { id: image.id }, include: imageInclude });
  res.json(serializeImage(updated));
});

router.post("/batch", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const imageIds: string[] = Array.isArray(req.body.imageIds) ? req.body.imageIds.map(String) : [];
  if (imageIds.length === 0) { res.status(400).json({ error: "imageIds required" }); return; }
  const folderId = await assertFolderBelongsToProduction(req.body.folderId === undefined ? undefined : req.body.folderId, production.id);
  if (req.body.status !== undefined && !validStatus(req.body.status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const data: Prisma.StillImageUpdateManyMutationInput = {
    status: req.body.status,
    rating: req.body.rating === undefined ? undefined : req.body.rating === null ? null : Number(req.body.rating),
    isHero: req.body.isHero === undefined ? undefined : Boolean(req.body.isHero),
  };
  await prisma.stillImage.updateMany({ where: { id: { in: imageIds }, productionId: production.id }, data });
  if (folderId !== undefined) {
    await Promise.all(imageIds.map((imageId: string) => prisma.stillImage.update({
      where: { id: imageId, productionId: production.id },
      data: { folder: folderId === null ? { disconnect: true } : { connect: { id: folderId } } },
    })));
  }
  const skuIds = Array.isArray(req.body.skuIds) ? req.body.skuIds.map(String) : [];
  if (skuIds.length > 0) {
    const skus = await prisma.productionSku.findMany({ where: { id: { in: skuIds }, productionId: production.id }, select: { id: true } });
    await prisma.stillImageSku.createMany({
      data: imageIds.flatMap((imageId) => skus.map((sku) => ({ imageId, skuId: sku.id }))),
      skipDuplicates: true,
    });
  }
  const images = await prisma.stillImage.findMany({ where: { id: { in: imageIds }, productionId: production.id }, include: imageInclude });
  res.json(images.map((image) => serializeImage(image)));
});

router.post("/batch-copy", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const imageIds: string[] = Array.isArray(req.body.imageIds) ? req.body.imageIds.map(String) : [];
  if (imageIds.length === 0) { res.status(400).json({ error: "imageIds required" }); return; }
  const folderId = await assertFolderBelongsToProduction(req.body.folderId ?? null, production.id);
  const sourceImages = await prisma.stillImage.findMany({
    where: { id: { in: imageIds }, productionId: production.id },
    include: imageInclude,
  });
  const copied = [];
  for (const source of sourceImages) {
    const sourcePath = await resolveJobFilePath(source.jobFile);
    const storedFilename = `${randomUUID()}${fileExtension(source.jobFile.originalFilename, source.jobFile.mimeType)}`;
    const basePath = await ensureProductionFolders(production.id);
    const destination = path.join(basePath, STILL_FOLDER, storedFilename);
    await fs.copyFile(sourcePath, destination);
    const thumbnailJobFile = source.thumbnailJobFileId
      ? source.thumbnailJobFile
      : await createStillThumbnail({ productionIdValue: production.id, sourcePath, originalFilename: source.jobFile.originalFilename });
    const jobFile = await prisma.jobFile.create({
      data: {
        productionId: production.id,
        folder: STILL_FOLDER,
        originalFilename: source.jobFile.originalFilename,
        storedFilename,
        mimeType: source.jobFile.mimeType,
        sizeBytes: source.jobFile.sizeBytes,
      },
    });
    const image = await prisma.stillImage.create({
      data: {
        productionId: production.id,
        jobFileId: jobFile.id,
        thumbnailJobFileId: thumbnailJobFile?.id,
        folderId,
        status: source.status,
        rating: source.rating,
        isHero: source.isHero,
        retouchSummary: source.retouchSummary,
        skuTags: { create: source.skuTags.map((tag) => ({ skuId: tag.skuId })) },
      },
      include: imageInclude,
    });
    copied.push(serializeImage(image));
  }
  res.status(201).json(copied);
});

router.post("/images/:imageId/annotations", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, select: { id: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const body = String(req.body.body ?? "").trim();
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const visibility = req.body.visibility === undefined ? StillAnnotationVisibility.INTERNAL : req.body.visibility;
  if (!validVisibility(visibility)) { res.status(400).json({ error: "Invalid visibility" }); return; }
  const annotation = await prisma.stillAnnotation.create({
    data: {
      imageId: image.id,
      x: clampCoordinate(req.body.x),
      y: clampCoordinate(req.body.y),
      body,
      markup: normalizedMarkup(req.body.markup),
      visibility,
      authorName: req.session.email ?? "Internal",
      authorEmail: req.session.email,
    },
  });
  await recordActivity({
    productionId: production.id,
    imageId: image.id,
    action: StillActivityAction.COMMENTED,
    actorName: req.session.email ?? "Internal",
    actorEmail: req.session.email,
    actorRole: StillShareRole.CLIENT,
    toValue: body.slice(0, 250),
  });
  broadcastSelectsEvent({ type: "annotation_created", productionId: production.id, imageId: image.id, annotationId: annotation.id });
  res.status(201).json(annotation);
});

router.patch("/annotations/:annotationId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const annotation = await prisma.stillAnnotation.findFirst({
    where: { id: req.params.annotationId, image: { productionId: production.id } },
  });
  if (!annotation) { res.status(404).json({ error: "Annotation not found" }); return; }
  const visibility = req.body.visibility === undefined ? undefined : req.body.visibility;
  if (visibility !== undefined && !validVisibility(visibility)) { res.status(400).json({ error: "Invalid visibility" }); return; }
  const updated = await prisma.stillAnnotation.update({
    where: { id: annotation.id },
    data: {
      body: req.body.body,
      x: req.body.x === undefined ? undefined : clampCoordinate(req.body.x),
      y: req.body.y === undefined ? undefined : clampCoordinate(req.body.y),
      markup: normalizedMarkup(req.body.markup),
      visibility,
      resolved: req.body.resolved === undefined ? undefined : Boolean(req.body.resolved),
    },
  });
  if (req.body.resolved !== undefined) {
    await recordActivity({
      productionId: production.id,
      imageId: annotation.imageId,
      action: StillActivityAction.NOTE_RESOLVED,
      actorName: req.session.email ?? "Internal",
      actorEmail: req.session.email,
      fromValue: String(annotation.resolved),
      toValue: String(updated.resolved),
    });
  }
  broadcastSelectsEvent({ type: "annotation_updated", productionId: production.id, imageId: annotation.imageId, annotationId: updated.id });
  res.json(updated);
});

router.delete("/annotations/:annotationId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const annotation = await prisma.stillAnnotation.findFirst({ where: { id: req.params.annotationId, image: { productionId: production.id } }, select: { id: true, imageId: true } });
  if (!annotation) { res.status(404).json({ error: "Annotation not found" }); return; }
  await prisma.stillAnnotation.delete({ where: { id: annotation.id } });
  broadcastSelectsEvent({ type: "annotation_deleted", productionId: production.id, imageId: annotation.imageId, annotationId: annotation.id });
  res.status(204).end();
});

router.post("/share-links", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const folderId = await assertFolderBelongsToProduction(req.body.folderId ?? null, production.id);
  const token = randomBytes(24).toString("base64url");
  const password = typeof req.body.password === "string" ? req.body.password.trim() : "";
  const shareLink = await prisma.stillShareLink.create({
    data: {
      productionId: production.id,
      folderId,
      token,
      label: req.body.label || undefined,
      role: req.body.role === StillShareRole.RETOUCHER ? StillShareRole.RETOUCHER : StillShareRole.CLIENT,
      reviewerName: req.body.reviewerName ? String(req.body.reviewerName) : undefined,
      reviewerEmail: req.body.reviewerEmail ? String(req.body.reviewerEmail) : undefined,
      expiresAt: req.body.expiresAt ? new Date(String(req.body.expiresAt)) : undefined,
      allowDownloads: Boolean(req.body.allowDownloads),
      watermark: req.body.watermark === undefined ? true : Boolean(req.body.watermark),
      passwordHash: password ? await bcrypt.hash(password, 10) : undefined,
    },
  });
  res.status(201).json(serializeShareLink(shareLink));
});

router.patch("/share-links/:shareLinkId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const existing = await prisma.stillShareLink.findFirst({ where: { id: req.params.shareLinkId, productionId: production.id } });
  if (!existing) { res.status(404).json({ error: "Share link not found" }); return; }

  const data: Prisma.StillShareLinkUpdateInput = {};
  if ("label" in req.body) data.label = req.body.label ? String(req.body.label).slice(0, 160) : null;
  if ("folderId" in req.body) {
    const folderId = await assertFolderBelongsToProduction(req.body.folderId ?? null, production.id);
    data.folder = folderId ? { connect: { id: folderId } } : { disconnect: true };
  }
  if ("role" in req.body) data.role = req.body.role === StillShareRole.RETOUCHER ? StillShareRole.RETOUCHER : StillShareRole.CLIENT;
  if ("reviewerName" in req.body) data.reviewerName = req.body.reviewerName ? String(req.body.reviewerName).slice(0, 120) : null;
  if ("reviewerEmail" in req.body) data.reviewerEmail = req.body.reviewerEmail ? String(req.body.reviewerEmail).slice(0, 160) : null;
  if ("expiresAt" in req.body) data.expiresAt = req.body.expiresAt ? new Date(String(req.body.expiresAt)) : null;
  if ("allowDownloads" in req.body) data.allowDownloads = Boolean(req.body.allowDownloads);
  if ("watermark" in req.body) data.watermark = Boolean(req.body.watermark);
  if ("password" in req.body) {
    const password = typeof req.body.password === "string" ? req.body.password.trim() : "";
    data.passwordHash = password ? await bcrypt.hash(password, 10) : null;
  }

  const updated = await prisma.stillShareLink.update({ where: { id: existing.id }, data });
  res.json(serializeShareLink(updated));
});

router.delete("/share-links/:shareLinkId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const existing = await prisma.stillShareLink.findFirst({ where: { id: req.params.shareLinkId, productionId: production.id }, select: { id: true } });
  if (!existing) { res.status(404).json({ error: "Share link not found" }); return; }
  await prisma.stillShareLink.delete({ where: { id: existing.id } });
  res.status(204).end();
});

router.post("/images/:imageId/retouch-versions", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "file required" }); return; }
  try {
    const version = await createRetouchVersion({
      productionIdValue: production.id,
      imageId: req.params.imageId,
      file,
      notes: req.body.notes ? String(req.body.notes) : undefined,
      uploadedBy: req.session.email ?? "Internal",
    });
    res.status(201).json(version);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

router.get("/images/:imageId/retouch-versions/:versionId/download", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const version = await prisma.stillRetouchVersion.findFirst({
    where: { id: req.params.versionId, imageId: req.params.imageId, image: { productionId: production.id } },
    include: { jobFile: true },
  });
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }
  const filePath = await resolveJobFilePath(version.jobFile);
  res.setHeader("Content-Type", version.jobFile.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${version.jobFile.originalFilename.replace(/"/g, "'")}"`);
  (await import("node:fs")).createReadStream(filePath).pipe(res);
});

router.post("/images/:imageId/source-assets", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, select: { id: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const type = validSourceAssetType(req.body.type) ? req.body.type : StillSourceAssetType.OTHER;
  const externalUrl = String(req.body.externalUrl ?? "").trim();
  if (!externalUrl) { res.status(400).json({ error: "externalUrl required" }); return; }
  const sourceAsset = await prisma.stillSourceAsset.create({
    data: {
      imageId: image.id,
      type,
      label: nullableText(req.body.label),
      externalUrl,
    },
    include: { jobFile: true },
  });
  res.status(201).json(sourceAsset);
});

router.post("/images/:imageId/source-assets/upload", sourceUpload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, select: { id: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "file required" }); return; }
  const detectedMimeType = detectMimeType(file.originalname);
  const storedFilename = `${randomUUID()}${fileExtension(file.originalname, detectedMimeType)}`;
  const basePath = await ensureProductionFolders(production.id);
  await fs.writeFile(path.join(basePath, SOURCE_ASSET_FOLDER, storedFilename), file.buffer);
  const jobFile = await prisma.jobFile.create({
    data: {
      productionId: production.id,
      folder: SOURCE_ASSET_FOLDER,
      originalFilename: file.originalname,
      storedFilename,
      mimeType: detectedMimeType,
      sizeBytes: file.size,
    },
  });
  const type = validSourceAssetType(req.body.type) ? req.body.type : StillSourceAssetType.OTHER;
  const sourceAsset = await prisma.stillSourceAsset.create({
    data: {
      imageId: image.id,
      jobFileId: jobFile.id,
      type,
      label: nullableText(req.body.label) ?? file.originalname,
      sizeBytes: file.size,
      mimeType: detectedMimeType,
    },
    include: { jobFile: true },
  });
  res.status(201).json(sourceAsset);
});

router.patch("/source-assets/:sourceAssetId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const existing = await prisma.stillSourceAsset.findFirst({ where: { id: req.params.sourceAssetId, image: { productionId: production.id } } });
  if (!existing) { res.status(404).json({ error: "Source asset not found" }); return; }
  const type = req.body.type === undefined ? undefined : validSourceAssetType(req.body.type) ? req.body.type : existing.type;
  const updated = await prisma.stillSourceAsset.update({
    where: { id: existing.id },
    data: {
      type,
      label: req.body.label === undefined ? undefined : nullableText(req.body.label),
      externalUrl: req.body.externalUrl === undefined ? undefined : nullableText(req.body.externalUrl),
    },
    include: { jobFile: true },
  });
  res.json(updated);
});

router.delete("/source-assets/:sourceAssetId", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const existing = await prisma.stillSourceAsset.findFirst({
    where: { id: req.params.sourceAssetId, image: { productionId: production.id } },
    include: { jobFile: { select: { id: true, productionId: true, folder: true, storedFilename: true } } },
  });
  if (!existing) { res.status(404).json({ error: "Source asset not found" }); return; }
  await prisma.stillSourceAsset.delete({ where: { id: existing.id } });
  if (existing.jobFile) {
    const deletableFiles = await prisma.jobFile.findMany({
      where: {
        id: existing.jobFile.id,
        stillImage: { is: null },
        stillImageThumbnails: { none: {} },
        stillRetouchVersions: { none: {} },
        stillSourceAssets: { none: {} },
        skuThumbnails: { none: {} },
      },
      select: { id: true, productionId: true, folder: true, storedFilename: true },
    });
    if (deletableFiles.length > 0) {
      await prisma.jobFile.deleteMany({ where: { id: { in: deletableFiles.map((file) => file.id) } } });
      await unlinkStoredJobFiles(deletableFiles);
    }
  }
  res.status(204).end();
});

router.get("/images/:imageId/source-assets/:sourceAssetId/download", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const sourceAsset = await prisma.stillSourceAsset.findFirst({
    where: { id: req.params.sourceAssetId, imageId: req.params.imageId, image: { productionId: production.id } },
    include: { jobFile: true },
  });
  if (!sourceAsset?.jobFile) { res.status(404).json({ error: "Source file not found" }); return; }
  const filePath = await resolveJobFilePath(sourceAsset.jobFile);
  res.setHeader("Content-Type", sourceAsset.jobFile.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${sourceAsset.jobFile.originalFilename.replace(/"/g, "'")}"`);
  (await import("node:fs")).createReadStream(filePath).pipe(res);
});

router.get("/images/:imageId/thumbnail", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({
    where: { id: req.params.imageId, productionId: production.id },
    include: { thumbnailJobFile: true, jobFile: true },
  });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const file = image.thumbnailJobFile ?? image.jobFile;
  const filePath = await resolveJobFilePath(file);
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${file.originalFilename.replace(/"/g, "'")}"`);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  (await import("node:fs")).createReadStream(filePath).pipe(res);
});

router.get("/images/:imageId/download", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }
  const image = await prisma.stillImage.findFirst({ where: { id: req.params.imageId, productionId: production.id }, include: { jobFile: true } });
  if (!image) { res.status(404).json({ error: "Image not found" }); return; }
  const filePath = await resolveJobFilePath(image.jobFile);
  res.setHeader("Content-Type", image.jobFile.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${image.jobFile.originalFilename.replace(/"/g, "'")}"`);
  (await import("node:fs")).createReadStream(filePath).pipe(res);
});

router.post("/download-zip", async (req: Request, res: Response): Promise<void> => {
  const production = await ensureProduction(productionId(req));
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }

  const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.filter((id: unknown) => typeof id === "string") as string[] : [];
  const folderId = await assertFolderBelongsToProduction(req.body.folderId ?? undefined, production.id);
  const folderIds = folderId === undefined ? undefined : folderId === null ? [null] : await descendantFolderIds(folderId);
  const where: Prisma.StillImageWhereInput = {
    productionId: production.id,
    ...(imageIds.length > 0 ? { id: { in: imageIds } } : {}),
    ...(folderIds ? { folderId: folderIds[0] === null ? null : { in: folderIds as string[] } } : {}),
  };

  const images = await prisma.stillImage.findMany({
    where,
    include: { jobFile: true, folder: true },
    orderBy: [{ jobFile: { originalFilename: "asc" } }, { createdAt: "asc" }],
  });
  if (images.length === 0) { res.status(404).json({ error: "No images found for ZIP download" }); return; }

  const folders = await prisma.stillFolder.findMany({ where: { productionId: production.id }, select: { id: true, parentId: true, name: true } });
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const pathCache = new Map<string, string>();
  function folderPath(id: string | null) {
    if (!id) return "";
    const cached = pathCache.get(id);
    if (cached !== undefined) return cached;
    const parts: string[] = [];
    let cursor = folderById.get(id);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      parts.unshift(zipSafeSegment(cursor.name));
      cursor = cursor.parentId ? folderById.get(cursor.parentId) : undefined;
    }
    const value = parts.join("/");
    pathCache.set(id, value);
    return value;
  }

  const zipName = `${zipSafeSegment(production.title || production.jobCode || "selects")}-originals.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName.replace(/"/g, "'")}"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (error: Error) => {
    if (!res.headersSent) res.status(500).json({ error: error.message });
    else res.destroy(error);
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  for (const image of images) {
    const filePath = await resolveJobFilePath(image.jobFile);
    const prefix = folderPath(image.folderId);
    const entryName = uniqueZipName(`${prefix ? `${prefix}/` : ""}${image.jobFile.originalFilename}`, usedNames);
    archive.file(filePath, { name: entryName });
  }
  await archive.finalize();
});

export async function publicSelectsPayload(token: string, options: {
  folderId?: string;
  filter?: string;
  skuId?: string;
  skuIds?: string[];
  ratingFilter?: string;
  notesFilter?: string;
  retouchFilter?: string;
  reviewerName?: string;
  reviewerEmail?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const shareLink = await prisma.stillShareLink.findUnique({
    where: { token },
    include: {
      production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true } },
      folder: true,
    },
  });
  if (!shareLink) return null;
  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) return null;

  const scopedFolderIds = shareLink.folderId ? await descendantFolderIds(shareLink.folderId) : undefined;
  let requestedFolderIds: string[] | undefined;
  if (options.folderId) {
    requestedFolderIds = await descendantFolderIds(options.folderId);
    if (scopedFolderIds) requestedFolderIds = requestedFolderIds.filter((id) => scopedFolderIds.includes(id));
    if (requestedFolderIds.length === 0) requestedFolderIds = ["__none__"];
  }
  const folderIds = requestedFolderIds ?? scopedFolderIds;
  const where: Prisma.StillImageWhereInput = {
    productionId: shareLink.productionId,
    ...(folderIds ? { folderId: { in: folderIds } } : {}),
  };
  const and: Prisma.StillImageWhereInput[] = [];
  const scopedWhere: Prisma.StillImageWhereInput = {
    productionId: shareLink.productionId,
    ...(scopedFolderIds ? { folderId: { in: scopedFolderIds } } : {}),
  };
  if (options.filter === "SELECTED") where.status = StillStatus.CLIENT_SELECT;
  if (options.filter === "REJECTED") where.status = StillStatus.REJECTED;
  if (options.filter === "HAS_DECISION") where.status = { in: [StillStatus.CLIENT_SELECT, StillStatus.REJECTED] };
  if (options.filter === "NEEDS_DECISION") where.status = { notIn: [StillStatus.CLIENT_SELECT, StillStatus.REJECTED] };
  if (options.filter === "UNREVIEWED") and.push({ status: { notIn: [StillStatus.CLIENT_SELECT, StillStatus.REJECTED] } }, { OR: [{ rating: null }, { rating: 0 }] });
  if (options.filter === "COMMENTED") where.annotations = { some: { resolved: false, visibility: StillAnnotationVisibility.CLIENT } };
  if (options.filter === "STARRED") where.rating = { gt: 0 };
  const skuIds = options.skuIds?.filter(Boolean) ?? (options.skuId && options.skuId !== "ALL" ? [options.skuId] : []);
  if (skuIds.length > 0) where.skuTags = { some: { skuId: { in: skuIds } } };
  if (options.ratingFilter && options.ratingFilter !== "ALL") {
    if (options.ratingFilter === "ZERO") and.push({ OR: [{ rating: null }, { rating: 0 }] });
    if (options.ratingFilter === "ONE_PLUS") where.rating = { gt: 0 };
    if (options.ratingFilter === "THREE_PLUS") where.rating = { gte: 3 };
    if (options.ratingFilter === "FIVE") where.rating = 5;
    if (/^[1-5]$/.test(options.ratingFilter)) where.rating = Number(options.ratingFilter);
  }
  if (options.notesFilter && options.notesFilter !== "ALL") {
    const reviewer = options.reviewerEmail?.trim()
      ? { authorEmail: options.reviewerEmail.trim() }
      : options.reviewerName?.trim()
        ? { authorName: options.reviewerName.trim() }
        : {};
    if (options.notesFilter === "HAS") where.annotations = { some: { visibility: StillAnnotationVisibility.CLIENT } };
    if (options.notesFilter === "OPEN") where.annotations = { some: { visibility: StillAnnotationVisibility.CLIENT, resolved: false } };
    if (options.notesFilter === "RESOLVED") where.annotations = { some: { visibility: StillAnnotationVisibility.CLIENT, resolved: true } };
    if (options.notesFilter === "NONE") where.annotations = { none: { visibility: StillAnnotationVisibility.CLIENT } };
    if (options.notesFilter === "MY") where.annotations = { some: { visibility: StillAnnotationVisibility.CLIENT, ...reviewer } };
  }
  if (options.retouchFilter && options.retouchFilter !== "ALL") {
    if (options.retouchFilter === "HAS_VERSION") where.retouchVersions = { some: {} };
    if (options.retouchFilter === "NO_VERSION") where.retouchVersions = { none: {} };
    if (options.retouchFilter === "TO_RETOUCH") where.status = { in: [StillStatus.TO_RETOUCH, StillStatus.RETOUCHING] };
    if (options.retouchFilter === "CHANGES_REQUESTED") where.status = StillStatus.CHANGES_REQUESTED;
    if (options.retouchFilter === "APPROVED") where.status = { in: [StillStatus.APPROVED, StillStatus.DELIVERED] };
    if (options.retouchFilter === "HAS_SOURCE") where.sourceAssets = { some: {} };
    if (options.retouchFilter === "MISSING_SOURCE") where.sourceAssets = { none: {} };
  }
  if (options.search?.trim()) {
    const search = options.search.trim();
    where.OR = [
      { jobFile: { originalFilename: { contains: search, mode: "insensitive" } } },
      { skuTags: { some: { sku: { code: { contains: search, mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { name: { contains: search, mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { colorway: { contains: search, mode: "insensitive" } } } } },
      { skuTags: { some: { sku: { materialName: { contains: search, mode: "insensitive" } } } } },
    ];
  }
  if (and.length > 0) where.AND = and;
  const take = options.limit === undefined ? undefined : Math.max(1, Math.min(500, options.limit || 180));
  const skip = Math.max(0, options.offset || 0);
  const [folders, images, totalImages, scopedTotalImages, folderCountRows, statusCountRows, skus] = await Promise.all([
    prisma.stillFolder.findMany({
      where: { productionId: shareLink.productionId, ...(scopedFolderIds ? { id: { in: scopedFolderIds } } : {}) },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.stillImage.findMany({ where, orderBy: [{ jobFile: { originalFilename: "asc" } }, { createdAt: "asc" }], skip, take, include: galleryImageInclude }),
    prisma.stillImage.count({ where }),
    prisma.stillImage.count({ where: scopedWhere }),
    prisma.stillImage.groupBy({ by: ["folderId"], where: scopedWhere, _count: { _all: true } }),
    prisma.stillImage.groupBy({ by: ["status"], where: scopedWhere, _count: { _all: true } }),
    prisma.productionSku.findMany({ where: { productionId: shareLink.productionId }, orderBy: [{ name: "asc" }, { colorway: "asc" }, { materialName: "asc" }, { hardware: "asc" }, { code: "asc" }] }),
  ]);

  return {
    shareLink: serializeShareLink(shareLink),
    production: shareLink.production,
    folders,
    images: images.map((image) => {
      const serialized = serializeImage(image, true);
      return shareLink.role === StillShareRole.RETOUCHER ? serialized : { ...serialized, sourceAssets: [] };
    }),
    skus,
    totalImages: scopedTotalImages,
    folderCounts: Object.fromEntries(folderCountRows.filter((row) => row.folderId).map((row) => [row.folderId, row._count._all])),
    statusCounts: Object.fromEntries(statusCountRows.map((row) => [row.status, row._count._all])),
    pagination: { total: totalImages, limit: take ?? totalImages, offset: skip, hasMore: take !== undefined && skip + images.length < totalImages },
  };
}

export default router;
