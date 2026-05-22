import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import {
  BlackbookCategory,
  BlackbookEntryType,
  BlackbookLifecycleStatus,
  BlackbookOutreachStatus,
  CandidateDateHoldStatus,
  ContactType,
  OptionAvailability,
  OptionCandidateState,
  OptionRequirementState,
  OptionRequirementType,
  OptionStatus,
  ProductionDateStatus,
  Prisma,
  ProductionDateType,
} from "@prisma/client";
import prisma from "../prisma";
import { ensureProductionFolders, fileExtension, autoFileDocument } from "../services/fileStorage";
import { renderOptionsPdf } from "../services/optionsPdf";
import { optionsDeckFilename, renderOptionsDeckPdf } from "../services/optionsDeckPdf";

const router = Router();
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_MIME_TYPES = new Set(["application/pdf"]);
const PDF_IMAGE_MAX_EDGE = 2400;
const PDF_IMAGE_QUALITY = 84;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

type OptionFieldBody = {
  name?: string;
  subtitle?: string | null;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  bookUrl?: string | null;
  socialUrl?: string | null;
  modelsComUrl?: string | null;
  pdfUrl?: string | null;
  rate?: number | string | null;
  rateUnit?: string | null;
  currency?: string;
  status?: OptionStatus;
  isAvailable?: OptionAvailability;
  internalNotes?: string | null;
  clientNotes?: string | null;
  order?: number;
  blackbookEntryId?: string | null;
};

type BlackbookFieldBody = {
  entryType?: BlackbookEntryType;
  category?: BlackbookCategory;
  categoryConfigId?: string | null;
  typeIds?: string[];
  lifecycleStatus?: BlackbookLifecycleStatus;
  companyEntryId?: string | null;
  contactId?: string | null;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  tags?: string[];
  notes?: string | null;
  defaultRate?: number | string | null;
  rateUnit?: string | null;
  currency?: string;
  dietaryNotes?: string | null;
  dietaryFlags?: string[];
  allergens?: string[];
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  locationType?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  daylight?: boolean | null;
  blackout?: boolean | null;
  areaSqm?: number | string | null;
  shootingAreaSqm?: number | string | null;
  ceilingHeight?: string | null;
  accessNotes?: string | null;
  parkingNotes?: string | null;
  travelNotes?: string | null;
  facilities?: string | null;
  ukAgency?: string | null;
  frAgency?: string | null;
  bookUrl?: string | null;
  socialUrl?: string | null;
  polasUrl?: string | null;
  selfTapeUrl?: string | null;
  modelsComUrl?: string | null;
  height?: string | null;
  eyes?: string | null;
  hair?: string | null;
  bust?: string | null;
  waist?: string | null;
  hips?: string | null;
  shoe?: string | null;
};

type LegacyContactWithCompany = Prisma.ContactGetPayload<{ include: { company: true } }>;

function displayNameFromContact(contact: LegacyContactWithCompany): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.email || "Unnamed contact";
}

function lifecycleFromContactType(type: ContactType): BlackbookLifecycleStatus {
  return type === "SUPPLIER" ? "SUPPLIER" : "CLIENT";
}

function categoryFromContactType(type: ContactType): BlackbookCategory {
  return type === "SUPPLIER" ? "SERVICE" : "OTHER";
}

function parseCompanyAddress(address?: string | null): Pick<Prisma.BlackbookEntryUncheckedCreateInput, "addressLine1" | "city" | "postcode" | "country"> {
  if (!address?.trim()) return {};
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    addressLine1: parts[0] ?? address.trim(),
    city: parts.length > 2 ? parts[parts.length - 3] : undefined,
    postcode: parts.length > 1 ? parts[parts.length - 2] : undefined,
    country: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

async function ensureBlackbookCompany(company: LegacyContactWithCompany["company"]): Promise<string | null> {
  if (!company) return null;
  const existing = await prisma.blackbookEntry.findFirst({
    where: {
      entryType: "COMPANY",
      OR: [
        { displayName: { equals: company.name, mode: "insensitive" } },
        { companyName: { equals: company.name, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  const address = parseCompanyAddress(company.address);
  if (existing) {
    await prisma.blackbookEntry.update({
      where: { id: existing.id },
      data: {
        website: existing.website || company.website || undefined,
        notes: existing.notes || company.notes || undefined,
        addressLine1: existing.addressLine1 || address.addressLine1,
        city: existing.city || address.city,
        postcode: existing.postcode || address.postcode,
        country: existing.country || address.country,
      },
    });
    return existing.id;
  }
  const created = await prisma.blackbookEntry.create({
    data: {
      entryType: "COMPANY",
      lifecycleStatus: "CLIENT",
      category: "OTHER",
      displayName: company.name,
      companyName: company.name,
      website: company.website,
      notes: company.notes,
      ...address,
    },
  });
  return created.id;
}

async function mergeBlackbookDuplicate(primaryId: string, duplicateId: string): Promise<void> {
  if (primaryId === duplicateId) return;
  const [primary, duplicate] = await Promise.all([
    prisma.blackbookEntry.findUnique({ where: { id: primaryId }, include: { targetLists: true } }),
    prisma.blackbookEntry.findUnique({ where: { id: duplicateId }, include: { targetLists: true } }),
  ]);
  if (!primary || !duplicate) return;

  await prisma.optionCandidate.updateMany({ where: { blackbookEntryId: duplicateId }, data: { blackbookEntryId: primaryId } });
  await prisma.blackbookEntry.updateMany({ where: { companyEntryId: duplicateId }, data: { companyEntryId: primaryId } });

  for (const item of duplicate.targetLists) {
    const existing = primary.targetLists.find((primaryItem) => primaryItem.listId === item.listId);
    if (existing) {
      await prisma.blackbookTargetListEntry.delete({ where: { id: item.id } });
    } else {
      await prisma.blackbookTargetListEntry.update({ where: { id: item.id }, data: { entryId: primaryId } });
    }
  }

  await prisma.blackbookEntry.update({
    where: { id: primaryId },
    data: {
      email: primary.email || duplicate.email || undefined,
      phone: primary.phone || duplicate.phone || undefined,
      companyName: primary.companyName || duplicate.companyName || undefined,
      jobTitle: primary.jobTitle || duplicate.jobTitle || undefined,
      notes: primary.notes || duplicate.notes || undefined,
      contactId: primary.contactId || duplicate.contactId || undefined,
      companyEntryId: primary.companyEntryId || duplicate.companyEntryId || undefined,
      tags: Array.from(new Set([...primary.tags, ...duplicate.tags])),
    },
  });
  await prisma.blackbookEntry.delete({ where: { id: duplicateId } });
}

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

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function categoryFromRequirementType(type: OptionRequirementType): BlackbookCategory {
  if (type === "CREW") return "CREW";
  if (type === "SERVICE") return "SERVICE";
  if (type === "LOCATION") return "LOCATION";
  if (type === "EQUIPMENT") return "EQUIPMENT";
  if (type === "TALENT") return "TALENT";
  if (type === "TRANSPORT") return "TRANSPORT";
  if (type === "POST") return "POST";
  return "OTHER";
}

function entryTypeFromRequirementType(type: OptionRequirementType): BlackbookEntryType {
  if (type === "LOCATION") return "LOCATION";
  if (type === "TALENT") return "TALENT";
  if (type === "SERVICE" || type === "EQUIPMENT" || type === "TRANSPORT" || type === "POST") return "SERVICE";
  return "PERSON";
}

function blackbookDataFromBody(body: BlackbookFieldBody): Prisma.BlackbookEntryUpdateInput {
  const data: Prisma.BlackbookEntryUpdateInput = {};
  if (body.entryType !== undefined) data.entryType = body.entryType;
  if (body.category !== undefined) data.category = body.category;
  if (body.categoryConfigId !== undefined) data.categoryConfig = body.categoryConfigId ? { connect: { id: body.categoryConfigId } } : { disconnect: true };
  if (body.typeIds !== undefined) data.typeIds = body.typeIds;
  if (body.lifecycleStatus !== undefined) data.lifecycleStatus = body.lifecycleStatus;
  if (body.companyEntryId !== undefined) data.companyEntry = body.companyEntryId ? { connect: { id: body.companyEntryId } } : { disconnect: true };
  if (body.contactId !== undefined) data.contact = body.contactId ? { connect: { id: body.contactId } } : { disconnect: true };
  if (body.displayName !== undefined) data.displayName = body.displayName.trim();
  if (body.firstName !== undefined) data.firstName = optionalText(body.firstName);
  if (body.lastName !== undefined) data.lastName = optionalText(body.lastName);
  if (body.companyName !== undefined) data.companyName = optionalText(body.companyName);
  if (body.jobTitle !== undefined) data.jobTitle = optionalText(body.jobTitle);
  if (body.email !== undefined) data.email = optionalText(body.email)?.toLowerCase() ?? null;
  if (body.phone !== undefined) data.phone = optionalText(body.phone);
  if (body.website !== undefined) data.website = optionalText(body.website);
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.notes !== undefined) data.notes = optionalText(body.notes);
  if (body.defaultRate !== undefined) data.defaultRate = asNumber(body.defaultRate);
  if (body.rateUnit !== undefined) data.rateUnit = optionalText(body.rateUnit);
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.dietaryNotes !== undefined) data.dietaryNotes = optionalText(body.dietaryNotes);
  if (body.dietaryFlags !== undefined) data.dietaryFlags = body.dietaryFlags;
  if (body.allergens !== undefined) data.allergens = body.allergens;
  if (body.addressLine1 !== undefined) data.addressLine1 = optionalText(body.addressLine1);
  if (body.addressLine2 !== undefined) data.addressLine2 = optionalText(body.addressLine2);
  if (body.city !== undefined) data.city = optionalText(body.city);
  if (body.region !== undefined) data.region = optionalText(body.region);
  if (body.postcode !== undefined) data.postcode = optionalText(body.postcode);
  if (body.country !== undefined) data.country = optionalText(body.country);
  if (body.locationType !== undefined) data.locationType = optionalText(body.locationType);
  if (body.latitude !== undefined) data.latitude = asNumber(body.latitude);
  if (body.longitude !== undefined) data.longitude = asNumber(body.longitude);
  if (body.daylight !== undefined) data.daylight = body.daylight;
  if (body.blackout !== undefined) data.blackout = body.blackout;
  if (body.areaSqm !== undefined) data.areaSqm = asNumber(body.areaSqm);
  if (body.shootingAreaSqm !== undefined) data.shootingAreaSqm = asNumber(body.shootingAreaSqm);
  if (body.ceilingHeight !== undefined) data.ceilingHeight = optionalText(body.ceilingHeight);
  if (body.accessNotes !== undefined) data.accessNotes = optionalText(body.accessNotes);
  if (body.parkingNotes !== undefined) data.parkingNotes = optionalText(body.parkingNotes);
  if (body.travelNotes !== undefined) data.travelNotes = optionalText(body.travelNotes);
  if (body.facilities !== undefined) data.facilities = optionalText(body.facilities);
  if (body.ukAgency !== undefined) data.ukAgency = optionalText(body.ukAgency);
  if (body.frAgency !== undefined) data.frAgency = optionalText(body.frAgency);
  if (body.bookUrl !== undefined) data.bookUrl = optionalText(body.bookUrl);
  if (body.socialUrl !== undefined) data.socialUrl = optionalText(body.socialUrl);
  if (body.polasUrl !== undefined) data.polasUrl = optionalText(body.polasUrl);
  if (body.selfTapeUrl !== undefined) data.selfTapeUrl = optionalText(body.selfTapeUrl);
  if (body.modelsComUrl !== undefined) data.modelsComUrl = optionalText(body.modelsComUrl);
  if (body.height !== undefined) data.height = optionalText(body.height);
  if (body.eyes !== undefined) data.eyes = optionalText(body.eyes);
  if (body.hair !== undefined) data.hair = optionalText(body.hair);
  if (body.bust !== undefined) data.bust = optionalText(body.bust);
  if (body.waist !== undefined) data.waist = optionalText(body.waist);
  if (body.hips !== undefined) data.hips = optionalText(body.hips);
  if (body.shoe !== undefined) data.shoe = optionalText(body.shoe);
  return data;
}

function candidatePatchFromBlackbook(entry: {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  bookUrl: string | null;
  socialUrl: string | null;
  modelsComUrl: string | null;
  polasUrl: string | null;
  selfTapeUrl: string | null;
  defaultRate: number | null;
  rateUnit: string | null;
  currency: string;
}): Prisma.OptionCandidateUpdateInput {
  return {
    blackbookEntry: { connect: { id: entry.id } },
    name: entry.displayName,
    subtitle: entry.companyName,
    contactEmail: entry.email,
    contactPhone: entry.phone,
    website: entry.website,
    bookUrl: entry.bookUrl,
    socialUrl: entry.socialUrl,
    modelsComUrl: entry.modelsComUrl,
    pdfUrl: entry.polasUrl ?? entry.selfTapeUrl,
    rate: entry.defaultRate,
    rateUnit: entry.rateUnit,
    currency: entry.currency,
  };
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

function candidatePhotoUrl(photoId: string): string {
  return `/api/options/candidate-photos/${photoId}/serve`;
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_URL ?? "https://agent.unlimited.bond").replace(/\/$/, "");
}

function publicCandidatePdfUrl(token: string): string {
  return `${publicBaseUrl()}/api/public/options/candidate-pdfs/${token}`;
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

async function getOptionGroupWithDeckData(groupId: string) {
  return prisma.optionGroup.findUnique({
    where: { id: groupId },
    include: {
      production: true,
      candidates: {
        orderBy: { order: "asc" },
        include: {
          blackbookEntry: true,
          photos: { orderBy: { order: "asc" } },
          dateStatuses: {
            include: { date: true },
            orderBy: { date: { date: "asc" } },
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

async function matrixResponse(productionId: string) {
  const production = await prisma.production.findUnique({
    where: { id: productionId },
    select: { id: true, title: true, jobCode: true, clientName: true, brand: true },
  });
  if (!production) return null;

  const [dates, groups] = await Promise.all([
    prisma.productionDate.findMany({
      where: { productionId },
      orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
      select: { id: true, dateType: true, status: true, date: true, time: true, label: true, location: true, notes: true },
    }),
    prisma.optionGroup.findMany({
      where: { productionId },
      orderBy: { order: "asc" },
      include: {
        requirements: {
          orderBy: { order: "asc" },
          include: { dateNeeds: true, assignments: true },
        },
        candidates: {
          orderBy: { order: "asc" },
          include: { dateStatuses: true, assignments: true, blackbookEntry: true, photos: { orderBy: { order: "asc" } } },
        },
      },
    }),
  ]);

  return {
    production,
    dates,
    groups: groups.map((group) => ({
      ...group,
      candidates: group.candidates.map((candidate) => ({
        ...candidate,
        photos: candidate.photos.map((photo) => ({ ...photo, url: candidatePhotoUrl(photo.id) })),
      })),
    })),
  };
}

function matrixDateData(body: Record<string, unknown>) {
  return {
    dateType: body.dateType as ProductionDateType | undefined,
    status: body.status as ProductionDateStatus | undefined,
    date: body.date ? new Date(String(body.date)) : undefined,
    time: body.time as string | null | undefined,
    location: body.location as string | null | undefined,
    zoomLink: body.zoomLink as string | null | undefined,
    notes: body.notes as string | null | undefined,
    label: body.label as string | null | undefined,
  };
}

function slotLabel(name: string, slotNumber: number, quantity: number): string {
  return quantity > 1 ? `${name} ${slotNumber}` : name;
}

async function deletePhotosFromDisk(photos: Array<{ storedPath: string }>): Promise<void> {
  await Promise.all(photos.map((photo) => fs.unlink(photo.storedPath).catch(() => undefined)));
}

async function candidatePhotoDirectory(candidateId: string): Promise<string> {
  const candidate = await prisma.optionCandidate.findUnique({
    where: { id: candidateId },
    include: { production: { select: { id: true } }, group: { select: { name: true } } },
  });
  if (!candidate) throw new Error("Candidate not found");
  const productionRoot = await ensureProductionFolders(candidate.productionId);
  const dir = path.join(productionRoot, "Options", cleanPathPart(candidate.group.name), candidate.id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function convertOptionImage(file: Express.Multer.File): Promise<{ buffer: Buffer; width?: number; height?: number }> {
  const image = sharp(file.buffer, { failOn: "none" }).rotate().resize({
    width: PDF_IMAGE_MAX_EDGE,
    height: PDF_IMAGE_MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });
  const output = await image.jpeg({ quality: PDF_IMAGE_QUALITY, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { buffer: output.data, width: output.info.width, height: output.info.height };
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

function handlePdfUpload(req: Request, res: Response, next: (err?: unknown) => void): void {
  pdfUpload.single("pdf")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Maximum PDF size is 25MB" });
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

router.get("/production/:productionId/matrix", async (req: Request, res: Response): Promise<void> => {
  const data = await matrixResponse(req.params.productionId);
  if (!data) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  res.json(data);
});

router.get("/blackbook", async (req: Request, res: Response): Promise<void> => {
  const { q = "", category, entryType, lifecycleStatus, categoryConfigId, typeId, companyEntryId, listId, limit = "12" } = req.query as {
    q?: string;
    category?: BlackbookCategory;
    entryType?: BlackbookEntryType;
    lifecycleStatus?: BlackbookLifecycleStatus;
    categoryConfigId?: string;
    typeId?: string;
    companyEntryId?: string;
    listId?: string;
    limit?: string;
  };
  const search = q.trim();
  const where: Prisma.BlackbookEntryWhereInput = {};
  if (category) where.category = category;
  if (entryType) where.entryType = entryType;
  if (lifecycleStatus) where.lifecycleStatus = lifecycleStatus;
  if (categoryConfigId) where.categoryConfigId = categoryConfigId;
  if (typeId) where.typeIds = { has: typeId };
  if (companyEntryId) where.companyEntryId = companyEntryId;
  if (listId) where.targetLists = { some: { listId } };
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { country: { contains: search, mode: "insensitive" } },
      { tags: { has: search } },
    ];
  }
  const entries = await prisma.blackbookEntry.findMany({
    where,
    orderBy: [{ displayName: "asc" }],
    take: Math.min(50, Math.max(1, Number(limit) || 12)),
    include: { categoryConfig: true, companyEntry: { select: { id: true, displayName: true } }, targetLists: { include: { list: true } } },
  });
  res.json(entries);
});

router.get("/blackbook/lists", async (_req: Request, res: Response): Promise<void> => {
  const lists = await prisma.blackbookTargetList.findMany({
    where: { isArchived: false },
    orderBy: { updatedAt: "desc" },
    include: { entries: { include: { entry: true }, orderBy: { updatedAt: "desc" } } },
  });
  res.json(lists);
});

router.post("/blackbook/lists", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; description?: string | null };
  if (!body.name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const list = await prisma.blackbookTargetList.create({
    data: { name: body.name.trim(), description: optionalText(body.description) },
    include: { entries: { include: { entry: true } } },
  });
  res.status(201).json(list);
});

router.patch("/blackbook/lists/:listId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; description?: string | null; isArchived?: boolean };
  const list = await prisma.blackbookTargetList.update({
    where: { id: req.params.listId },
    data: {
      name: body.name === undefined ? undefined : body.name.trim(),
      description: body.description === undefined ? undefined : optionalText(body.description),
      isArchived: body.isArchived,
    },
    include: { entries: { include: { entry: true }, orderBy: { updatedAt: "desc" } } },
  });
  res.json(list);
});

router.post("/blackbook/lists/:listId/entries", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { entryId?: string; status?: BlackbookOutreachStatus; notes?: string | null; nextFollowUpAt?: string | null };
  if (!body.entryId) {
    res.status(400).json({ error: "entryId is required" });
    return;
  }
  const item = await prisma.blackbookTargetListEntry.upsert({
    where: { listId_entryId: { listId: req.params.listId, entryId: body.entryId } },
    update: {
      status: body.status,
      notes: optionalText(body.notes),
      nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
    },
    create: {
      listId: req.params.listId,
      entryId: body.entryId,
      status: body.status ?? "NOT_CONTACTED",
      notes: optionalText(body.notes),
      nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
    },
    include: { entry: true, list: true },
  });
  res.json(item);
});

router.delete("/blackbook/list-entries/:itemId", async (req: Request, res: Response): Promise<void> => {
  await prisma.blackbookTargetListEntry.delete({ where: { id: req.params.itemId } });
  res.json({ deleted: true });
});

router.patch("/blackbook/list-entries/:itemId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { status?: BlackbookOutreachStatus; notes?: string | null; nextFollowUpAt?: string | null };
  const item = await prisma.blackbookTargetListEntry.update({
    where: { id: req.params.itemId },
    data: {
      status: body.status,
      notes: body.notes === undefined ? undefined : optionalText(body.notes),
      nextFollowUpAt: body.nextFollowUpAt === undefined ? undefined : body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
    },
    include: { entry: true, list: true },
  });
  res.json(item);
});

router.post("/blackbook", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as BlackbookFieldBody;
  const displayName = body.displayName?.trim();
  if (!displayName) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }
  const entry = await prisma.blackbookEntry.create({
    data: {
      displayName,
      entryType: body.entryType ?? "PERSON",
      category: body.category ?? "OTHER",
      categoryConfigId: body.categoryConfigId,
      typeIds: body.typeIds ?? [],
      lifecycleStatus: body.lifecycleStatus ?? "IN_TOUCH",
      companyEntryId: body.companyEntryId,
      contactId: body.contactId,
      firstName: optionalText(body.firstName),
      lastName: optionalText(body.lastName),
      companyName: optionalText(body.companyName),
      jobTitle: optionalText(body.jobTitle),
      email: optionalText(body.email)?.toLowerCase() ?? null,
      phone: optionalText(body.phone),
      website: optionalText(body.website),
      tags: body.tags ?? [],
      notes: optionalText(body.notes),
      defaultRate: asNumber(body.defaultRate),
      rateUnit: optionalText(body.rateUnit),
      currency: body.currency ?? "GBP",
      dietaryNotes: optionalText(body.dietaryNotes),
      dietaryFlags: body.dietaryFlags ?? [],
      allergens: body.allergens ?? [],
      addressLine1: optionalText(body.addressLine1),
      addressLine2: optionalText(body.addressLine2),
      city: optionalText(body.city),
      region: optionalText(body.region),
      postcode: optionalText(body.postcode),
      country: optionalText(body.country),
      locationType: optionalText(body.locationType),
      latitude: asNumber(body.latitude),
      longitude: asNumber(body.longitude),
      daylight: body.daylight,
      blackout: body.blackout,
      areaSqm: asNumber(body.areaSqm),
      shootingAreaSqm: asNumber(body.shootingAreaSqm),
      ceilingHeight: optionalText(body.ceilingHeight),
      accessNotes: optionalText(body.accessNotes),
      parkingNotes: optionalText(body.parkingNotes),
      travelNotes: optionalText(body.travelNotes),
      facilities: optionalText(body.facilities),
      ukAgency: optionalText(body.ukAgency),
      frAgency: optionalText(body.frAgency),
      bookUrl: optionalText(body.bookUrl),
      socialUrl: optionalText(body.socialUrl),
      polasUrl: optionalText(body.polasUrl),
      selfTapeUrl: optionalText(body.selfTapeUrl),
      modelsComUrl: optionalText(body.modelsComUrl),
      height: optionalText(body.height),
      eyes: optionalText(body.eyes),
      hair: optionalText(body.hair),
      bust: optionalText(body.bust),
      waist: optionalText(body.waist),
      hips: optionalText(body.hips),
      shoe: optionalText(body.shoe),
    },
  });
  res.status(201).json(entry);
});

router.post("/blackbook/migrate-contacts", async (_req: Request, res: Response): Promise<void> => {
  const contacts = await prisma.contact.findMany({
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });

  let createdCompanies = 0;
  let createdPeople = 0;
  let linkedPeople = 0;
  let mergedDuplicates = 0;

  const companyCountBefore = await prisma.blackbookEntry.count({ where: { entryType: "COMPANY" } });

  for (const contact of contacts) {
    const companyEntryId = await ensureBlackbookCompany(contact.company);
    const email = contact.email?.trim().toLowerCase() || null;
    const displayName = displayNameFromContact(contact);
    const existing = await prisma.blackbookEntry.findFirst({
      where: {
        OR: [
          { contactId: contact.id },
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ],
      },
      orderBy: [
        { contactId: "desc" },
        { createdAt: "asc" },
      ],
    });
    const lifecycleStatus = lifecycleFromContactType(contact.type);
    const category = categoryFromContactType(contact.type);

    if (existing) {
      await prisma.blackbookEntry.update({
        where: { id: existing.id },
        data: {
          contactId: contact.id,
          displayName: existing.displayName || displayName,
          firstName: existing.firstName || contact.firstName || undefined,
          lastName: existing.lastName || contact.lastName || undefined,
          email: existing.email || email || undefined,
          phone: existing.phone || contact.phone || undefined,
          companyName: existing.companyName || contact.company?.name || undefined,
          companyEntryId: existing.companyEntryId || companyEntryId || undefined,
          jobTitle: existing.jobTitle || contact.jobTitle || undefined,
          notes: existing.notes || contact.notes || undefined,
          lifecycleStatus: existing.lifecycleStatus === "IN_TOUCH" ? lifecycleStatus : existing.lifecycleStatus,
          category: existing.category === "OTHER" ? category : existing.category,
          tags: Array.from(new Set([...existing.tags, ...contact.tags])),
        },
      });
      linkedPeople++;
    } else {
      await prisma.blackbookEntry.create({
        data: {
          entryType: "PERSON",
          lifecycleStatus,
          category,
          displayName,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email,
          phone: contact.phone,
          companyName: contact.company?.name,
          companyEntryId,
          jobTitle: contact.jobTitle,
          notes: contact.notes,
          tags: contact.tags,
          contactId: contact.id,
        },
      });
      createdPeople++;
    }
  }

  const duplicateEmails = await prisma.$queryRaw<Array<{ email: string }>>`
    SELECT lower(email) AS email
    FROM pms_blackbook_entries
    WHERE email IS NOT NULL AND email <> ''
    GROUP BY lower(email)
    HAVING count(*) > 1
  `;
  for (const item of duplicateEmails) {
    const duplicates = await prisma.blackbookEntry.findMany({
      where: { email: { equals: item.email, mode: "insensitive" } },
      orderBy: [{ contactId: "desc" }, { createdAt: "asc" }],
    });
    const [primary, ...rest] = duplicates;
    if (!primary) continue;
    for (const duplicate of rest) {
      await mergeBlackbookDuplicate(primary.id, duplicate.id);
      mergedDuplicates++;
    }
  }

  const companyCountAfter = await prisma.blackbookEntry.count({ where: { entryType: "COMPANY" } });
  createdCompanies = Math.max(0, companyCountAfter - companyCountBefore);

  res.json({
    contactsScanned: contacts.length,
    createdCompanies,
    createdPeople,
    linkedPeople,
    mergedDuplicates,
  });
});

router.get("/blackbook/:entryId/crm", async (req: Request, res: Response): Promise<void> => {
  const entry = await prisma.blackbookEntry.findUnique({
    where: { id: req.params.entryId },
    include: {
      contact: { include: { company: true } },
      categoryConfig: { include: { types: { orderBy: { order: "asc" } } } },
      companyEntry: { select: { id: true, displayName: true, email: true, companyName: true } },
      people: { orderBy: { displayName: "asc" }, include: { categoryConfig: true } },
      targetLists: { include: { list: true }, orderBy: { updatedAt: "desc" } },
      optionCandidates: {
        include: {
          production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true } },
          group: { select: { id: true, name: true, type: true } },
          dateStatuses: { include: { date: true }, orderBy: { date: { date: "asc" } } },
          assignments: { include: { requirement: true, date: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!entry) {
    res.status(404).json({ error: "Blackbook entry not found" });
    return;
  }

  const relatedEntryIds = entry.entryType === "COMPANY"
    ? [entry.id, ...entry.people.map((person) => person.id)]
    : [entry.id];
  const relatedContactIds = [entry.contactId, ...entry.people.map((person) => person.contactId)].filter((id): id is string => Boolean(id));
  const relatedEmails = [
    entry.email?.toLowerCase(),
    ...entry.people.map((person) => person.email?.toLowerCase()),
  ].filter((email): email is string => Boolean(email));
  const [emailMatches, opportunities, productions, optionCandidates] = await Promise.all([
    relatedEmails.length
      ? prisma.emailMessage.findMany({
          where: {
            OR: [
              { fromAddress: { in: relatedEmails, mode: "insensitive" } },
              { toAddresses: { hasSome: relatedEmails } },
              { ccAddresses: { hasSome: relatedEmails } },
              { bccAddresses: { hasSome: relatedEmails } },
            ],
          },
          orderBy: { sentAt: "desc" },
          take: 50,
          include: {
            thread: {
              select: {
                id: true,
                subject: true,
                linkedOpportunity: { select: { id: true, title: true, clientName: true, brand: true, stage: true } },
                linkedProduction: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    relatedContactIds.length
      ? prisma.opportunity.findMany({
          where: { contactId: { in: relatedContactIds } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, title: true, clientName: true, brand: true, stage: true, value: true, createdAt: true },
        })
      : Promise.resolve([]),
    relatedContactIds.length
      ? prisma.crewMember.findMany({
          where: { contactId: { in: relatedContactIds } },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true } } },
        })
      : Promise.resolve([]),
    prisma.optionCandidate.findMany({
      where: { blackbookEntryId: { in: relatedEntryIds } },
      include: {
        production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true } },
        group: { select: { id: true, name: true, type: true } },
        dateStatuses: { include: { date: true }, orderBy: { date: { date: "asc" } } },
        assignments: { include: { requirement: true, date: true } },
        blackbookEntry: { select: { id: true, displayName: true, email: true, companyEntryId: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  res.json({
    entry: { ...entry, optionCandidates },
    opportunities,
    productions,
    emailMessages: emailMatches,
    rollup: {
      entryIds: relatedEntryIds,
      contactIds: relatedContactIds,
      emailAddresses: relatedEmails,
      peopleCount: entry.people.length,
    },
  });
});

router.patch("/blackbook/:entryId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as BlackbookFieldBody;
  const entry = await prisma.blackbookEntry.update({
    where: { id: req.params.entryId },
    data: blackbookDataFromBody(body),
  });
  res.json(entry);
});

router.post("/production/:productionId/matrix/dates", async (req: Request, res: Response): Promise<void> => {
  const { date } = req.body as { date?: string };
  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  await prisma.productionDate.create({
    data: { ...matrixDateData(req.body as Record<string, unknown>), productionId: req.params.productionId, date: new Date(date) },
  });
  res.status(201).json(await matrixResponse(req.params.productionId));
});

router.post("/production/:productionId/matrix/groups", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; type?: OptionRequirementType; quantity?: number };
  const name = body.name?.trim();
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const production = await prisma.production.findUnique({ where: { id: req.params.productionId }, select: { id: true } });
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }
  const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));
  const order = await prisma.optionGroup.count({ where: { productionId: req.params.productionId } });
  const group = await prisma.optionGroup.create({
    data: {
      productionId: req.params.productionId,
      name,
      type: body.type ?? "OTHER",
      order,
    },
  });
  await prisma.optionRequirement.createMany({
    data: Array.from({ length: quantity }, (_, index) => ({
      productionId: req.params.productionId,
      groupId: group.id,
      name,
      displayLabel: slotLabel(name, index + 1, quantity),
      type: body.type ?? "OTHER",
      slotNumber: index + 1,
      order: order + index,
    })),
  });
  res.status(201).json(await matrixResponse(req.params.productionId));
});

router.patch("/matrix/requirements/:requirementId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    displayLabel?: string;
    name?: string;
    type?: OptionRequirementType;
    activeState?: OptionRequirementState;
    notes?: string | null;
    order?: number;
  };
  const data: Prisma.OptionRequirementUpdateInput = {};
  if (body.displayLabel !== undefined) data.displayLabel = body.displayLabel;
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.activeState !== undefined) data.activeState = body.activeState;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.order !== undefined) data.order = body.order;
  const requirement = await prisma.optionRequirement.update({ where: { id: req.params.requirementId }, data });
  res.json(await matrixResponse(requirement.productionId));
});

router.post("/matrix/requirements/:requirementId/duplicate", async (req: Request, res: Response): Promise<void> => {
  const requirement = await prisma.optionRequirement.findUnique({
    where: { id: req.params.requirementId },
    include: { dateNeeds: true },
  });
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }
  const slotNumber = await prisma.optionRequirement.count({ where: { groupId: requirement.groupId } }) + 1;
  const created = await prisma.optionRequirement.create({
    data: {
      productionId: requirement.productionId,
      groupId: requirement.groupId,
      name: requirement.name,
      displayLabel: slotLabel(requirement.name, slotNumber, slotNumber),
      type: requirement.type,
      slotNumber,
      activeState: requirement.activeState,
      notes: requirement.notes,
      order: requirement.order + 1,
    },
  });
  if (requirement.dateNeeds.length) {
    await prisma.requirementDateNeed.createMany({
      data: requirement.dateNeeds.map((need) => ({
        requirementId: created.id,
        dateId: need.dateId,
        isRequired: need.isRequired,
        notes: need.notes,
      })),
      skipDuplicates: true,
    });
  }
  res.status(201).json(await matrixResponse(requirement.productionId));
});

router.delete("/matrix/requirements/:requirementId", async (req: Request, res: Response): Promise<void> => {
  const requirement = await prisma.optionRequirement.findUnique({ where: { id: req.params.requirementId }, select: { id: true, productionId: true } });
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }
  await prisma.optionRequirement.delete({ where: { id: requirement.id } });
  res.json(await matrixResponse(requirement.productionId));
});

router.patch("/matrix/dates/:dateId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { status?: ProductionDateStatus; label?: string | null; dateType?: ProductionDateType };
  const data: Prisma.ProductionDateUpdateInput = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.label !== undefined) data.label = body.label;
  if (body.dateType !== undefined) data.dateType = body.dateType;
  const date = await prisma.productionDate.update({ where: { id: req.params.dateId }, data, select: { productionId: true } });
  res.json(await matrixResponse(date.productionId));
});

router.patch("/matrix/requirements/:requirementId/dates/:dateId", async (req: Request, res: Response): Promise<void> => {
  const { isRequired, notes } = req.body as { isRequired?: boolean; notes?: string | null };
  const requirement = await prisma.optionRequirement.findUnique({ where: { id: req.params.requirementId }, select: { id: true, productionId: true } });
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }
  await prisma.requirementDateNeed.upsert({
    where: { requirementId_dateId: { requirementId: req.params.requirementId, dateId: req.params.dateId } },
    update: {
      isRequired: isRequired ?? false,
      notes,
    },
    create: {
      requirementId: req.params.requirementId,
      dateId: req.params.dateId,
      isRequired: isRequired ?? true,
      notes,
    },
  });
  res.json(await matrixResponse(requirement.productionId));
});

router.patch("/matrix/requirements/:requirementId/dates/:dateId/assignment", async (req: Request, res: Response): Promise<void> => {
  const { candidateId, notes } = req.body as { candidateId?: string | null; notes?: string | null };
  const requirement = await prisma.optionRequirement.findUnique({
    where: { id: req.params.requirementId },
    select: { id: true, productionId: true, groupId: true },
  });
  if (!requirement) {
    res.status(404).json({ error: "Requirement not found" });
    return;
  }

  if (!candidateId) {
    await prisma.optionSlotAssignment.deleteMany({ where: { requirementId: requirement.id, dateId: req.params.dateId } });
    res.json(await matrixResponse(requirement.productionId));
    return;
  }

  const candidate = await prisma.optionCandidate.findUnique({ where: { id: candidateId }, select: { id: true, groupId: true } });
  if (!candidate || candidate.groupId !== requirement.groupId) {
    res.status(400).json({ error: "Candidate must belong to the same option group as the requirement" });
    return;
  }

  await prisma.optionSlotAssignment.upsert({
    where: { requirementId_dateId: { requirementId: requirement.id, dateId: req.params.dateId } },
    update: { candidateId, notes },
    create: { requirementId: requirement.id, dateId: req.params.dateId, candidateId, notes },
  });
  await prisma.candidateDateStatusRecord.upsert({
    where: { candidateId_dateId: { candidateId, dateId: req.params.dateId } },
    update: { status: "CONFIRMED" },
    create: { candidateId, dateId: req.params.dateId, status: "CONFIRMED" },
  });
  await prisma.requirementDateNeed.upsert({
    where: { requirementId_dateId: { requirementId: requirement.id, dateId: req.params.dateId } },
    update: { isRequired: true },
    create: { requirementId: requirement.id, dateId: req.params.dateId, isRequired: true },
  });
  res.json(await matrixResponse(requirement.productionId));
});

router.post("/matrix/groups/:groupId/candidates", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionFieldBody & { activeState?: OptionCandidateState };
  const group = await prisma.optionGroup.findUnique({ where: { id: req.params.groupId }, select: { id: true, productionId: true, type: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const linkedEntry = body.blackbookEntryId
    ? await prisma.blackbookEntry.findUnique({ where: { id: body.blackbookEntryId } })
    : null;
  await prisma.optionCandidate.create({
    data: {
      productionId: group.productionId,
      groupId: group.id,
      blackbookEntryId: linkedEntry?.id,
      name: body.name?.trim() || linkedEntry?.displayName || "New candidate",
      subtitle: body.subtitle ?? linkedEntry?.companyName,
      website: body.website ?? linkedEntry?.website,
      contactName: body.contactName,
      contactEmail: body.contactEmail ?? linkedEntry?.email,
      contactPhone: body.contactPhone ?? linkedEntry?.phone,
      bookUrl: body.bookUrl ?? linkedEntry?.bookUrl,
      socialUrl: body.socialUrl ?? linkedEntry?.socialUrl,
      modelsComUrl: body.modelsComUrl ?? linkedEntry?.modelsComUrl,
      pdfUrl: body.pdfUrl ?? linkedEntry?.polasUrl ?? linkedEntry?.selfTapeUrl,
      rate: asNumber(body.rate) ?? linkedEntry?.defaultRate,
      rateUnit: body.rateUnit ?? linkedEntry?.rateUnit,
      currency: body.currency ?? linkedEntry?.currency ?? "GBP",
      activeState: body.activeState ?? "ACTIVE",
      internalNotes: body.internalNotes,
      clientNotes: body.clientNotes,
      order: await prisma.optionCandidate.count({ where: { groupId: group.id } }),
    },
  });
  res.status(201).json(await matrixResponse(group.productionId));
});

router.patch("/matrix/candidates/:candidateId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionFieldBody & { activeState?: OptionCandidateState };
  const data: Prisma.OptionCandidateUpdateInput = {};
  if (body.blackbookEntryId !== undefined) {
    data.blackbookEntry = body.blackbookEntryId ? { connect: { id: body.blackbookEntryId } } : { disconnect: true };
  }
  if (body.name !== undefined) data.name = body.name;
  if (body.subtitle !== undefined) data.subtitle = body.subtitle;
  if (body.website !== undefined) data.website = body.website;
  if (body.contactName !== undefined) data.contactName = body.contactName;
  if (body.contactEmail !== undefined) data.contactEmail = body.contactEmail;
  if (body.contactPhone !== undefined) data.contactPhone = body.contactPhone;
  if (body.bookUrl !== undefined) data.bookUrl = optionalText(body.bookUrl);
  if (body.socialUrl !== undefined) data.socialUrl = optionalText(body.socialUrl);
  if (body.modelsComUrl !== undefined) data.modelsComUrl = optionalText(body.modelsComUrl);
  if (body.pdfUrl !== undefined) data.pdfUrl = optionalText(body.pdfUrl);
  if (body.rate !== undefined) data.rate = asNumber(body.rate);
  if (body.rateUnit !== undefined) data.rateUnit = body.rateUnit;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.activeState !== undefined) data.activeState = body.activeState;
  if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes;
  if (body.clientNotes !== undefined) data.clientNotes = body.clientNotes;
  if (body.order !== undefined) data.order = body.order;
  const candidate = await prisma.optionCandidate.update({ where: { id: req.params.candidateId }, data });
  res.json(await matrixResponse(candidate.productionId));
});

router.post("/matrix/candidates/:candidateId/link-blackbook", async (req: Request, res: Response): Promise<void> => {
  const { entryId, createFromCandidate = false } = req.body as { entryId?: string | null; createFromCandidate?: boolean };
  const candidate = await prisma.optionCandidate.findUnique({
    where: { id: req.params.candidateId },
    include: { group: { select: { type: true } } },
  });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  if (entryId === null) {
    const updated = await prisma.optionCandidate.update({
      where: { id: candidate.id },
      data: { blackbookEntry: { disconnect: true } },
    });
    res.json(await matrixResponse(updated.productionId));
    return;
  }

  let entry = entryId ? await prisma.blackbookEntry.findUnique({ where: { id: entryId } }) : null;
  if (!entry && createFromCandidate) {
    entry = await prisma.blackbookEntry.create({
      data: {
        displayName: candidate.name,
        entryType: entryTypeFromRequirementType(candidate.group.type),
        category: categoryFromRequirementType(candidate.group.type),
        companyName: candidate.subtitle,
        email: candidate.contactEmail,
        phone: candidate.contactPhone,
        website: candidate.website,
        defaultRate: candidate.rate,
        rateUnit: candidate.rateUnit,
        currency: candidate.currency,
        notes: candidate.internalNotes,
      },
    });
  }
  if (!entry) {
    res.status(400).json({ error: "entryId or createFromCandidate is required" });
    return;
  }

  const updated = await prisma.optionCandidate.update({
    where: { id: candidate.id },
    data: candidatePatchFromBlackbook(entry),
  });
  res.json(await matrixResponse(updated.productionId));
});

router.delete("/matrix/candidates/:candidateId", async (req: Request, res: Response): Promise<void> => {
  const candidate = await prisma.optionCandidate.findUnique({ where: { id: req.params.candidateId }, select: { id: true, productionId: true, photos: { select: { storedPath: true } } } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  await deletePhotosFromDisk(candidate.photos);
  await prisma.optionCandidate.delete({ where: { id: candidate.id } });
  res.json(await matrixResponse(candidate.productionId));
});

router.post("/matrix/candidates/:candidateId/photos", handlePhotoUpload, async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "photo is required" });
    return;
  }
  if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
    res.status(400).json({ error: "Only JPG, PNG, and WEBP photos are supported" });
    return;
  }
  const candidate = await prisma.optionCandidate.findUnique({
    where: { id: req.params.candidateId },
    include: { photos: true },
  });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (candidate.photos.length >= 10) {
    res.status(400).json({ error: "Maximum 10 photos per option" });
    return;
  }

  const converted = await convertOptionImage(file);
  const dir = await candidatePhotoDirectory(candidate.id);
  const storedFilename = `${randomUUID()}.jpg`;
  const storedPath = path.join(dir, storedFilename);
  await fs.writeFile(storedPath, converted.buffer);
  await prisma.optionCandidatePhoto.create({
    data: {
      candidateId: candidate.id,
      filename: file.originalname.replace(/\.[^.]+$/, ".jpg"),
      storedPath,
      sizeBytes: converted.buffer.length,
      width: converted.width,
      height: converted.height,
      order: candidate.photos.length,
      exportSelected: true,
    },
  });
  res.status(201).json(await matrixResponse(candidate.productionId));
});

router.post("/matrix/candidates/:candidateId/pdf", handlePdfUpload, async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "pdf is required" });
    return;
  }
  if (!PDF_MIME_TYPES.has(file.mimetype)) {
    res.status(400).json({ error: "Only PDF files are supported" });
    return;
  }

  const candidate = await prisma.optionCandidate.findUnique({
    where: { id: req.params.candidateId },
    select: { id: true, productionId: true, pdfStoredPath: true, pdfPublicToken: true },
  });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const dir = await candidatePhotoDirectory(candidate.id);
  const storedPath = path.join(dir, `${randomUUID()}.pdf`);
  const token = candidate.pdfPublicToken ?? randomUUID();
  await fs.writeFile(storedPath, file.buffer);
  if (candidate.pdfStoredPath) await fs.unlink(candidate.pdfStoredPath).catch(() => undefined);

  await prisma.optionCandidate.update({
    where: { id: candidate.id },
    data: {
      pdfFilename: file.originalname || "option.pdf",
      pdfStoredPath: storedPath,
      pdfSizeBytes: file.buffer.byteLength,
      pdfPublicToken: token,
      pdfUrl: publicCandidatePdfUrl(token),
    },
  });

  res.status(201).json(await matrixResponse(candidate.productionId));
});

router.patch("/matrix/candidates/:candidateId/photos/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  const candidate = await prisma.optionCandidate.findUnique({ where: { id: req.params.candidateId }, select: { id: true, productionId: true } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (!orderedIds?.length) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }
  await prisma.$transaction(orderedIds.map((id, order) => prisma.optionCandidatePhoto.update({ where: { id }, data: { order } })));
  res.json(await matrixResponse(candidate.productionId));
});

router.patch("/candidate-photos/:photoId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { caption?: string | null; exportSelected?: boolean };
  const photo = await prisma.optionCandidatePhoto.findUnique({ where: { id: req.params.photoId }, include: { candidate: true } });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  await prisma.optionCandidatePhoto.update({
    where: { id: photo.id },
    data: {
      caption: body.caption === undefined ? undefined : optionalText(body.caption),
      exportSelected: body.exportSelected,
    },
  });
  res.json(await matrixResponse(photo.candidate.productionId));
});

router.delete("/candidate-photos/:photoId", async (req: Request, res: Response): Promise<void> => {
  const photo = await prisma.optionCandidatePhoto.findUnique({ where: { id: req.params.photoId }, include: { candidate: true } });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  await fs.unlink(photo.storedPath).catch(() => undefined);
  await prisma.optionCandidatePhoto.delete({ where: { id: photo.id } });
  res.json(await matrixResponse(photo.candidate.productionId));
});

router.get("/candidate-photos/:photoId/serve", async (req: Request, res: Response): Promise<void> => {
  const photo = await prisma.optionCandidatePhoto.findUnique({ where: { id: req.params.photoId } });
  if (!photo) {
    res.status(404).json({ error: "Photo not found" });
    return;
  }
  if (!fsSync.existsSync(photo.storedPath)) {
    res.status(404).json({ error: "Photo missing on disk" });
    return;
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Disposition", `inline; filename="${photo.filename.replace(/"/g, "'")}"`);
  fsSync.createReadStream(photo.storedPath).pipe(res);
});

router.post("/matrix/groups/:groupId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  const group = await getOptionGroupWithDeckData(req.params.groupId);
  if (!group) {
    res.status(404).json({ error: "Option group not found" });
    return;
  }

  const pdfBuffer = await renderOptionsDeckPdf(group);
  const filename = optionsDeckFilename(group);
  await autoFileDocument(group.productionId, "Estimates", pdfBuffer, filename, "application/pdf", {
    notes: `Options deck export: ${group.name}`,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdfBuffer);
});

router.patch("/matrix/candidates/:candidateId/dates/:dateId", async (req: Request, res: Response): Promise<void> => {
  const { status, notes } = req.body as { status?: CandidateDateHoldStatus | null; notes?: string | null };
  const candidate = await prisma.optionCandidate.findUnique({ where: { id: req.params.candidateId }, select: { id: true, productionId: true } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (!status) {
    await prisma.candidateDateStatusRecord.deleteMany({ where: { candidateId: req.params.candidateId, dateId: req.params.dateId } });
  } else {
    await prisma.candidateDateStatusRecord.upsert({
      where: { candidateId_dateId: { candidateId: req.params.candidateId, dateId: req.params.dateId } },
      update: { status, notes },
      create: { candidateId: req.params.candidateId, dateId: req.params.dateId, status, notes },
    });
  }
  res.json(await matrixResponse(candidate.productionId));
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
