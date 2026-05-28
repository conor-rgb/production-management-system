import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import {
  BlackbookCategory,
  BlackbookAddressSource,
  BlackbookAddressType,
  BlackbookEntryType,
  BlackbookLifecycleStatus,
  BlackbookOutreachStatus,
  CandidateDateHoldStatus,
  ContactType,
  OptionAvailability,
  OptionCandidateState,
  OptionColumnType,
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
import { DeckTemplateBlock, optionsDeckFilename, renderOptionsDeckHtml, renderOptionsDeckPdf } from "../services/optionsDeckPdf";
import { getPlaceDetails, searchPlaces } from "../services/googlePlacesService";
import { ensureCandidateStaticMap } from "../services/optionMapService";

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
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  locationType?: string | null;
  rate?: number | string | null;
  rateUnit?: string | null;
  currency?: string;
  status?: OptionStatus;
  isAvailable?: OptionAvailability;
  internalNotes?: string | null;
  clientNotes?: string | null;
  order?: number;
  blackbookEntryId?: string | null;
  selectedAddressId?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type OptionColumnFieldBody = {
  label?: string;
  type?: OptionColumnType;
  width?: number | string;
  order?: number | string;
  hidden?: boolean;
  locked?: boolean;
  config?: Prisma.InputJsonValue | null;
};

type OptionColumnValueBody = {
  value?: Prisma.InputJsonValue | null;
};

type CoreOptionColumnDefinition = {
  key: string;
  label: string;
  type: OptionColumnType;
  width: number;
  order: number;
  config?: Prisma.InputJsonValue;
};

const CORE_OPTION_COLUMNS: CoreOptionColumnDefinition[] = [
  { key: "image", label: "Img", type: "ATTACHMENT", width: 56, order: 0 },
  { key: "option", label: "Option", type: "SINGLE_LINE_TEXT", width: 320, order: 10 },
  { key: "date_statuses", label: "Dates", type: "SINGLE_SELECT", width: 92, order: 20 },
  { key: "contact", label: "Contact", type: "BLACKBOOK_LINK", width: 160, order: 30 },
  { key: "clientNotes", label: "Deck notes", type: "LONG_TEXT", width: 230, order: 40 },
  { key: "internalNotes", label: "Internal", type: "LONG_TEXT", width: 170, order: 50 },
  { key: "links", label: "Links", type: "URL", width: 82, order: 60 },
  { key: "address", label: "Address", type: "SINGLE_LINE_TEXT", width: 190, order: 70 },
  { key: "rate", label: "Rate", type: "CURRENCY", width: 58, order: 80 },
  { key: "activeState", label: "State", type: "SINGLE_SELECT", width: 88, order: 90 },
];

type AddressFieldBody = {
  type?: BlackbookAddressType;
  label?: string | null;
  isDefaultBilling?: boolean;
  source?: BlackbookAddressSource;
  placeId?: string | null;
  placeName?: string | null;
  formattedAddress?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  website?: string | null;
  phone?: string | null;
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

const OPTION_COLUMN_TYPES = new Set<string>(Object.values(OptionColumnType));

function optionColumnType(value: unknown): OptionColumnType | undefined {
  if (typeof value !== "string") return undefined;
  return OPTION_COLUMN_TYPES.has(value) ? value as OptionColumnType : undefined;
}

function optionColumnWidth(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(80, Math.min(420, Math.round(parsed)));
}

function optionColumnKey(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return key || "field";
}

async function uniqueOptionColumnKey(groupId: string, label: string): Promise<string> {
  const base = optionColumnKey(label);
  let key = base;
  let suffix = 2;
  while (await prisma.optionColumn.findUnique({ where: { groupId_key: { groupId, key } } })) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

function optionColumnConfig(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  if (typeof value === "object" || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value as Prisma.InputJsonValue;
  }
  return undefined;
}

function optionColumnValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) return Prisma.JsonNull;
  if (typeof value === "object" || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value as Prisma.InputJsonValue;
  }
  return Prisma.JsonNull;
}

function addressDataFromBody(body: AddressFieldBody): Omit<Prisma.BlackbookAddressUncheckedCreateInput, "entryId"> {
  return {
    type: body.type ?? "WORK",
    label: optionalText(body.label),
    isDefaultBilling: body.isDefaultBilling ?? false,
    source: body.source ?? "MANUAL",
    placeId: optionalText(body.placeId),
    placeName: optionalText(body.placeName),
    formattedAddress: optionalText(body.formattedAddress),
    addressLine1: optionalText(body.addressLine1),
    addressLine2: optionalText(body.addressLine2),
    city: optionalText(body.city),
    region: optionalText(body.region),
    postcode: optionalText(body.postcode),
    country: optionalText(body.country),
    latitude: asNumber(body.latitude),
    longitude: asNumber(body.longitude),
    website: optionalText(body.website),
    phone: optionalText(body.phone),
  };
}

function addressPatchFromBody(body: AddressFieldBody): Prisma.BlackbookAddressUpdateInput {
  const data: Prisma.BlackbookAddressUpdateInput = {};
  if (body.type !== undefined) data.type = body.type;
  if (body.label !== undefined) data.label = optionalText(body.label);
  if (body.isDefaultBilling !== undefined) data.isDefaultBilling = body.isDefaultBilling;
  if (body.source !== undefined) data.source = body.source;
  if (body.placeId !== undefined) data.placeId = optionalText(body.placeId);
  if (body.placeName !== undefined) data.placeName = optionalText(body.placeName);
  if (body.formattedAddress !== undefined) data.formattedAddress = optionalText(body.formattedAddress);
  if (body.addressLine1 !== undefined) data.addressLine1 = optionalText(body.addressLine1);
  if (body.addressLine2 !== undefined) data.addressLine2 = optionalText(body.addressLine2);
  if (body.city !== undefined) data.city = optionalText(body.city);
  if (body.region !== undefined) data.region = optionalText(body.region);
  if (body.postcode !== undefined) data.postcode = optionalText(body.postcode);
  if (body.country !== undefined) data.country = optionalText(body.country);
  if (body.latitude !== undefined) data.latitude = asNumber(body.latitude);
  if (body.longitude !== undefined) data.longitude = asNumber(body.longitude);
  if (body.website !== undefined) data.website = optionalText(body.website);
  if (body.phone !== undefined) data.phone = optionalText(body.phone);
  return data;
}

async function clearOtherDefaultBilling(entryId: string, exceptId?: string): Promise<void> {
  await prisma.blackbookAddress.updateMany({
    where: { entryId, id: exceptId ? { not: exceptId } : undefined, isDefaultBilling: true },
    data: { isDefaultBilling: false },
  });
}

function candidateAddressPatch(address: {
  id: string;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Prisma.OptionCandidateUpdateInput {
  return {
    selectedAddress: { connect: { id: address.id } },
    addressLine1: address.addressLine1 ?? address.formattedAddress ?? address.placeName,
    addressLine2: address.addressLine2,
    city: address.city,
    region: address.region,
    postcode: address.postcode,
    country: address.country,
    latitude: address.latitude,
    longitude: address.longitude,
    mapImagePath: null,
    mapImageUpdatedAt: null,
  };
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

function entryTypeFromBlackbookCategory(category: BlackbookCategory): BlackbookEntryType {
  if (category === "LOCATION") return "LOCATION";
  if (category === "TALENT") return "TALENT";
  if (category === "SERVICE" || category === "EQUIPMENT" || category === "TRANSPORT" || category === "POST") return "SERVICE";
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
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationType: string | null;
  addresses?: Array<{
    id: string;
    placeName: string | null;
    formattedAddress: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postcode: string | null;
    country: string | null;
    latitude?: number | null;
    longitude?: number | null;
    isDefaultBilling: boolean;
  }>;
  defaultRate: number | null;
  rateUnit: string | null;
  currency: string;
}): Prisma.OptionCandidateUpdateInput {
  const selectedAddress = entry.addresses?.find((address) => address.isDefaultBilling) ?? entry.addresses?.[0] ?? null;
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
    ...(selectedAddress ? candidateAddressPatch(selectedAddress) : {
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2,
      city: entry.city,
      region: entry.region,
      postcode: entry.postcode,
      country: entry.country,
      latitude: entry.latitude,
      longitude: entry.longitude,
    }),
    locationType: entry.locationType,
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

function candidateMapUrl(candidateId: string): string {
  return `/api/options/matrix/candidates/${candidateId}/map/serve`;
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_URL ?? "https://agent.unlimited.bond").replace(/\/$/, "");
}

function publicCandidatePdfUrl(token: string): string {
  return `${publicBaseUrl()}/api/public/options/candidate-pdfs/${token}`;
}

const DECK_BLOCK_TYPES = new Set(["field", "links", "dateStatus", "imageGrid", "notes", "map", "footer"]);
const DECK_FIELDS = new Set(["name", "subtitle", "location", "address", "clientNotes", "internalNotes", "project"]);
const DECK_ALIGNS = new Set(["left", "center", "right"]);
const DECK_IMAGE_LAYOUTS = new Set(["grid", "justify"]);
const DECK_IMAGE_FITS = new Set(["contain", "cover", "natural"]);
const DECK_VERTICAL_ALIGNS = new Set(["top", "middle", "bottom"]);
const DECK_IMAGE_POSITIONS = new Set(["top", "center", "bottom"]);

function templateNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function templateColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

function sanitizeDeckBlocks(value: unknown): DeckTemplateBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index): DeckTemplateBlock[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" && DECK_BLOCK_TYPES.has(record.type) ? record.type as DeckTemplateBlock["type"] : null;
    if (!type) return [];
    const block: DeckTemplateBlock = {
      id: typeof record.id === "string" && record.id.trim() ? record.id : `${type}-${index}`,
      type,
      label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : type,
      x: templateNumber(record.x, 5, 0, 99),
      y: templateNumber(record.y, 5, 0, 99),
      w: templateNumber(record.w, 20, 1, 100),
      h: templateNumber(record.h, 10, 1, 100),
      fontSize: templateNumber(record.fontSize, 16, 4, 160),
      fontWeight: templateNumber(record.fontWeight, 400, 100, 1000),
      lineHeight: templateNumber(record.lineHeight, 1.2, 0.7, 3),
      letterSpacing: templateNumber(record.letterSpacing, 0, -5, 20),
      textPadding: templateNumber(record.textPadding, 0, 0, 120),
      textMaxLines: templateNumber(record.textMaxLines, 0, 0, 40),
      uppercase: record.uppercase === true,
      hideIfEmpty: record.hideIfEmpty === true,
      imageCount: templateNumber(record.imageCount, 4, 1, 12),
      imagePadding: templateNumber(record.imagePadding, 8, 0, 80),
      imageGap: templateNumber(record.imageGap, templateNumber(record.imagePadding, 8, 0, 80), 0, 80),
      imageRadius: templateNumber(record.imageRadius, 0, 0, 120),
      imageBorder: record.imageBorder === true,
      imageAllowRows: record.imageAllowRows === true,
      imageHideEmptySlots: record.imageHideEmptySlots === true,
      hidden: record.hidden === true,
      locked: record.locked === true,
    };
    const textColor = templateColor(record.textColor);
    const imageBackground = templateColor(record.imageBackground);
    if (textColor) block.textColor = textColor;
    if (imageBackground) block.imageBackground = imageBackground;
    if (typeof record.field === "string" && DECK_FIELDS.has(record.field)) block.field = record.field as DeckTemplateBlock["field"];
    if (typeof record.align === "string" && DECK_ALIGNS.has(record.align)) block.align = record.align as DeckTemplateBlock["align"];
    if (typeof record.verticalAlign === "string" && DECK_VERTICAL_ALIGNS.has(record.verticalAlign)) block.verticalAlign = record.verticalAlign as DeckTemplateBlock["verticalAlign"];
    if (typeof record.imageLayout === "string" && DECK_IMAGE_LAYOUTS.has(record.imageLayout)) block.imageLayout = record.imageLayout as DeckTemplateBlock["imageLayout"];
    if (typeof record.imageFit === "string" && DECK_IMAGE_FITS.has(record.imageFit)) block.imageFit = record.imageFit as DeckTemplateBlock["imageFit"];
    if (typeof record.imagePosition === "string" && DECK_IMAGE_POSITIONS.has(record.imagePosition)) block.imagePosition = record.imagePosition as DeckTemplateBlock["imagePosition"];
    return [block];
  });
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
          selectedAddress: true,
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

async function ensureCoreOptionColumns(productionId: string): Promise<void> {
  const groups = await prisma.optionGroup.findMany({
    where: { productionId },
    select: { id: true, columns: { select: { key: true, locked: true } } },
  });
  const writes = groups.flatMap((group) => {
    const existing = new Set(group.columns.map((column) => column.key));
    const hasCoreColumns = group.columns.some((column) => column.locked);
    const shiftExistingCustomColumns = !hasCoreColumns && group.columns.length > 0
      ? [prisma.optionColumn.updateMany({ where: { groupId: group.id, locked: false }, data: { order: { increment: 100 } } })]
      : [];
    return [
      ...shiftExistingCustomColumns,
      ...CORE_OPTION_COLUMNS
      .filter((column) => !existing.has(column.key))
      .map((column) => prisma.optionColumn.create({
        data: {
          groupId: group.id,
          key: column.key,
          label: column.label,
          type: column.type,
          width: column.width,
          order: column.order,
          locked: true,
          config: column.config,
        },
      })),
    ];
  });
  if (writes.length > 0) await prisma.$transaction(writes);
}

async function matrixResponse(productionId: string) {
  const production = await prisma.production.findUnique({
    where: { id: productionId },
    select: { id: true, title: true, jobCode: true, clientName: true, brand: true },
  });
  if (!production) return null;
  await ensureCoreOptionColumns(productionId);

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
        columns: { orderBy: { order: "asc" } },
        requirements: {
          orderBy: { order: "asc" },
          include: { dateNeeds: true, assignments: true },
        },
        candidates: {
          orderBy: { order: "asc" },
          include: {
            dateStatuses: true,
            assignments: true,
            selectedAddress: true,
            blackbookEntry: {
              include: {
                addresses: { orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }] },
              },
            },
            photos: { orderBy: { order: "asc" } },
            columnValues: true,
          },
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
        ...(() => {
          const { mapImagePath: _mapImagePath, ...publicCandidate } = candidate;
          return publicCandidate;
        })(),
        mapImageUrl:
          candidate.mapImagePath ||
          (candidate.latitude != null && candidate.longitude != null) ||
          (candidate.selectedAddress?.latitude != null && candidate.selectedAddress?.longitude != null)
            ? candidateMapUrl(candidate.id)
            : null,
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
    include: {
      addresses: { orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }] },
      categoryConfig: true,
      companyEntry: { select: { id: true, displayName: true } },
      targetLists: { include: { list: true } },
    },
  });
  res.json(entries);
});

router.get("/places/search", async (req: Request, res: Response): Promise<void> => {
  const { q = "", sessionToken } = req.query as { q?: string; sessionToken?: string };
  try {
    const results = await searchPlaces(q, sessionToken);
    res.json({ results });
  } catch (error) {
    console.error("[PLACES] Search failed", error);
    res.status(502).json({ error: "Place search failed" });
  }
});

router.post("/places/details", async (req: Request, res: Response): Promise<void> => {
  const { placeId, sessionToken } = req.body as { placeId?: string; sessionToken?: string };
  if (!placeId) {
    res.status(400).json({ error: "placeId is required" });
    return;
  }
  try {
    const place = await getPlaceDetails(placeId, sessionToken);
    res.json(place);
  } catch (error) {
    console.error("[PLACES] Details failed", error);
    res.status(502).json({ error: "Place details failed" });
  }
});

router.get("/blackbook/:entryId/addresses", async (req: Request, res: Response): Promise<void> => {
  const addresses = await prisma.blackbookAddress.findMany({
    where: { entryId: req.params.entryId },
    orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }],
  });
  res.json(addresses);
});

router.post("/blackbook/:entryId/addresses", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AddressFieldBody;
  const entry = await prisma.blackbookEntry.findUnique({ where: { id: req.params.entryId } });
  if (!entry) {
    res.status(404).json({ error: "Blackbook entry not found" });
    return;
  }
  if (body.isDefaultBilling) await clearOtherDefaultBilling(entry.id);
  const address = await prisma.blackbookAddress.create({
    data: {
      entryId: entry.id,
      ...addressDataFromBody(body),
    },
  });
  res.status(201).json(address);
});

router.patch("/blackbook/addresses/:addressId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AddressFieldBody;
  const existing = await prisma.blackbookAddress.findUnique({ where: { id: req.params.addressId } });
  if (!existing) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  if (body.isDefaultBilling) await clearOtherDefaultBilling(existing.entryId, existing.id);
  const address = await prisma.blackbookAddress.update({
    where: { id: existing.id },
    data: addressPatchFromBody(body),
  });
  res.json(address);
});

router.delete("/blackbook/addresses/:addressId", async (req: Request, res: Response): Promise<void> => {
  await prisma.blackbookAddress.delete({ where: { id: req.params.addressId } });
  res.json({ deleted: true });
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
      addresses: { orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }] },
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

router.post("/blackbook/:entryId/add-to-options", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    productionId?: string;
    groupId?: string;
    groupName?: string;
    groupType?: OptionRequirementType;
    quantity?: number;
  };
  if (!body.productionId) {
    res.status(400).json({ error: "productionId is required" });
    return;
  }

  const entry = await prisma.blackbookEntry.findUnique({
    where: { id: req.params.entryId },
    include: { addresses: { orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }] } },
  });
  if (!entry) {
    res.status(404).json({ error: "Blackbook entry not found" });
    return;
  }

  const production = await prisma.production.findUnique({ where: { id: body.productionId }, select: { id: true } });
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }

  let group = body.groupId
    ? await prisma.optionGroup.findFirst({ where: { id: body.groupId, productionId: production.id } })
    : null;

  if (!group) {
    const name = body.groupName?.trim();
    if (!name) {
      res.status(400).json({ error: "Choose a role or enter a new role name" });
      return;
    }
    const type = body.groupType ?? "OTHER";
    const quantity = Math.max(1, Math.floor(Number(body.quantity ?? 1)));
    const order = await prisma.optionGroup.count({ where: { productionId: production.id } });
    group = await prisma.optionGroup.create({
      data: { productionId: production.id, name, type, order },
    });
    await prisma.optionRequirement.createMany({
      data: Array.from({ length: quantity }, (_, index) => ({
        productionId: production.id,
        groupId: group!.id,
        name,
        displayLabel: slotLabel(name, index + 1, quantity),
        type,
        slotNumber: index + 1,
        order: order + index,
      })),
    });
  }

  const existing = await prisma.optionCandidate.findFirst({
    where: { productionId: production.id, groupId: group.id, blackbookEntryId: entry.id },
    select: { id: true },
  });
  if (existing) {
    res.json(await matrixResponse(production.id));
    return;
  }

  const selectedAddress = entry.addresses.find((address) => address.isDefaultBilling) ?? entry.addresses[0] ?? null;
  await prisma.optionCandidate.create({
    data: {
      production: { connect: { id: production.id } },
      group: { connect: { id: group.id } },
      blackbookEntry: { connect: { id: entry.id } },
      selectedAddress: selectedAddress ? { connect: { id: selectedAddress.id } } : undefined,
      name: entry.displayName,
      subtitle: entry.companyName,
      contactEmail: entry.email,
      contactPhone: entry.phone,
      website: entry.website,
      bookUrl: entry.bookUrl,
      socialUrl: entry.socialUrl,
      modelsComUrl: entry.modelsComUrl,
      pdfUrl: entry.polasUrl ?? entry.selfTapeUrl,
      addressLine1: selectedAddress?.addressLine1 ?? selectedAddress?.formattedAddress ?? selectedAddress?.placeName ?? entry.addressLine1,
      addressLine2: selectedAddress?.addressLine2 ?? entry.addressLine2,
      city: selectedAddress?.city ?? entry.city,
      region: selectedAddress?.region ?? entry.region,
      postcode: selectedAddress?.postcode ?? entry.postcode,
      country: selectedAddress?.country ?? entry.country,
      latitude: selectedAddress?.latitude ?? entry.latitude,
      longitude: selectedAddress?.longitude ?? entry.longitude,
      locationType: entry.locationType,
      rate: entry.defaultRate,
      rateUnit: entry.rateUnit,
      currency: entry.currency,
      order: await prisma.optionCandidate.count({ where: { groupId: group.id } }),
    },
  });
  res.status(201).json(await matrixResponse(production.id));
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

router.post("/matrix/groups/:groupId/columns", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionColumnFieldBody;
  const label = body.label?.trim();
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  const group = await prisma.optionGroup.findUnique({ where: { id: req.params.groupId }, select: { id: true, productionId: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const order = await prisma.optionColumn.count({ where: { groupId: group.id } });
  await prisma.optionColumn.create({
    data: {
      groupId: group.id,
      key: await uniqueOptionColumnKey(group.id, label),
      label,
      type: optionColumnType(body.type) ?? "SINGLE_LINE_TEXT",
      width: optionColumnWidth(body.width) ?? 160,
      order,
      config: optionColumnConfig(body.config),
    },
  });
  res.status(201).json(await matrixResponse(group.productionId));
});

router.patch("/matrix/columns/:columnId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionColumnFieldBody;
  const column = await prisma.optionColumn.findUnique({ where: { id: req.params.columnId }, include: { group: { select: { productionId: true } } } });
  if (!column) {
    res.status(404).json({ error: "Column not found" });
    return;
  }
  const data: Prisma.OptionColumnUpdateInput = {};
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) {
      res.status(400).json({ error: "label cannot be blank" });
      return;
    }
    data.label = label;
  }
  const type = optionColumnType(body.type);
  if (type !== undefined && !column.locked) data.type = type;
  const width = optionColumnWidth(body.width);
  if (width !== undefined) data.width = width;
  const order = asNumber(body.order);
  if (typeof order === "number") data.order = Math.max(0, Math.floor(order));
  if (body.hidden !== undefined) data.hidden = body.hidden;
  if (body.locked !== undefined && !column.locked) data.locked = body.locked;
  const config = optionColumnConfig(body.config);
  if (config !== undefined) data.config = config;
  await prisma.optionColumn.update({ where: { id: column.id }, data });
  res.json(await matrixResponse(column.group.productionId));
});

router.delete("/matrix/columns/:columnId", async (req: Request, res: Response): Promise<void> => {
  const column = await prisma.optionColumn.findUnique({ where: { id: req.params.columnId }, include: { group: { select: { productionId: true } } } });
  if (!column) {
    res.status(404).json({ error: "Column not found" });
    return;
  }
  if (column.locked) {
    res.status(400).json({ error: "Locked columns cannot be deleted" });
    return;
  }
  await prisma.optionColumn.delete({ where: { id: column.id } });
  res.json(await matrixResponse(column.group.productionId));
});

router.patch("/matrix/groups/:groupId/columns/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }
  const group = await prisma.optionGroup.findUnique({ where: { id: req.params.groupId }, select: { id: true, productionId: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  const columns = await prisma.optionColumn.findMany({ where: { groupId: group.id }, select: { id: true } });
  const validIds = new Set(columns.map((column) => column.id));
  await prisma.$transaction(
    orderedIds
      .filter((id) => validIds.has(id))
      .map((id, order) => prisma.optionColumn.update({ where: { id }, data: { order } }))
  );
  res.json(await matrixResponse(group.productionId));
});

router.patch("/matrix/candidates/:candidateId/columns/:columnId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as OptionColumnValueBody;
  const [candidate, column] = await Promise.all([
    prisma.optionCandidate.findUnique({ where: { id: req.params.candidateId }, select: { id: true, groupId: true, productionId: true } }),
    prisma.optionColumn.findUnique({ where: { id: req.params.columnId }, select: { id: true, groupId: true } }),
  ]);
  if (!candidate || !column) {
    res.status(404).json({ error: "Candidate or column not found" });
    return;
  }
  if (candidate.groupId !== column.groupId) {
    res.status(400).json({ error: "Column must belong to the same candidate sheet" });
    return;
  }
  await prisma.optionColumnValue.upsert({
    where: { candidateId_columnId: { candidateId: candidate.id, columnId: column.id } },
    update: { value: optionColumnValue(body.value) },
    create: { candidateId: candidate.id, columnId: column.id, value: optionColumnValue(body.value) },
  });
  res.json(await matrixResponse(candidate.productionId));
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
      addressLine1: body.addressLine1 ?? linkedEntry?.addressLine1,
      addressLine2: body.addressLine2 ?? linkedEntry?.addressLine2,
      city: body.city ?? linkedEntry?.city,
      region: body.region ?? linkedEntry?.region,
      postcode: body.postcode ?? linkedEntry?.postcode,
      country: body.country ?? linkedEntry?.country,
      locationType: body.locationType ?? linkedEntry?.locationType,
      latitude: asNumber(body.latitude) ?? linkedEntry?.latitude,
      longitude: asNumber(body.longitude) ?? linkedEntry?.longitude,
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
  if (body.selectedAddressId !== undefined) {
    if (body.selectedAddressId) {
      const address = await prisma.blackbookAddress.findUnique({ where: { id: body.selectedAddressId } });
      if (address) Object.assign(data, candidateAddressPatch(address));
    } else {
      data.selectedAddress = { disconnect: true };
    }
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
  if (body.addressLine1 !== undefined) data.addressLine1 = optionalText(body.addressLine1);
  if (body.addressLine2 !== undefined) data.addressLine2 = optionalText(body.addressLine2);
  if (body.city !== undefined) data.city = optionalText(body.city);
  if (body.region !== undefined) data.region = optionalText(body.region);
  if (body.postcode !== undefined) data.postcode = optionalText(body.postcode);
  if (body.country !== undefined) data.country = optionalText(body.country);
  if (body.locationType !== undefined) data.locationType = optionalText(body.locationType);
  if (body.latitude !== undefined) data.latitude = asNumber(body.latitude);
  if (body.longitude !== undefined) data.longitude = asNumber(body.longitude);
  if (
    body.selectedAddressId !== undefined ||
    body.addressLine1 !== undefined ||
    body.addressLine2 !== undefined ||
    body.city !== undefined ||
    body.region !== undefined ||
    body.postcode !== undefined ||
    body.country !== undefined ||
    body.latitude !== undefined ||
    body.longitude !== undefined
  ) {
    data.mapImagePath = null;
    data.mapImageUpdatedAt = null;
  }
  if (body.rate !== undefined) data.rate = asNumber(body.rate);
  if (body.rateUnit !== undefined) data.rateUnit = body.rateUnit;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.activeState !== undefined) data.activeState = body.activeState;
  if (body.internalNotes !== undefined) data.internalNotes = body.internalNotes;
  if (body.clientNotes !== undefined) data.clientNotes = body.clientNotes;
  if (body.order !== undefined) data.order = body.order;
  const candidate = await prisma.optionCandidate.update({ where: { id: req.params.candidateId }, data });

  if (candidate.blackbookEntryId && (body.contactEmail !== undefined || body.contactPhone !== undefined)) {
    await prisma.blackbookEntry.update({
      where: { id: candidate.blackbookEntryId },
      data: {
        email: body.contactEmail !== undefined ? optionalText(body.contactEmail)?.toLowerCase() ?? null : undefined,
        phone: body.contactPhone !== undefined ? optionalText(body.contactPhone) : undefined,
      },
    });
  }

  res.json(await matrixResponse(candidate.productionId));
});

router.post("/matrix/candidates/:candidateId/duplicate", async (req: Request, res: Response): Promise<void> => {
  const source = await prisma.optionCandidate.findUnique({
    where: { id: req.params.candidateId },
    include: {
      dateStatuses: true,
      photos: true,
      columnValues: true,
    },
  });
  if (!source) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const order = await prisma.optionCandidate.count({ where: { groupId: source.groupId } });
  await prisma.optionCandidate.create({
    data: {
      productionId: source.productionId,
      groupId: source.groupId,
      blackbookEntryId: source.blackbookEntryId,
      selectedAddressId: source.selectedAddressId,
      name: `${source.name} copy`,
      subtitle: source.subtitle,
      website: source.website,
      contactName: source.contactName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      bookUrl: source.bookUrl,
      socialUrl: source.socialUrl,
      modelsComUrl: source.modelsComUrl,
      pdfUrl: source.pdfUrl,
      pdfFilename: source.pdfFilename,
      pdfSizeBytes: source.pdfSizeBytes,
      addressLine1: source.addressLine1,
      addressLine2: source.addressLine2,
      city: source.city,
      region: source.region,
      postcode: source.postcode,
      country: source.country,
      locationType: source.locationType,
      latitude: source.latitude,
      longitude: source.longitude,
      rate: source.rate,
      rateUnit: source.rateUnit,
      currency: source.currency,
      activeState: source.activeState,
      internalNotes: source.internalNotes,
      clientNotes: source.clientNotes,
      order,
      dateStatuses: {
        create: source.dateStatuses.map((status) => ({
          dateId: status.dateId,
          status: status.status,
          notes: status.notes,
        })),
      },
      photos: {
        create: source.photos.map((photo) => ({
          filename: photo.filename,
          storedPath: photo.storedPath,
          sizeBytes: photo.sizeBytes,
          width: photo.width,
          height: photo.height,
          order: photo.order,
          caption: photo.caption,
          exportSelected: photo.exportSelected,
        })),
      },
      columnValues: {
        create: source.columnValues.map((columnValue) => ({
          columnId: columnValue.columnId,
          value: columnValue.value === null ? Prisma.JsonNull : columnValue.value,
        })),
      },
    },
  });

  res.status(201).json(await matrixResponse(source.productionId));
});

router.patch("/matrix/groups/:groupId/candidates/reorder", async (req: Request, res: Response): Promise<void> => {
  const { orderedIds } = req.body as { orderedIds?: string[] };
  const group = await prisma.optionGroup.findUnique({ where: { id: req.params.groupId }, select: { id: true, productionId: true } });
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  if (!orderedIds?.length) {
    res.status(400).json({ error: "orderedIds is required" });
    return;
  }

  const count = await prisma.optionCandidate.count({ where: { id: { in: orderedIds }, groupId: group.id } });
  if (count !== orderedIds.length) {
    res.status(400).json({ error: "All candidates must belong to this group" });
    return;
  }

  await prisma.$transaction(orderedIds.map((id, order) => prisma.optionCandidate.update({ where: { id }, data: { order } })));
  res.json(await matrixResponse(group.productionId));
});

router.post("/matrix/candidates/:candidateId/link-blackbook", async (req: Request, res: Response): Promise<void> => {
  const { entryId, createFromCandidate = false, create } = req.body as {
    entryId?: string | null;
    createFromCandidate?: boolean;
    create?: {
      categoryConfigId?: string | null;
      typeIds?: string[];
      lifecycleStatus?: BlackbookLifecycleStatus;
      category?: BlackbookCategory;
      entryType?: BlackbookEntryType;
    };
  };
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

  let entry = entryId
    ? await prisma.blackbookEntry.findUnique({
        where: { id: entryId },
        include: { addresses: { orderBy: [{ isDefaultBilling: "desc" }, { type: "asc" }, { createdAt: "asc" }] } },
      })
    : null;
  if (!entry && createFromCandidate) {
    const categoryConfig = create?.categoryConfigId
      ? await prisma.blackbookConfigCategory.findUnique({ where: { id: create.categoryConfigId } })
      : null;
    const category = categoryConfig?.broadType ?? create?.category ?? categoryFromRequirementType(candidate.group.type);
    const entryType = create?.entryType ?? entryTypeFromBlackbookCategory(category);
    entry = await prisma.blackbookEntry.create({
      data: {
        displayName: candidate.name,
        entryType,
        category,
        categoryConfigId: categoryConfig?.id ?? null,
        typeIds: create?.typeIds ?? [],
        lifecycleStatus: create?.lifecycleStatus ?? "SUPPLIER",
        companyName: candidate.subtitle,
        email: candidate.contactEmail,
        phone: candidate.contactPhone,
        website: candidate.website,
        defaultRate: candidate.rate,
        rateUnit: candidate.rateUnit,
        currency: candidate.currency,
        notes: candidate.internalNotes,
      },
      include: { addresses: true },
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

router.patch("/matrix/candidates/:candidateId/address", async (req: Request, res: Response): Promise<void> => {
  const { addressId } = req.body as { addressId?: string | null };
  const candidate = await prisma.optionCandidate.findUnique({ where: { id: req.params.candidateId } });
  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }
  if (!addressId) {
    const updated = await prisma.optionCandidate.update({
      where: { id: candidate.id },
      data: { selectedAddress: { disconnect: true } },
    });
    res.json(await matrixResponse(updated.productionId));
    return;
  }

  const address = await prisma.blackbookAddress.findUnique({ where: { id: addressId } });
  if (!address) {
    res.status(404).json({ error: "Address not found" });
    return;
  }
  const updated = await prisma.optionCandidate.update({
    where: { id: candidate.id },
    data: candidateAddressPatch(address),
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

router.get("/matrix/candidates/:candidateId/map/serve", async (req: Request, res: Response): Promise<void> => {
  let storedPath: string | null = null;
  try {
    storedPath = await ensureCandidateStaticMap(req.params.candidateId);
  } catch (error) {
    console.error("[OPTIONS MAP] Failed to generate static map:", error instanceof Error ? error.message : error);
    res.status(502).json({ error: "Map generation failed" });
    return;
  }
  if (!storedPath || !fsSync.existsSync(storedPath)) {
    res.status(404).json({ error: "No coordinates available for map" });
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", 'inline; filename="map.png"');
  fsSync.createReadStream(storedPath).pipe(res);
});

router.get("/matrix/groups/:groupId/deck-template", async (req: Request, res: Response): Promise<void> => {
  const group = await prisma.optionGroup.findUnique({
    where: { id: req.params.groupId },
    select: { id: true, name: true, deckTemplate: true },
  });
  if (!group) {
    res.status(404).json({ error: "Option group not found" });
    return;
  }
  res.json(group.deckTemplate ?? null);
});

router.patch("/matrix/groups/:groupId/deck-template", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; blocks?: unknown };
  const group = await prisma.optionGroup.findUnique({ where: { id: req.params.groupId }, select: { id: true, name: true } });
  if (!group) {
    res.status(404).json({ error: "Option group not found" });
    return;
  }
  const blocks = sanitizeDeckBlocks(body.blocks);
  if (!blocks.length) {
    res.status(400).json({ error: "At least one template block is required" });
    return;
  }
  const template = await prisma.optionDeckTemplate.upsert({
    where: { groupId: group.id },
    update: {
      name: body.name?.trim() || `${group.name} deck`,
      blocks: blocks as unknown as Prisma.InputJsonValue,
    },
    create: {
      groupId: group.id,
      name: body.name?.trim() || `${group.name} deck`,
      blocks: blocks as unknown as Prisma.InputJsonValue,
    },
  });
  res.json(template);
});

router.get("/matrix/groups/:groupId/export-preview-html", async (req: Request, res: Response): Promise<void> => {
  const group = await getOptionGroupWithDeckData(req.params.groupId);
  if (!group) {
    res.status(404).send("Option group not found");
    return;
  }

  const template = await prisma.optionDeckTemplate.findUnique({ where: { groupId: group.id } });
  const blocks = template ? sanitizeDeckBlocks(template.blocks) : null;
  if (blocks?.some((block) => block.type === "map")) {
    await Promise.all(group.candidates.map((candidate) => ensureCandidateStaticMap(candidate.id).catch(() => null)));
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderOptionsDeckHtml(group, blocks?.length ? blocks : null));
});

router.post("/matrix/groups/:groupId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  const group = await getOptionGroupWithDeckData(req.params.groupId);
  if (!group) {
    res.status(404).json({ error: "Option group not found" });
    return;
  }

  const template = await prisma.optionDeckTemplate.findUnique({ where: { groupId: group.id } });
  const blocks = template ? sanitizeDeckBlocks(template.blocks) : null;
  if (blocks?.some((block) => block.type === "map")) {
    await Promise.all(group.candidates.map((candidate) => ensureCandidateStaticMap(candidate.id).catch(() => null)));
  }
  const pdfBuffer = await renderOptionsDeckPdf(group, blocks?.length ? blocks : null);
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
