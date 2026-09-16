import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import mime from "mime-types";
import {
  ActivityEntityType,
  CrewItineraryItemType,
  CrewItineraryStatus,
  CrewStatus,
  FreeAgentInvoiceStatus,
  PmsJobType,
  Prisma,
  ProductionDateType,
  ProductionDateStatus,
  ProductionStatus,
} from "@prisma/client";
import prisma from "../prisma";
import { generateJobCode } from "../utils/jobCode";
import { autoFileDocument, ensureProductionFoldersForRecord } from "../services/fileStorage";
import { pushToGoogleCalendar, syncProductionDatesToCalendar } from "../services/calendarSyncService";
import { getPrimaryAccount } from "../services/googleCalendarService";
import { exportCrewItineraryPdf } from "../services/crewItineraryPdf";
import { parseTravelItineraryDocument } from "../services/travelItineraryParser";
import selectsRoutes from "./selects";

const router = Router();
router.use("/:id/selects", selectsRoutes);
const travelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 10 } });
const travelParseMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

const productionInclude = {
  dates: {
    orderBy: [{ date: "asc" as const }, { time: "asc" as const }],
    include: {
      people: {
        include: { contact: { include: { company: { select: { id: true, name: true } } } } },
      },
    },
  },
  crewMembers: {
    orderBy: { createdAt: "asc" as const },
    include: {
      role: true,
      contact: { include: { company: { select: { id: true, name: true } } } },
      blackbookEntry: { select: { id: true, displayName: true, entryType: true, category: true, email: true, phone: true, companyName: true } },
      optionCandidate: { select: { id: true, name: true, groupId: true, activeState: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      roleRequirement: { select: { id: true, name: true, displayLabel: true, type: true, groupId: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      itinerary: { select: { id: true, title: true, status: true, generatedAt: true, exportedAt: true, _count: { select: { items: true, appendixPages: true } } } },
    },
  },
  budgets: { include: { currentRevision: { include: { sections: { include: { lineItems: { include: { subCosts: true } } } } } } } },
  jobFiles: true,
  emailThreads: { include: { messages: { where: { isDuplicateSuppressed: false, isDraftArtifact: false }, orderBy: { sentAt: "desc" as const }, take: 1, select: { id: true, sentAt: true } } } },
  opportunity: true,
};

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function numberOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return Number(value);
}

function productionFinancials(production: Prisma.ProductionGetPayload<{ include: typeof productionInclude }>) {
  const currentRevision = production.budgets[0]?.currentRevision;
  const subtotal = currentRevision?.sections.reduce((sectionSum, section) => (
    sectionSum + section.lineItems.reduce((lineSum, line) => lineSum + Number(line.estimatedTotal ?? 0), 0)
  ), 0) ?? Number(production.value ?? 0);
  const productionFee = currentRevision ? subtotal * (currentRevision.productionFeePercent / 100) : 0;
  const insurance = currentRevision ? (subtotal + productionFee) * (currentRevision.insurancePercent / 100) : 0;
  const actualSpend = currentRevision?.sections.reduce((sectionSum, section) => (
    sectionSum + section.lineItems.reduce((lineSum, line) => lineSum + Number(line.actualTotal ?? 0), 0)
  ), 0) ?? Number(production.actualSpend ?? 0);
  const quotedValue = currentRevision ? subtotal + productionFee + insurance : Number(production.value ?? 0);
  const variance = quotedValue - actualSpend;

  return {
    actualSpend,
    quotedValue,
    variance,
    variancePercent: quotedValue > 0 ? (variance / quotedValue) * 100 : 0,
    overBudget: actualSpend > quotedValue,
  };
}

function withComputedFinancials(production: Prisma.ProductionGetPayload<{ include: typeof productionInclude }>) {
  const futureDates = production.dates.filter((date) => {
    const d = new Date(date.date);
    d.setHours(23, 59, 59, 999);
    return d >= new Date();
  });

  return {
    ...production,
    ...productionFinancials(production),
    nextDate: futureDates[0] ?? null,
  };
}

function productionDataFromBody(body: Record<string, unknown>) {
  return {
    title: body.title as string | undefined,
    clientName: body.clientName as string | undefined,
    brand: body.brand as string | undefined,
    jobType: body.jobType as PmsJobType | undefined,
    description: body.description as string | undefined,
    status: body.status as ProductionStatus | undefined,
    value: numberOrNull(body.value),
    freeAgentInvoiceStatus: body.freeAgentInvoiceStatus as FreeAgentInvoiceStatus | undefined,
    notes: body.notes as string | null | undefined,
    storagePath: body.storagePath as string | null | undefined,
    opportunityId: body.opportunityId as string | null | undefined,
    contactId: body.contactId as string | null | undefined,
  };
}

function dateDataFromBody(body: Record<string, unknown>) {
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

async function replaceDatePeople(productionDateId: string, peopleIds: unknown) {
  if (!Array.isArray(peopleIds)) return;
  await prisma.productionDatePerson.deleteMany({ where: { productionDateId } });
  if (peopleIds.length === 0) return;
  await prisma.productionDatePerson.createMany({
    data: peopleIds.map((contactId) => ({ productionDateId, contactId: String(contactId) })),
    skipDuplicates: true,
  });
}

async function syncDatesAndPush(productionDateId?: string): Promise<void> {
  try {
    await syncProductionDatesToCalendar();
    if (!productionDateId) return;
    const account = await getPrimaryAccount();
    if (!account) return;
    const event = await prisma.calendarEvent.findFirst({ where: { productionDateId } });
    if (!event) return;
    const googleId = await pushToGoogleCalendar(account, event);
    if (googleId) {
      await prisma.calendarEvent.update({
        where: { id: event.id },
        data: { googleCalendarEventId: googleId, googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary", lastSyncedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[CALENDAR] Production date sync failed:", err instanceof Error ? err.message : err);
  }
}

// Lightweight index contract: no message bodies, files, contacts or budget line graphs.
router.get("/summary", async (req: Request, res: Response): Promise<void> => {
  try {
    const where: Prisma.ProductionWhereInput = req.query.includeWrapped === "true" ? {} : { status: { notIn: [ProductionStatus.WRAPPED, ProductionStatus.CLOSED] } };
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 200) : "";
    if (search) where.OR = ["title", "clientName", "brand", "jobCode", "notes"].map(key => ({ [key]: { contains: search, mode: "insensitive" } }));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const items = await prisma.production.findMany({ where, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], select: {
      id: true, title: true, jobCode: true, clientName: true, brand: true, status: true, updatedAt: true,
      value: true, actualSpend: true, driveFolderId: true, driveFolderName: true,
      dates: { where: { date: { gte: start } }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 1, select: { id: true, date: true, dateType: true } },
      _count: { select: { crewMembers: { where: { hiddenFromCrewList: false } } } },
      budgets: { select: { id: true, currencyBase: true, status: true, currentRevision: { select: { status: true, revisionNumber: true } } } },
    } });
    res.json(items.map(({ dates, _count, budgets, value, ...item }) => ({ ...item, quotedValue: Number(value ?? 0), variance: Number(value ?? 0) - item.actualSpend, overBudget: item.actualSpend > Number(value ?? 0), nextDate: dates[0] ?? null, crewCount: _count.crewMembers, budget: budgets[0] ?? null })));
  } catch { res.status(500).json({ error: "Could not load project summaries." }); }
});

// GET /api/productions?includeWrapped=true&search=...
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { includeWrapped, search } = req.query;
  const where: Prisma.ProductionWhereInput = {};

  if (includeWrapped !== "true") {
    where.status = { not: ProductionStatus.WRAPPED };
  }

  if (search) {
    const s = String(search);
    where.OR = [
      { title: { contains: s, mode: "insensitive" } },
      { clientName: { contains: s, mode: "insensitive" } },
      { brand: { contains: s, mode: "insensitive" } },
      { jobCode: { contains: s, mode: "insensitive" } },
      { notes: { contains: s, mode: "insensitive" } },
    ];
  }

  const items = await prisma.production.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: productionInclude,
  });
  res.json(items.map(withComputedFinancials));
});

// GET /api/productions/dates/today
router.get("/dates/today", async (_req: Request, res: Response): Promise<void> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const dates = await prisma.productionDate.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ time: "asc" }, { createdAt: "asc" }],
    include: {
      production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, status: true } },
      people: { include: { contact: true } },
    },
  });
  res.json(dates);
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.production.findUnique({
    where: { id: req.params.id },
    include: productionInclude,
  });
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const [activityNotes, activityTasks] = await Promise.all([
    prisma.activityNote.findMany({
      where: { entityType: ActivityEntityType.PRODUCTION, entityId: req.params.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.activityTask.findMany({
      where: { entityType: ActivityEntityType.PRODUCTION, entityId: req.params.id },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  res.json({ ...withComputedFinancials(item), activityNotes, activityTasks });
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { title, jobCode } = req.body;
  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const item = await prisma.production.create({
    data: {
      ...productionDataFromBody(req.body),
      title,
      jobCode: jobCode ?? await generateJobCode(),
    },
    include: productionInclude,
  });
  await ensureProductionFoldersForRecord(item);
  const saved = await prisma.production.findUnique({ where: { id: item.id }, include: productionInclude });
  res.status(201).json(withComputedFinancials(saved ?? item));
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const before = await prisma.production.findUnique({ where: { id: req.params.id }, select: { status: true } });
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const item = await prisma.production.update({
    where: { id: req.params.id },
    data: productionDataFromBody(req.body),
    include: productionInclude,
  });
  res.json({
    production: withComputedFinancials(item),
    invoicePrompt: before.status !== ProductionStatus.WRAPPED && item.status === ProductionStatus.WRAPPED,
  });
});

router.post("/:id/status", async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body;
  if (!Object.values(ProductionStatus).includes(status)) {
    res.status(400).json({ error: "valid status required" });
    return;
  }

  const before = await prisma.production.findUnique({ where: { id: req.params.id }, select: { status: true } });
  if (!before) { res.status(404).json({ error: "Not found" }); return; }

  const item = await prisma.production.update({
    where: { id: req.params.id },
    data: { status },
    include: productionInclude,
  });
  res.json({
    production: withComputedFinancials(item),
    invoicePrompt: before.status !== ProductionStatus.WRAPPED && item.status === ProductionStatus.WRAPPED,
  });
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.production.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Dates ───────────────────────────────────────────────────────────────────

router.post("/:id/dates", async (req: Request, res: Response): Promise<void> => {
  if (!req.body.date) { res.status(400).json({ error: "date required" }); return; }
  const date = await prisma.productionDate.create({
    data: { ...dateDataFromBody(req.body), productionId: req.params.id, date: new Date(req.body.date) },
  });
  await replaceDatePeople(date.id, req.body.peopleIds);
  const saved = await prisma.productionDate.findUnique({
    where: { id: date.id },
    include: { people: { include: { contact: true } } },
  });
  await syncDatesAndPush(date.id);
  res.status(201).json(saved);
});

router.patch("/:id/dates/:dateId", async (req: Request, res: Response): Promise<void> => {
  const date = await prisma.productionDate.update({
    where: { id: req.params.dateId, productionId: req.params.id },
    data: dateDataFromBody(req.body),
  });
  await replaceDatePeople(date.id, req.body.peopleIds);
  const saved = await prisma.productionDate.findUnique({
    where: { id: date.id },
    include: { people: { include: { contact: true } } },
  });
  await syncDatesAndPush(date.id);
  res.json(saved);
});

router.delete("/:id/dates/:dateId", async (req: Request, res: Response): Promise<void> => {
  await prisma.productionDate.delete({ where: { id: req.params.dateId, productionId: req.params.id } });
  await syncDatesAndPush();
  res.status(204).end();
});

// ─── Crew ────────────────────────────────────────────────────────────────────

async function resolveCrewContact(body: Record<string, unknown>) {
  if (body.contactId) return String(body.contactId);
  const email = body.email ? String(body.email) : undefined;
  const name = String(body.name ?? "").trim();
  if (!name) return undefined;

  if (email) {
    const existing = await prisma.contact.findFirst({ where: { email } });
    if (existing) return existing.id;
  }

  const [firstName, ...rest] = name.split(" ");
  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName: rest.join(" ") || undefined,
      email,
      phone: body.phone ? String(body.phone) : undefined,
      type: "SUPPLIER",
      source: "OTHER",
    },
  });
  return contact.id;
}

function crewDataFromBody(body: Record<string, unknown>) {
  return {
    roleId: body.roleId as string | null | undefined,
    roleRequirementId: body.roleRequirementId as string | null | undefined,
    name: body.name as string | undefined,
    email: body.email as string | null | undefined,
    phone: body.phone as string | null | undefined,
    status: body.status as CrewStatus | undefined,
    dayRate: numberOrNull(body.dayRate),
    numberOfDays: numberOrUndefined(body.numberOfDays),
    notes: body.notes as string | null | undefined,
    hiddenFromCrewList: body.hiddenFromCrewList as boolean | undefined,
  };
}

const itineraryInclude = {
  crewMember: {
    include: {
      role: true,
      contact: { include: { company: { select: { id: true, name: true } } } },
      blackbookEntry: { select: { id: true, displayName: true, email: true, phone: true, companyName: true, entryType: true, category: true } },
      roleRequirement: { select: { id: true, name: true, displayLabel: true, type: true, groupId: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
    },
  },
  items: {
    orderBy: [{ order: "asc" as const }, { createdAt: "asc" as const }],
    include: { files: { include: { file: true }, orderBy: { createdAt: "asc" as const } } },
  },
  appendixPages: { orderBy: [{ order: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.CrewItineraryInclude;

function dateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(String(value));
}

function decimalOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function itemType(value: unknown): CrewItineraryItemType {
  return Object.values(CrewItineraryItemType).includes(value as CrewItineraryItemType) ? value as CrewItineraryItemType : CrewItineraryItemType.EVENT;
}

function itineraryPatch(body: Record<string, unknown>): Prisma.CrewItineraryUncheckedUpdateInput {
  const status = body.status === undefined ? undefined : Object.values(CrewItineraryStatus).includes(body.status as CrewItineraryStatus) ? body.status as CrewItineraryStatus : undefined;
  return {
    title: body.title as string | undefined,
    introNotes: body.introNotes as string | null | undefined,
    status,
  };
}

function itemPatch(body: Record<string, unknown>): Prisma.CrewItineraryItemUncheckedUpdateInput {
  return {
    type: body.type === undefined ? undefined : itemType(body.type),
    date: dateOrNull(body.date),
    endDate: dateOrNull(body.endDate),
    startTime: body.startTime as string | null | undefined,
    endTime: body.endTime as string | null | undefined,
    startTimezone: body.startTimezone as string | null | undefined,
    endTimezone: body.endTimezone as string | null | undefined,
    origin: body.origin as string | null | undefined,
    destination: body.destination as string | null | undefined,
    provider: body.provider as string | null | undefined,
    bookingReference: body.bookingReference as string | null | undefined,
    bookingUrl: body.bookingUrl as string | null | undefined,
    address: body.address as string | null | undefined,
    terminal: body.terminal as string | null | undefined,
    platform: body.platform as string | null | undefined,
    gate: body.gate as string | null | undefined,
    flightNumber: body.flightNumber as string | null | undefined,
    trainNumber: body.trainNumber as string | null | undefined,
    seat: body.seat as string | null | undefined,
    coach: body.coach as string | null | undefined,
    baggage: body.baggage as string | null | undefined,
    passengerName: body.passengerName as string | null | undefined,
    roomType: body.roomType as string | null | undefined,
    roomNumber: body.roomNumber as string | null | undefined,
    checkInDetails: body.checkInDetails as string | null | undefined,
    checkOutDetails: body.checkOutDetails as string | null | undefined,
    cancellationPolicy: body.cancellationPolicy as string | null | undefined,
    contactName: body.contactName as string | null | undefined,
    contactPhone: body.contactPhone as string | null | undefined,
    contactEmail: body.contactEmail as string | null | undefined,
    cost: decimalOrNull(body.cost),
    paidBy: body.paidBy as string | null | undefined,
    notes: body.notes as string | null | undefined,
    exportVisible: body.exportVisible as boolean | undefined,
    order: numberOrUndefined(body.order),
  };
}

function cloneItemData(item: Prisma.CrewItineraryItemGetPayload<object> & { files: Array<{ fileId: string; exportVisible: boolean }> }, itineraryId: string): Prisma.CrewItineraryItemUncheckedCreateInput {
  return {
    itineraryId,
    type: item.type,
    order: item.order,
    date: item.date,
    endDate: item.endDate,
    startTime: item.startTime,
    endTime: item.endTime,
    startTimezone: item.startTimezone,
    endTimezone: item.endTimezone,
    origin: item.origin,
    destination: item.destination,
    provider: item.provider,
    bookingReference: item.bookingReference,
    bookingUrl: item.bookingUrl,
    address: item.address,
    terminal: item.terminal,
    platform: item.platform,
    gate: item.gate,
    flightNumber: item.flightNumber,
    trainNumber: item.trainNumber,
    seat: item.seat,
    coach: item.coach,
    baggage: item.baggage,
    passengerName: item.passengerName,
    roomType: item.roomType,
    roomNumber: item.roomNumber,
    checkInDetails: item.checkInDetails,
    checkOutDetails: item.checkOutDetails,
    cancellationPolicy: item.cancellationPolicy,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    contactEmail: item.contactEmail,
    cost: item.cost,
    paidBy: item.paidBy,
    notes: item.notes,
    exportVisible: item.exportVisible,
  };
}

function itemSortKey(item: { date: Date | string | null; startTime: string | null; createdAt?: Date; order: number }) {
  const dateText = item.date instanceof Date ? item.date.toISOString().slice(0, 10) : item.date ? String(item.date).slice(0, 10) : "9999-12-31";
  const timeText = item.startTime && /^\d{1,2}:\d{2}/.test(item.startTime) ? item.startTime.padStart(5, "0").slice(0, 5) : "99:99";
  const createdText = item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.order).padStart(6, "0");
  return `${dateText}T${timeText}|${createdText}`;
}

async function reorderItineraryItemsByDate(itineraryId: string): Promise<void> {
  const items = await prisma.crewItineraryItem.findMany({
    where: { itineraryId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, date: true, startTime: true, createdAt: true, order: true },
  });
  const sorted = [...items].sort((a, b) => itemSortKey(a).localeCompare(itemSortKey(b)));
  await prisma.$transaction(sorted.map((item, index) => prisma.crewItineraryItem.update({ where: { id: item.id }, data: { order: index + 1 } })));
}

function detectedTravelMimeType(file: Express.Multer.File): string {
  const fromName = mime.lookup(file.originalname);
  return typeof fromName === "string" ? fromName : file.mimetype || "application/octet-stream";
}

async function getCrewItinerary(productionId: string, crewId: string) {
  return prisma.crewItinerary.findFirst({
    where: { productionId, crewMemberId: crewId },
    include: itineraryInclude,
  });
}

async function itineraryForMutation(productionId: string, crewId: string) {
  const itinerary = await getCrewItinerary(productionId, crewId);
  if (!itinerary) throw new Error("Itinerary not found");
  return itinerary;
}

router.get("/:id/crew", async (req: Request, res: Response): Promise<void> => {
  const crew = await prisma.crewMember.findMany({
    where: { productionId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: {
      role: true,
      contact: { include: { company: { select: { id: true, name: true } } } },
      blackbookEntry: { select: { id: true, displayName: true, entryType: true, category: true, email: true, phone: true, companyName: true } },
      optionCandidate: { select: { id: true, name: true, groupId: true, activeState: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      roleRequirement: { select: { id: true, name: true, displayLabel: true, type: true, groupId: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      itinerary: { select: { id: true, title: true, status: true, generatedAt: true, exportedAt: true, _count: { select: { items: true, appendixPages: true } } } },
    },
  });
  res.json(crew);
});

router.post("/:id/crew", async (req: Request, res: Response): Promise<void> => {
  const contactId = await resolveCrewContact(req.body);
  if (!req.body.name && !contactId) { res.status(400).json({ error: "name or contactId required" }); return; }

  let name = req.body.name as string | undefined;
  if (!name && contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    name = contact ? `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}` : undefined;
  }

  const crew = await prisma.crewMember.create({
    data: { ...crewDataFromBody(req.body), name: name!, productionId: req.params.id, contactId },
    include: {
      role: true,
      contact: true,
      blackbookEntry: { select: { id: true, displayName: true, entryType: true, category: true, email: true, phone: true, companyName: true } },
      optionCandidate: { select: { id: true, name: true, groupId: true, activeState: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      roleRequirement: { select: { id: true, name: true, displayLabel: true, type: true, groupId: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      itinerary: { select: { id: true, title: true, status: true, generatedAt: true, exportedAt: true, _count: { select: { items: true, appendixPages: true } } } },
    },
  });
  res.status(201).json(crew);
});

router.patch("/:id/crew/:crewId", async (req: Request, res: Response): Promise<void> => {
  const crew = await prisma.crewMember.update({
    where: { id: req.params.crewId, productionId: req.params.id },
    data: crewDataFromBody(req.body),
    include: {
      role: true,
      contact: true,
      blackbookEntry: { select: { id: true, displayName: true, entryType: true, category: true, email: true, phone: true, companyName: true } },
      optionCandidate: { select: { id: true, name: true, groupId: true, activeState: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      roleRequirement: { select: { id: true, name: true, displayLabel: true, type: true, groupId: true, group: { select: { id: true, name: true, type: true, order: true, hiddenFromCrewList: true } } } },
      itinerary: { select: { id: true, title: true, status: true, generatedAt: true, exportedAt: true, _count: { select: { items: true, appendixPages: true } } } },
    },
  });
  res.json(crew);
});

router.delete("/:id/crew/:crewId", async (req: Request, res: Response): Promise<void> => {
  await prisma.crewMember.delete({ where: { id: req.params.crewId, productionId: req.params.id } });
  res.status(204).end();
});

router.get("/:id/crew/:crewId/itinerary", async (req: Request, res: Response): Promise<void> => {
  const itinerary = await getCrewItinerary(req.params.id, req.params.crewId);
  if (!itinerary) { res.status(404).json({ error: "Itinerary not found" }); return; }
  res.json(itinerary);
});

router.post("/:id/crew/:crewId/itinerary/generate", async (req: Request, res: Response): Promise<void> => {
  const existing = await getCrewItinerary(req.params.id, req.params.crewId);
  if (existing) { res.json(existing); return; }

  const crew = await prisma.crewMember.findUnique({
    where: { id: req.params.crewId, productionId: req.params.id },
    include: { role: true, roleRequirement: true },
  });
  if (!crew) { res.status(404).json({ error: "Crew member not found" }); return; }
  const production = await prisma.production.findUnique({
    where: { id: req.params.id },
    include: { dates: { orderBy: [{ date: "asc" }, { time: "asc" }] } },
  });
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }

  const projectName = [production.clientName, production.brand].filter(Boolean).join(" · ") || production.title;
  const role = crew.roleRequirement?.displayLabel ?? crew.role?.name ?? "Crew";
  const created = await prisma.crewItinerary.create({
    data: {
      productionId: production.id,
      crewMemberId: crew.id,
      title: crew.name,
      introNotes: `${projectName}${production.jobCode ? ` · ${production.jobCode}` : ""}\n${role}`,
      generatedAt: new Date(),
      items: {
        create: production.dates.map((date, index) => ({
          type: CrewItineraryItemType.EVENT,
          order: index + 1,
          date: date.date,
          startTime: date.time,
          destination: date.location,
          address: date.location,
          provider: date.dateType.replace(/_/g, " "),
          notes: [date.notes, crew.callTime ? `Call: ${crew.callTime}` : null, crew.wrapTime ? `Wrap: ${crew.wrapTime}` : null].filter(Boolean).join("\n") || null,
        })),
      },
      appendixPages: {
        create: {
          order: 1,
          title: "Production information",
          bodyHtml: `<p><strong>${projectName}</strong></p><p>${production.description ?? ""}</p><p>${production.notes ?? ""}</p>`,
        },
      },
    },
    include: itineraryInclude,
  });
  res.status(201).json(created);
});

router.post("/:id/crew/:crewId/itinerary/duplicate-from", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { sourceCrewId?: string };
  if (!body.sourceCrewId) { res.status(400).json({ error: "sourceCrewId is required" }); return; }
  if (body.sourceCrewId === req.params.crewId) { res.status(400).json({ error: "Choose a different crew member to duplicate from" }); return; }

  try {
    const [targetCrew, source] = await Promise.all([
      prisma.crewMember.findUnique({ where: { id: req.params.crewId, productionId: req.params.id }, select: { id: true, name: true } }),
      prisma.crewItinerary.findFirst({
        where: { productionId: req.params.id, crewMemberId: body.sourceCrewId },
        include: {
          items: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            include: { files: { select: { fileId: true, exportVisible: true } } },
          },
          appendixPages: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
        },
      }),
    ]);
    if (!targetCrew) { res.status(404).json({ error: "Crew member not found" }); return; }
    if (!source) { res.status(404).json({ error: "Source itinerary not found" }); return; }

    await prisma.$transaction(async (tx) => {
      const target = await tx.crewItinerary.upsert({
        where: { crewMemberId: targetCrew.id },
        create: {
          productionId: req.params.id,
          crewMemberId: targetCrew.id,
          title: targetCrew.name,
          introNotes: source.introNotes,
          generatedAt: new Date(),
        },
        update: {
          title: targetCrew.name,
          introNotes: source.introNotes,
          status: CrewItineraryStatus.DRAFT,
          exportedAt: null,
          generatedAt: new Date(),
        },
      });

      await tx.crewItineraryItem.deleteMany({ where: { itineraryId: target.id } });
      await tx.crewItineraryAppendixPage.deleteMany({ where: { itineraryId: target.id } });

      for (const item of source.items) {
        const created = await tx.crewItineraryItem.create({ data: cloneItemData(item, target.id) });
        if (item.files.length > 0) {
          await tx.crewItineraryItemFile.createMany({
            data: item.files.map((file) => ({ itemId: created.id, fileId: file.fileId, exportVisible: file.exportVisible })),
            skipDuplicates: true,
          });
        }
      }

      if (source.appendixPages.length > 0) {
        await tx.crewItineraryAppendixPage.createMany({
          data: source.appendixPages.map((page) => ({
            itineraryId: target.id,
            title: page.title,
            bodyHtml: page.bodyHtml,
            order: page.order,
            exportVisible: page.exportVisible,
          })),
        });
      }
    });

    res.status(201).json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Itinerary could not be duplicated" });
  }
});

router.patch("/:id/crew/:crewId/itinerary", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const updated = await prisma.crewItinerary.update({
      where: { id: itinerary.id },
      data: itineraryPatch(req.body as Record<string, unknown>),
      include: itineraryInclude,
    });
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Itinerary not found" });
  }
});

router.post("/:id/crew/:crewId/itinerary/items", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const max = await prisma.crewItineraryItem.aggregate({ where: { itineraryId: itinerary.id }, _max: { order: true } });
    const body = req.body as Record<string, unknown>;
    await prisma.crewItineraryItem.create({
      data: {
        itineraryId: itinerary.id,
        type: itemType(body.type),
        order: numberOrUndefined(body.order) ?? ((max._max.order ?? 0) + 1),
        date: dateOrNull(body.date),
        endDate: dateOrNull(body.endDate),
        startTime: body.startTime as string | null | undefined,
        endTime: body.endTime as string | null | undefined,
        startTimezone: body.startTimezone as string | null | undefined,
        endTimezone: body.endTimezone as string | null | undefined,
        origin: body.origin as string | null | undefined,
        destination: body.destination as string | null | undefined,
        provider: body.provider as string | null | undefined,
        bookingReference: body.bookingReference as string | null | undefined,
        bookingUrl: body.bookingUrl as string | null | undefined,
        address: body.address as string | null | undefined,
        terminal: body.terminal as string | null | undefined,
        platform: body.platform as string | null | undefined,
        gate: body.gate as string | null | undefined,
        flightNumber: body.flightNumber as string | null | undefined,
        trainNumber: body.trainNumber as string | null | undefined,
        seat: body.seat as string | null | undefined,
        coach: body.coach as string | null | undefined,
        baggage: body.baggage as string | null | undefined,
        passengerName: body.passengerName as string | null | undefined,
        roomType: body.roomType as string | null | undefined,
        roomNumber: body.roomNumber as string | null | undefined,
        checkInDetails: body.checkInDetails as string | null | undefined,
        checkOutDetails: body.checkOutDetails as string | null | undefined,
        cancellationPolicy: body.cancellationPolicy as string | null | undefined,
        contactName: body.contactName as string | null | undefined,
        contactPhone: body.contactPhone as string | null | undefined,
        contactEmail: body.contactEmail as string | null | undefined,
        cost: decimalOrNull(body.cost),
        paidBy: body.paidBy as string | null | undefined,
        notes: body.notes as string | null | undefined,
        exportVisible: body.exportVisible as boolean | undefined ?? true,
      },
    });
    await reorderItineraryItemsByDate(itinerary.id);
    res.status(201).json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Item could not be created" });
  }
});

router.patch("/:id/crew/:crewId/itinerary/items/reorder", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const ids = (req.body as { itemIds?: unknown }).itemIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      res.status(400).json({ error: "itemIds must be an array" });
      return;
    }
    const existing = await prisma.crewItineraryItem.findMany({ where: { itineraryId: itinerary.id }, select: { id: true } });
    const expected = new Set(existing.map((item) => item.id));
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some((id) => !expected.has(id))) {
      res.status(400).json({ error: "itemIds must include each itinerary item once" });
      return;
    }
    await prisma.$transaction((ids as string[]).map((id, index) => prisma.crewItineraryItem.update({ where: { id }, data: { order: index + 1 } })));
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Items could not be reordered" });
  }
});

router.patch("/:id/crew/:crewId/itinerary/items/:itemId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    await prisma.crewItineraryItem.update({
      where: { id: req.params.itemId, itineraryId: itinerary.id },
      data: itemPatch(req.body as Record<string, unknown>),
    });
    await reorderItineraryItemsByDate(itinerary.id);
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Item could not be updated" });
  }
});

router.delete("/:id/crew/:crewId/itinerary/items/:itemId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    await prisma.crewItineraryItem.delete({ where: { id: req.params.itemId, itineraryId: itinerary.id } });
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Item could not be deleted" });
  }
});

router.post("/:id/crew/:crewId/itinerary/parse-travel-documents", async (req: Request, res: Response): Promise<void> => {
  travelUpload.array("files", 10)(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Maximum travel document size is 25MB" });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Travel document upload failed" });
        return;
      }

      const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) {
        res.status(400).json({ error: "At least one PDF or image is required" });
        return;
      }

      const parsedFiles = [];
      for (const file of files) {
        const mimeType = detectedTravelMimeType(file);
        if (!travelParseMimeTypes.has(mimeType)) {
          res.status(400).json({ error: `${file.originalname} must be a PDF or image` });
          return;
        }

        const storedFile = await autoFileDocument(req.params.id, "Crew Deals", file.buffer, file.originalname || `${randomUUID()}.pdf`, mimeType, {
          notes: `Travel confirmation for ${itinerary.crewMember.name}`,
          isReceipt: false,
        });
        const parsed = await parseTravelItineraryDocument(file.buffer, mimeType);
        const createdItems = [];

        for (const parsedItem of parsed.items) {
          const created = await prisma.crewItineraryItem.create({
            data: {
              itineraryId: itinerary.id,
              type: parsedItem.type,
              order: 9999,
              date: parsedItem.date ? new Date(`${parsedItem.date}T00:00:00.000Z`) : null,
              endDate: parsedItem.endDate ? new Date(`${parsedItem.endDate}T00:00:00.000Z`) : null,
              startTime: parsedItem.startTime,
              endTime: parsedItem.endTime,
              startTimezone: parsedItem.startTimezone,
              endTimezone: parsedItem.endTimezone,
              origin: parsedItem.origin,
              destination: parsedItem.destination,
              provider: parsedItem.provider,
              bookingReference: parsedItem.bookingReference,
              address: parsedItem.address,
              terminal: parsedItem.terminal,
              platform: parsedItem.platform,
              gate: parsedItem.gate,
              flightNumber: parsedItem.flightNumber,
              trainNumber: parsedItem.trainNumber,
              seat: parsedItem.seat,
              coach: parsedItem.coach,
              baggage: parsedItem.baggage,
              passengerName: parsedItem.passengerName,
              roomType: parsedItem.roomType,
              roomNumber: parsedItem.roomNumber,
              checkInDetails: parsedItem.checkInDetails,
              checkOutDetails: parsedItem.checkOutDetails,
              contactName: parsedItem.contactName,
              contactPhone: parsedItem.contactPhone,
              contactEmail: parsedItem.contactEmail,
              notes: [parsedItem.notes, parsedItem.confidence !== "high" ? `Parser confidence: ${parsedItem.confidence}` : null].filter(Boolean).join("\n") || null,
              exportVisible: true,
              files: { create: { fileId: storedFile.id } },
            },
          });
          createdItems.push({ id: created.id, type: created.type, date: created.date, startTime: created.startTime });
        }

        parsedFiles.push({
          file: storedFile,
          itemsCreated: createdItems.length,
          confidence: parsed.confidence,
          rawText: parsed.rawText,
        });
      }

      await reorderItineraryItemsByDate(itinerary.id);
      res.status(201).json({ itinerary: await getCrewItinerary(req.params.id, req.params.crewId), parsedFiles });
    } catch (caught) {
      res.status(400).json({ error: caught instanceof Error ? caught.message : "Travel documents could not be parsed" });
    }
  });
});

router.post("/:id/crew/:crewId/itinerary/items/:itemId/files", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const body = req.body as { fileId?: string };
    if (!body.fileId) { res.status(400).json({ error: "fileId is required" }); return; }
    const [item, file] = await Promise.all([
      prisma.crewItineraryItem.findUnique({ where: { id: req.params.itemId, itineraryId: itinerary.id } }),
      prisma.jobFile.findUnique({ where: { id: body.fileId } }),
    ]);
    if (!item || !file || file.productionId !== req.params.id) { res.status(404).json({ error: "Item or file not found" }); return; }
    await prisma.crewItineraryItemFile.upsert({
      where: { itemId_fileId: { itemId: item.id, fileId: file.id } },
      update: {},
      create: { itemId: item.id, fileId: file.id },
    });
    res.status(201).json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File could not be linked" });
  }
});

router.patch("/:id/crew/:crewId/itinerary/items/:itemId/files/:fileId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const item = await prisma.crewItineraryItem.findUnique({ where: { id: req.params.itemId, itineraryId: itinerary.id } });
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    const body = req.body as { exportVisible?: unknown };
    if (typeof body.exportVisible !== "boolean") {
      res.status(400).json({ error: "exportVisible must be a boolean" });
      return;
    }
    await prisma.crewItineraryItemFile.update({
      where: { itemId_fileId: { itemId: item.id, fileId: req.params.fileId } },
      data: { exportVisible: body.exportVisible },
    });
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File export setting could not be updated" });
  }
});

router.delete("/:id/crew/:crewId/itinerary/items/:itemId/files/:fileId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const item = await prisma.crewItineraryItem.findUnique({ where: { id: req.params.itemId, itineraryId: itinerary.id } });
    if (!item) { res.status(404).json({ error: "Item not found" }); return; }
    await prisma.crewItineraryItemFile.delete({ where: { itemId_fileId: { itemId: item.id, fileId: req.params.fileId } } });
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File could not be unlinked" });
  }
});

router.post("/:id/crew/:crewId/itinerary/appendix-pages", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const body = req.body as Record<string, unknown>;
    const max = await prisma.crewItineraryAppendixPage.aggregate({ where: { itineraryId: itinerary.id }, _max: { order: true } });
    await prisma.crewItineraryAppendixPage.create({
      data: {
        itineraryId: itinerary.id,
        title: String(body.title || "Info page"),
        bodyHtml: String(body.bodyHtml || ""),
        order: numberOrUndefined(body.order) ?? ((max._max.order ?? 0) + 1),
        exportVisible: body.exportVisible as boolean | undefined ?? true,
      },
    });
    res.status(201).json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Appendix page could not be created" });
  }
});

router.patch("/:id/crew/:crewId/itinerary/appendix-pages/reorder", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const ids = (req.body as { pageIds?: unknown }).pageIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      res.status(400).json({ error: "pageIds must be an array" });
      return;
    }
    const existing = await prisma.crewItineraryAppendixPage.findMany({ where: { itineraryId: itinerary.id }, select: { id: true } });
    const expected = new Set(existing.map((page) => page.id));
    if (ids.length !== expected.size || new Set(ids).size !== ids.length || ids.some((id) => !expected.has(id))) {
      res.status(400).json({ error: "pageIds must include each appendix page once" });
      return;
    }
    await prisma.$transaction((ids as string[]).map((id, index) => prisma.crewItineraryAppendixPage.update({ where: { id }, data: { order: index + 1 } })));
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Appendix pages could not be reordered" });
  }
});

router.patch("/:id/crew/:crewId/itinerary/appendix-pages/:pageId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const body = req.body as Record<string, unknown>;
    await prisma.crewItineraryAppendixPage.update({
      where: { id: req.params.pageId, itineraryId: itinerary.id },
      data: {
        title: body.title as string | undefined,
        bodyHtml: body.bodyHtml as string | undefined,
        exportVisible: body.exportVisible as boolean | undefined,
        order: numberOrUndefined(body.order),
      },
    });
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Appendix page could not be updated" });
  }
});

router.delete("/:id/crew/:crewId/itinerary/appendix-pages/:pageId", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    await prisma.crewItineraryAppendixPage.delete({ where: { id: req.params.pageId, itineraryId: itinerary.id } });
    res.json(await getCrewItinerary(req.params.id, req.params.crewId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Appendix page could not be deleted" });
  }
});

router.post("/:id/crew/:crewId/itinerary/export-pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const itinerary = await itineraryForMutation(req.params.id, req.params.crewId);
    const file = await exportCrewItineraryPdf(itinerary.id);
    res.json(file);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "PDF export failed" });
  }
});

router.post("/:id/crew/itineraries/export-pdf/bulk", async (req: Request, res: Response): Promise<void> => {
  try {
    const itineraries = await prisma.crewItinerary.findMany({ where: { productionId: req.params.id }, include: { crewMember: true } });
    const files = [];
    for (const itinerary of itineraries) {
      files.push(await exportCrewItineraryPdf(itinerary.id));
    }
    res.json({ files });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Bulk PDF export failed" });
  }
});

// ─── Comms ───────────────────────────────────────────────────────────────────

router.post("/:id/notes", async (req: Request, res: Response): Promise<void> => {
  const { body } = req.body;
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const note = await prisma.activityNote.create({
    data: { entityType: ActivityEntityType.PRODUCTION, entityId: req.params.id, body },
  });
  res.status(201).json(note);
});

router.patch("/:id/notes/:noteId", async (req: Request, res: Response): Promise<void> => {
  const note = await prisma.activityNote.update({
    where: { id: req.params.noteId },
    data: { body: req.body.body },
  });
  res.json(note);
});

router.delete("/:id/notes/:noteId", async (req: Request, res: Response): Promise<void> => {
  await prisma.activityNote.delete({ where: { id: req.params.noteId } });
  res.status(204).end();
});

router.post("/:id/tasks", async (req: Request, res: Response): Promise<void> => {
  const { body, dueDate } = req.body;
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const task = await prisma.activityTask.create({
    data: {
      entityType: ActivityEntityType.PRODUCTION,
      entityId: req.params.id,
      body,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });
  res.status(201).json(task);
});

router.patch("/:id/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  const { body, completed, dueDate } = req.body;
  const task = await prisma.activityTask.update({
    where: { id: req.params.taskId },
    data: {
      body,
      completed,
      completedAt: completed === true ? new Date() : completed === false ? null : undefined,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
    },
  });
  res.json(task);
});

router.delete("/:id/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  await prisma.activityTask.delete({ where: { id: req.params.taskId } });
  res.status(204).end();
});

export default router;
