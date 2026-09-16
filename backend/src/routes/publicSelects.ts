import { Router, Request, Response } from "express";
import fsSync from "node:fs";
import path from "node:path";
import multer from "multer";
import bcrypt from "bcryptjs";
import { ZipArchive } from "archiver";
import { Prisma, StillActivityAction, StillAnnotationVisibility, StillShareRole, StillStatus } from "@prisma/client";
import prisma from "../prisma";
import { resolveJobFilePath } from "../services/fileStorage";
import { addSelectsRealtimeClient, broadcastSelectsEvent } from "../services/selectsRealtime";
import { createRetouchVersion, publicSelectsPayload, recordActivity } from "./selects";
import { boundedInteger, boundedString, optionalEmail, stringParam, tokenParam } from "../utils/validation";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

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

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function annotationSummary(annotation: { body: string; authorName?: string | null; resolved: boolean }) {
  return `${annotation.resolved ? "[resolved] " : ""}${annotation.authorName ? `${annotation.authorName}: ` : ""}${annotation.body}`;
}

async function requireShareAccess(req: Request, res: Response, token: string): Promise<boolean> {
  const shareLink = await prisma.stillShareLink.findUnique({ where: { token }, select: { token: true, passwordHash: true, expiresAt: true } });
  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) {
    res.status(404).json({ error: "Review link not found or expired" });
    return false;
  }
  if (!shareLink.passwordHash || req.session.unlockedSelectShareTokens?.includes(token)) return true;
  res.status(401).json({ error: "Password required", requiresPassword: true });
  return false;
}

async function loadShare(req: Request, res: Response, token: string) {
  if (!(await requireShareAccess(req, res, token))) return null;
  const payload = await publicSelectsPayload(token);
  if (!payload) return null;
  return payload;
}

async function publicDescendantFolderIds(folderId: string): Promise<string[]> {
  const ids = [folderId];
  let cursor = [folderId];
  while (cursor.length > 0) {
    const children = await prisma.stillFolder.findMany({ where: { parentId: { in: cursor } }, select: { id: true } });
    cursor = children.map((child) => child.id);
    ids.push(...cursor);
  }
  return ids;
}

async function loadPublicImage(req: Request, res: Response, token: string, imageId: string) {
  if (!(await requireShareAccess(req, res, token))) return null;
  const shareLink = await prisma.stillShareLink.findUnique({ where: { token }, select: { productionId: true, folderId: true, expiresAt: true } });
  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) return null;
  const folderIds = shareLink.folderId ? await publicDescendantFolderIds(shareLink.folderId) : undefined;
  return prisma.stillImage.findFirst({
    where: {
      id: imageId,
      productionId: shareLink.productionId,
      ...(folderIds ? { folderId: { in: folderIds } } : {}),
    },
    include: { thumbnailJobFile: true, jobFile: true },
  });
}

function reviewerFromRequest(req: Request, fallbackName = "Client") {
  const name = boundedString(req.body?.reviewerName, 120);
  const email = optionalEmail(req.body?.reviewerEmail);
  return {
    actorName: name || fallbackName,
    actorEmail: email,
  };
}

router.get("/:token", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  if (!(await requireShareAccess(req, res, token))) return;
  const payload = await publicSelectsPayload(token, {
    folderId: typeof req.query.folderId === "string" ? req.query.folderId : undefined,
    filter: typeof req.query.filter === "string" ? req.query.filter : undefined,
    skuId: typeof req.query.skuId === "string" ? req.query.skuId : undefined,
    skuIds: typeof req.query.skuIds === "string" ? req.query.skuIds.split(",").map((id) => id.trim()).filter(Boolean) : undefined,
    ratingFilter: typeof req.query.ratingFilter === "string" ? req.query.ratingFilter : undefined,
    notesFilter: typeof req.query.notesFilter === "string" ? req.query.notesFilter : undefined,
    retouchFilter: typeof req.query.retouchFilter === "string" ? req.query.retouchFilter : undefined,
    reviewerName: boundedString(req.query.reviewerName, 120) || undefined,
    reviewerEmail: optionalEmail(req.query.reviewerEmail),
    search: boundedString(req.query.search, 160) || undefined,
    limit: req.query.limit === "all" ? undefined : boundedInteger(req.query.limit, 100, 1, 250),
    offset: boundedInteger(req.query.offset, 0, 0, 100_000),
  });
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  res.json(payload);
});

router.get("/:token/events", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  if (!(await requireShareAccess(req, res, token))) return;
  const shareLink = await prisma.stillShareLink.findUnique({ where: { token }, select: { productionId: true, expiresAt: true } });
  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) { res.status(404).json({ error: "Review link not found or expired" }); return; }
  addSelectsRealtimeClient(shareLink.productionId, res);
});

router.post("/:token/unlock", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  const shareLink = await prisma.stillShareLink.findUnique({ where: { token }, select: { token: true, passwordHash: true, expiresAt: true } });
  if (!shareLink || (shareLink.expiresAt && shareLink.expiresAt < new Date())) { res.status(404).json({ error: "Review link not found or expired" }); return; }
  if (shareLink.passwordHash) {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password || !(await bcrypt.compare(password, shareLink.passwordHash))) {
      res.status(401).json({ error: "Incorrect password", requiresPassword: true });
      return;
    }
  }
  req.session.unlockedSelectShareTokens = Array.from(new Set([...(req.session.unlockedSelectShareTokens ?? []), token]));
  res.json({ ok: true });
});

router.post("/:token/images/:imageId/select", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const status = req.body.selected === null ? StillStatus.UPLOADED : req.body.selected === false ? StillStatus.REJECTED : StillStatus.CLIENT_SELECT;
  const updated = await prisma.stillImage.update({ where: { id: image.id }, data: { status } });
  const actor = reviewerFromRequest(req);
  await recordActivity({
    productionId: payload.shareLink.productionId,
    imageId: image.id,
    shareLinkId: payload.shareLink.id,
    action: StillActivityAction.STATUS_CHANGED,
    actorRole: payload.shareLink.role,
    ...actor,
    fromValue: image.status,
    toValue: status,
  });
  res.json(updated);
});

router.post("/:token/images/batch-select", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.filter((id: unknown) => typeof id === "string") as string[] : [];
  if (imageIds.length === 0) { res.status(400).json({ error: "imageIds required" }); return; }
  const shareLink = await prisma.stillShareLink.findUnique({ where: { token }, select: { productionId: true, folderId: true } });
  if (!shareLink) { res.status(404).json({ error: "Review link not found or expired" }); return; }
  const folderIds = shareLink.folderId ? await publicDescendantFolderIds(shareLink.folderId) : undefined;
  const selected = req.body.selected === false ? false : true;
  const status = selected ? StillStatus.CLIENT_SELECT : StillStatus.UPLOADED;
  await prisma.stillImage.updateMany({
    where: {
      id: { in: imageIds },
      productionId: shareLink.productionId,
      ...(folderIds ? { folderId: { in: folderIds } } : {}),
    },
    data: { status },
  });
  const actor = reviewerFromRequest(req);
  await recordActivity({
    productionId: payload.shareLink.productionId,
    shareLinkId: payload.shareLink.id,
    action: StillActivityAction.STATUS_CHANGED,
    actorRole: payload.shareLink.role,
    ...actor,
    toValue: selected ? "Batch selected visible images" : "Batch cleared visible images",
    metadata: { imageCount: imageIds.length },
  });
  res.json({ ok: true, imageIds, status });
});

router.post("/:token/images/:imageId/rating", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const rating = req.body.rating === null || req.body.rating === undefined ? null : Number(req.body.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 5)) {
    res.status(400).json({ error: "Invalid rating" });
    return;
  }
  const updated = await prisma.stillImage.update({ where: { id: image.id }, data: { rating } });
  const actor = reviewerFromRequest(req);
  await recordActivity({
    productionId: payload.shareLink.productionId,
    imageId: image.id,
    shareLinkId: payload.shareLink.id,
    action: StillActivityAction.RATING_CHANGED,
    actorRole: payload.shareLink.role,
    ...actor,
    fromValue: image.rating === null ? null : String(image.rating),
    toValue: rating === null ? null : String(rating),
  });
  res.json(updated);
});

router.post("/:token/images/:imageId/annotations", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const body = boundedString(req.body.body, 2000);
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const annotation = await prisma.stillAnnotation.create({
    data: {
      imageId: image.id,
      x: clampCoordinate(req.body.x),
      y: clampCoordinate(req.body.y),
      body,
      markup: normalizedMarkup(req.body.markup),
      visibility: StillAnnotationVisibility.CLIENT,
      authorName: boundedString(req.body.authorName, 120) || "Client",
      authorEmail: optionalEmail(req.body.authorEmail),
    },
  });
  const actor = reviewerFromRequest(req);
  await recordActivity({
    productionId: payload.shareLink.productionId,
    imageId: image.id,
    shareLinkId: payload.shareLink.id,
    action: StillActivityAction.COMMENTED,
    actorRole: payload.shareLink.role,
    ...actor,
    toValue: body.slice(0, 250),
  });
  broadcastSelectsEvent({ type: "annotation_created", productionId: payload.shareLink.productionId, imageId: image.id, annotationId: annotation.id });
  res.status(201).json(annotation);
});

router.patch("/:token/annotations/:annotationId", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const annotationId = stringParam(req, res, "annotationId");
  if (!token || !annotationId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const annotation = await prisma.stillAnnotation.findFirst({
    where: {
      id: annotationId,
      visibility: StillAnnotationVisibility.CLIENT,
      image: { productionId: payload.shareLink.productionId },
    },
  });
  if (!annotation || !payload.images.some((image) => image.id === annotation.imageId)) {
    if (!res.headersSent) res.status(404).json({ error: "Annotation not found" });
    return;
  }
  const body = req.body.body === undefined ? undefined : boundedString(req.body.body, 2000);
  if (req.body.body !== undefined && !body) { res.status(400).json({ error: "body required" }); return; }
  const updated = await prisma.stillAnnotation.update({
    where: { id: annotation.id },
    data: {
      body,
      x: req.body.x === undefined ? undefined : clampCoordinate(req.body.x),
      y: req.body.y === undefined ? undefined : clampCoordinate(req.body.y),
      markup: normalizedMarkup(req.body.markup),
      resolved: req.body.resolved === undefined ? undefined : Boolean(req.body.resolved),
    },
  });
  broadcastSelectsEvent({ type: "annotation_updated", productionId: payload.shareLink.productionId, imageId: annotation.imageId, annotationId: updated.id });
  res.json(updated);
});

router.delete("/:token/annotations/:annotationId", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const annotationId = stringParam(req, res, "annotationId");
  if (!token || !annotationId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const annotation = await prisma.stillAnnotation.findFirst({
    where: {
      id: annotationId,
      visibility: StillAnnotationVisibility.CLIENT,
      image: { productionId: payload.shareLink.productionId },
    },
    select: { id: true, imageId: true },
  });
  if (!annotation || !payload.images.some((image) => image.id === annotation.imageId)) {
    if (!res.headersSent) res.status(404).json({ error: "Annotation not found" });
    return;
  }
  await prisma.stillAnnotation.delete({ where: { id: annotation.id } });
  broadcastSelectsEvent({ type: "annotation_deleted", productionId: payload.shareLink.productionId, imageId: annotation.imageId, annotationId: annotation.id });
  res.status(204).end();
});

router.post("/:token/submit", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const selectedCount = payload.images.filter((image) => image.status === StillStatus.CLIENT_SELECT).length;
  const rejectedCount = payload.images.filter((image) => image.status === StillStatus.REJECTED).length;
  const actor = reviewerFromRequest(req);
  await recordActivity({
    productionId: payload.shareLink.productionId,
    shareLinkId: payload.shareLink.id,
    action: StillActivityAction.REVIEW_SUBMITTED,
    actorRole: payload.shareLink.role,
    ...actor,
    metadata: { selectedCount, rejectedCount },
  });
  const firstImage = payload.images[0];
  if (firstImage) {
    await prisma.stillAnnotation.create({
      data: {
        imageId: firstImage.id,
        x: 0.5,
        y: 0.5,
        body: `Client submitted review: ${selectedCount} selected, ${rejectedCount} rejected.`,
        visibility: StillAnnotationVisibility.INTERNAL,
        authorName: "Client portal",
      },
    }).catch(() => undefined);
  }
  res.json({ ok: true, selectedCount, rejectedCount });
});

router.post("/:token/images/:imageId/retouch-versions", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  if (payload.shareLink.role !== StillShareRole.RETOUCHER) { res.status(403).json({ error: "Retoucher access required" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const file = req.file as Express.Multer.File | undefined;
  if (!file) { res.status(400).json({ error: "file required" }); return; }
  const actor = reviewerFromRequest(req, "Retoucher");
  try {
    const version = await createRetouchVersion({
      productionIdValue: payload.shareLink.productionId,
      imageId: image.id,
      file,
      notes: boundedString(req.body.notes, 1000) || undefined,
      uploadedBy: actor.actorName,
    });
    await recordActivity({
      productionId: payload.shareLink.productionId,
      imageId: image.id,
      shareLinkId: payload.shareLink.id,
      action: StillActivityAction.VERSION_UPLOADED,
      actorRole: StillShareRole.RETOUCHER,
      ...actor,
      toValue: version.label ?? `v${version.version}`,
    });
    res.status(201).json(version);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
});

router.get("/:token/skus/:skuId/thumbnail", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const skuId = stringParam(req, res, "skuId");
  if (!token || !skuId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const sku = await prisma.productionSku.findFirst({
    where: { id: skuId, productionId: payload.shareLink.productionId },
    include: { thumbnailJobFile: true },
  });
  if (!sku?.thumbnailJobFile) { res.status(404).json({ error: "Thumbnail not found" }); return; }
  const filePath = await resolveJobFilePath(sku.thumbnailJobFile);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }
  res.setHeader("Content-Type", sku.thumbnailJobFile.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${sku.thumbnailJobFile.originalFilename.replace(/"/g, "'")}"`);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  fsSync.createReadStream(filePath).pipe(res);
});

router.get("/:token/images/:imageId/retouch-versions/:versionId/preview", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  const versionId = stringParam(req, res, "versionId");
  if (!token || !imageId || !versionId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const version = await prisma.stillRetouchVersion.findFirst({ where: { id: versionId, imageId: image.id }, include: { jobFile: true } });
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }
  const filePath = await resolveJobFilePath(version.jobFile);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }
  res.setHeader("Content-Type", version.jobFile.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${version.jobFile.originalFilename.replace(/"/g, "'")}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

router.get("/:token/images/:imageId/preview", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const filePath = await resolveJobFilePath(image.jobFile);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }
  res.setHeader("Content-Type", image.jobFile.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${image.jobFile.originalFilename.replace(/"/g, "'")}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

router.get("/:token/images/:imageId/thumbnail", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const image = await loadPublicImage(req, res, token, imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const file = image.thumbnailJobFile ?? image.jobFile;
  const filePath = await resolveJobFilePath(file);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${file.originalFilename.replace(/"/g, "'")}"`);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  fsSync.createReadStream(filePath).pipe(res);
});

router.get("/:token/images/:imageId/download", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  const imageId = stringParam(req, res, "imageId");
  if (!token || !imageId) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  if (!payload.shareLink.allowDownloads) { res.status(403).json({ error: "Downloads are disabled for this review link" }); return; }
  const image = payload.images.find((item) => item.id === imageId);
  if (!image) { if (!res.headersSent) res.status(404).json({ error: "Image not found" }); return; }
  const filePath = await resolveJobFilePath(image.jobFile);
  if (!fsSync.existsSync(filePath)) { res.status(404).json({ error: "File missing on disk" }); return; }
  res.setHeader("Content-Type", image.jobFile.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${image.jobFile.originalFilename.replace(/"/g, "'")}"`);
  fsSync.createReadStream(filePath).pipe(res);
});

router.post("/:token/retouch-package", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  if (payload.shareLink.role !== StillShareRole.RETOUCHER) { res.status(403).json({ error: "Retoucher access required" }); return; }

  const shareLink = await prisma.stillShareLink.findUnique({
    where: { token },
    select: { productionId: true, folderId: true, production: { select: { title: true, jobCode: true } } },
  });
  if (!shareLink) { res.status(404).json({ error: "Review link not found or expired" }); return; }
  const scopedFolderIds = shareLink.folderId ? await publicDescendantFolderIds(shareLink.folderId) : undefined;
  const requestedImageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.filter((id: unknown) => typeof id === "string") as string[] : [];
  const images = await prisma.stillImage.findMany({
    where: {
      productionId: shareLink.productionId,
      status: { in: [StillStatus.TO_RETOUCH, StillStatus.RETOUCHING, StillStatus.CHANGES_REQUESTED] },
      ...(scopedFolderIds ? { folderId: { in: scopedFolderIds } } : {}),
      ...(requestedImageIds.length > 0 ? { id: { in: requestedImageIds } } : {}),
    },
    include: {
      jobFile: true,
      folder: true,
      skuTags: { include: { sku: true }, orderBy: { createdAt: "asc" } },
      annotations: { orderBy: { createdAt: "asc" } },
      sourceAssets: { include: { jobFile: true }, orderBy: { createdAt: "asc" } },
      retouchVersions: { include: { jobFile: true }, orderBy: { version: "desc" } },
    },
    orderBy: [{ folder: { name: "asc" } }, { jobFile: { originalFilename: "asc" } }, { createdAt: "asc" }],
  });
  if (images.length === 0) { res.status(404).json({ error: "No retouch images found" }); return; }

  const folders = await prisma.stillFolder.findMany({ where: { productionId: shareLink.productionId }, select: { id: true, parentId: true, name: true } });
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

  const zipName = `${zipSafeSegment(shareLink.production.title || shareLink.production.jobCode || "selects")}-retouch-package.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName.replace(/"/g, "'")}"`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on("error", (error: Error) => {
    if (!res.headersSent) res.status(500).json({ error: error.message });
    else res.destroy(error);
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  const manifest = [
    ["filename", "folder", "status", "rating", "sku_tags", "retouch_summary", "notes", "source_links", "local_source_files", "retouch_versions"].map(csvCell).join(","),
  ];
  const contactRows: string[] = [];
  for (const image of images) {
    const folder = folderPath(image.folderId);
    const baseName = path.parse(image.jobFile.originalFilename).name;
    const originalEntry = uniqueZipName(`originals/${folder ? `${folder}/` : ""}${image.jobFile.originalFilename}`, usedNames);
    const originalPath = await resolveJobFilePath(image.jobFile);
    if (fsSync.existsSync(originalPath)) archive.file(originalPath, { name: originalEntry });

    const markupPayload = {
      imageId: image.id,
      filename: image.jobFile.originalFilename,
      folder,
      status: image.status,
      rating: image.rating ?? 0,
      skus: image.skuTags.map((tag) => tag.sku),
      retouchSummary: image.retouchSummary,
      annotations: image.annotations.map((annotation) => ({
        id: annotation.id,
        x: annotation.x,
        y: annotation.y,
        body: annotation.body,
        markup: annotation.markup,
        visibility: annotation.visibility,
        resolved: annotation.resolved,
        authorName: annotation.authorName,
        authorEmail: annotation.authorEmail,
        createdAt: annotation.createdAt,
      })),
      sourceAssets: image.sourceAssets.map((source) => ({
        id: source.id,
        type: source.type,
        label: source.label,
        externalUrl: source.externalUrl,
        localFilename: source.jobFile?.originalFilename ?? null,
        sizeBytes: source.sizeBytes ?? source.jobFile?.sizeBytes ?? null,
      })),
    };
    archive.append(JSON.stringify(markupPayload, null, 2), {
      name: uniqueZipName(`markups/${folder ? `${folder}/` : ""}${baseName}.markup.json`, usedNames),
    });

    const localSourceFiles: string[] = [];
    for (const source of image.sourceAssets) {
      if (!source.jobFile) continue;
      const sourcePath = await resolveJobFilePath(source.jobFile);
      if (!fsSync.existsSync(sourcePath)) continue;
      const sourceEntry = uniqueZipName(`source-assets/${folder ? `${folder}/` : ""}${baseName}/${source.jobFile.originalFilename}`, usedNames);
      archive.file(sourcePath, { name: sourceEntry });
      localSourceFiles.push(source.jobFile.originalFilename);
    }
    const sourceLinks = image.sourceAssets.filter((source) => source.externalUrl).map((source) => `${source.type}: ${source.externalUrl}`);
    const notes = image.annotations.map(annotationSummary);
    const skus = image.skuTags.map((tag) => [tag.sku.code, tag.sku.name, tag.sku.colorway, tag.sku.materialName].filter(Boolean).join(" · "));
    manifest.push([
      image.jobFile.originalFilename,
      folder,
      image.status,
      image.rating ?? "",
      skus.join(" | "),
      image.retouchSummary ?? "",
      notes.join(" | "),
      sourceLinks.join(" | "),
      localSourceFiles.join(" | "),
      image.retouchVersions.map((version) => `${version.label ?? `v${version.version}`}: ${version.jobFile.originalFilename}`).join(" | "),
    ].map(csvCell).join(","));
    contactRows.push(`
      <article>
        <h2>${htmlEscape(image.jobFile.originalFilename)}</h2>
        <p><strong>Status:</strong> ${htmlEscape(image.status)} &nbsp; <strong>Rating:</strong> ${htmlEscape(image.rating ?? 0)}</p>
        <p><strong>Folder:</strong> ${htmlEscape(folder || "Root")}</p>
        <p><strong>SKUs:</strong> ${htmlEscape(skus.join(" | ") || "None")}</p>
        <p><strong>Source:</strong> ${htmlEscape([...sourceLinks, ...localSourceFiles].join(" | ") || "Missing")}</p>
        <ul>${notes.map((note) => `<li>${htmlEscape(note)}</li>`).join("") || "<li>No notes</li>"}</ul>
      </article>
    `);
  }
  archive.append(`${manifest.join("\n")}\n`, { name: "manifest.csv" });
  archive.append(`<!doctype html><html><head><meta charset="utf-8"><title>Retouch package</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111}article{break-inside:avoid;border-bottom:1px solid #ddd;padding:16px 0}h1{font-size:22px}h2{font-size:15px;margin-bottom:8px}p,li{font-size:12px;line-height:1.45}</style></head><body><h1>Retouch package</h1>${contactRows.join("")}</body></html>`, { name: "retouch-contact-sheet.html" });
  await archive.finalize();
});

router.post("/:token/download-zip", async (req: Request, res: Response): Promise<void> => {
  const token = tokenParam(req, res);
  if (!token) return;
  const payload = await loadShare(req, res, token);
  if (!payload) { if (!res.headersSent) res.status(404).json({ error: "Review link not found or expired" }); return; }
  if (!payload.shareLink.allowDownloads) { res.status(403).json({ error: "Downloads are disabled for this review link" }); return; }
  const shareLink = await prisma.stillShareLink.findUnique({
    where: { token },
    select: { productionId: true, folderId: true, production: { select: { title: true, jobCode: true } } },
  });
  if (!shareLink) { res.status(404).json({ error: "Review link not found or expired" }); return; }

  const scopedFolderIds = shareLink.folderId ? await publicDescendantFolderIds(shareLink.folderId) : undefined;
  let requestedFolderIds: string[] | undefined;
  if (typeof req.body.folderId === "string" && req.body.folderId) {
    requestedFolderIds = await publicDescendantFolderIds(req.body.folderId);
    if (scopedFolderIds) requestedFolderIds = requestedFolderIds.filter((id) => scopedFolderIds.includes(id));
    if (requestedFolderIds.length === 0) requestedFolderIds = ["__none__"];
  }
  const folderIds = requestedFolderIds ?? scopedFolderIds;
  const imageIds = Array.isArray(req.body.imageIds) ? req.body.imageIds.filter((id: unknown) => typeof id === "string") as string[] : [];
  const mode = req.body.mode === "selected" ? "selected" : req.body.mode === "view" ? "view" : "folder";

  let viewImageIds: string[] | undefined;
  if (mode === "view") {
    const viewPayload = await publicSelectsPayload(token, {
      folderId: typeof req.body.folderId === "string" ? req.body.folderId : undefined,
      filter: typeof req.body.filter === "string" ? req.body.filter : undefined,
      skuIds: Array.isArray(req.body.skuIds) ? req.body.skuIds.filter((id: unknown) => typeof id === "string") as string[] : undefined,
      ratingFilter: typeof req.body.ratingFilter === "string" ? req.body.ratingFilter : undefined,
      notesFilter: typeof req.body.notesFilter === "string" ? req.body.notesFilter : undefined,
      retouchFilter: typeof req.body.retouchFilter === "string" ? req.body.retouchFilter : undefined,
      reviewerName: boundedString(req.body.reviewerName, 120) || undefined,
      reviewerEmail: optionalEmail(req.body.reviewerEmail),
      search: boundedString(req.body.search, 160) || undefined,
    });
    viewImageIds = viewPayload?.images.map((image) => image.id) ?? [];
  }

  const images = await prisma.stillImage.findMany({
    where: {
      productionId: shareLink.productionId,
      ...(folderIds ? { folderId: { in: folderIds } } : {}),
      ...(imageIds.length > 0 ? { id: { in: imageIds } } : {}),
      ...(viewImageIds ? { id: { in: viewImageIds.length > 0 ? viewImageIds : ["__none__"] } } : {}),
      ...(mode === "selected" && imageIds.length === 0 ? { status: StillStatus.CLIENT_SELECT } : {}),
    },
    include: { jobFile: true },
    orderBy: [{ jobFile: { originalFilename: "asc" } }, { createdAt: "asc" }],
  });
  if (images.length === 0) { res.status(404).json({ error: "No images found for ZIP download" }); return; }

  const folders = await prisma.stillFolder.findMany({ where: { productionId: shareLink.productionId }, select: { id: true, parentId: true, name: true } });
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

  const zipName = `${zipSafeSegment(shareLink.production.title || shareLink.production.jobCode || "selects")}-${mode === "selected" ? "selected" : mode === "view" ? "view" : "originals"}.zip`;
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
    archive.file(filePath, { name: uniqueZipName(`${prefix ? `${prefix}/` : ""}${image.jobFile.originalFilename}`, usedNames) });
  }
  await archive.finalize();
});

export default router;
