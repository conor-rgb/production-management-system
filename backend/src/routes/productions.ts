import { Router, Request, Response } from "express";
import {
  ActivityEntityType,
  CrewStatus,
  FreeAgentInvoiceStatus,
  PmsJobType,
  Prisma,
  ProductionDateType,
  ProductionStatus,
} from "@prisma/client";
import prisma from "../prisma";
import { generateJobCode } from "../utils/jobCode";
import { ensureProductionFoldersForRecord } from "../services/fileStorage";
import { pushToGoogleCalendar, syncProductionDatesToCalendar } from "../services/calendarSyncService";
import { getPrimaryAccount } from "../services/googleCalendarService";

const router = Router();

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
    },
  },
  budgets: { include: { currentRevision: { include: { sections: { include: { lineItems: { include: { subCosts: true } } } } } } } },
    jobFiles: true,
  emailThreads: { include: { messages: { orderBy: { sentAt: "asc" as const } } } },
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
    name: body.name as string | undefined,
    email: body.email as string | null | undefined,
    phone: body.phone as string | null | undefined,
    status: body.status as CrewStatus | undefined,
    dayRate: numberOrNull(body.dayRate),
    numberOfDays: numberOrUndefined(body.numberOfDays),
    notes: body.notes as string | null | undefined,
  };
}

router.get("/:id/crew", async (req: Request, res: Response): Promise<void> => {
  const crew = await prisma.crewMember.findMany({
    where: { productionId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: {
      role: true,
      contact: { include: { company: { select: { id: true, name: true } } } },
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
    include: { role: true, contact: true },
  });
  res.status(201).json(crew);
});

router.patch("/:id/crew/:crewId", async (req: Request, res: Response): Promise<void> => {
  const crew = await prisma.crewMember.update({
    where: { id: req.params.crewId, productionId: req.params.id },
    data: crewDataFromBody(req.body),
    include: { role: true, contact: true },
  });
  res.json(crew);
});

router.delete("/:id/crew/:crewId", async (req: Request, res: Response): Promise<void> => {
  await prisma.crewMember.delete({ where: { id: req.params.crewId, productionId: req.params.id } });
  res.status(204).end();
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
