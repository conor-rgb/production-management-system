import { Router, Request, Response } from "express";
import { CalendarEvent, CalendarEventType } from "@prisma/client";
import prisma from "../prisma";
import {
  deleteGoogleCalendarEvent,
  eventCanCreateProductionDate,
  formatDateType,
  getEventTypeIcon,
  getProductionColor,
  pushToGoogleCalendar,
  syncFromGoogleCalendar,
  syncOpportunityFollowUpsToCalendar,
  syncProductionDatesToCalendar,
  toProductionDateType,
} from "../services/calendarSyncService";
import { getPrimaryAccount } from "../services/googleCalendarService";

const router = Router();

type CalendarBody = {
  title?: string;
  startDate?: string;
  endDate?: string;
  isAllDay?: boolean;
  location?: string | null;
  zoomLink?: string | null;
  notes?: string | null;
  color?: string | null;
  eventType?: CalendarEventType;
  productionId?: string | null;
  opportunityId?: string | null;
  contactIds?: string[];
};

const eventInclude = {
  production: { select: { id: true, jobCode: true, clientName: true, brand: true, status: true, title: true } },
  opportunity: { select: { id: true, title: true, clientName: true, brand: true, stage: true, value: true } },
} as const;

function eventResponse(event: CalendarEvent & { production?: { jobCode: string | null } | null }) {
  return {
    ...event,
    icon: getEventTypeIcon(event.eventType),
    formattedType: formatDateType(event.eventType),
    productionColor: event.production?.jobCode ? getProductionColor(event.production.jobCode) : event.color,
  };
}

function parseEventType(value: unknown): CalendarEventType {
  return typeof value === "string" && value in CalendarEventType ? value as CalendarEventType : CalendarEventType.STANDALONE;
}

function dateOnly(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function timeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function pushEventFireAndForget(eventId: string): Promise<void> {
  const account = await getPrimaryAccount();
  if (!account) return;
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId } });
  if (!event || event.syncedFromGoogle) return;
  const googleId = await pushToGoogleCalendar(account, event);
  if (googleId) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { googleCalendarEventId: googleId, googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary", lastSyncedAt: new Date() },
    });
  }
}

router.get("/events", async (req: Request, res: Response): Promise<void> => {
  const start = typeof req.query.start === "string" ? new Date(req.query.start) : new Date(Date.now() - 30 * 86_400_000);
  const end = typeof req.query.end === "string" ? new Date(req.query.end) : new Date(Date.now() + 180 * 86_400_000);
  const productionId = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
  const events = await prisma.calendarEvent.findMany({
    where: {
      startDate: { lte: end },
      endDate: { gte: start },
      productionId,
    },
    include: eventInclude,
    orderBy: { startDate: "asc" },
  });
  res.json(events.map(eventResponse));
});

router.get("/events/today", async (_req: Request, res: Response): Promise<void> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const events = await prisma.calendarEvent.findMany({
    where: { startDate: { lt: end }, endDate: { gte: start } },
    include: eventInclude,
    orderBy: [{ isAllDay: "desc" }, { startDate: "asc" }],
  });
  res.json(events.map(eventResponse));
});

router.get("/events/upcoming", async (_req: Request, res: Response): Promise<void> => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  const events = await prisma.calendarEvent.findMany({
    where: { startDate: { lt: end }, endDate: { gte: start } },
    include: eventInclude,
    orderBy: [{ startDate: "asc" }],
  });
  res.json(events.map(eventResponse));
});

router.get("/events/:eventId/linked", async (req: Request, res: Response): Promise<void> => {
  const event = await prisma.calendarEvent.findUnique({ where: { id: req.params.eventId } });
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const [production, opportunity, contacts] = await Promise.all([
    event.productionId ? prisma.production.findUnique({ where: { id: event.productionId } }) : null,
    event.opportunityId ? prisma.opportunity.findUnique({ where: { id: event.opportunityId } }) : null,
    event.contactIds.length ? prisma.contact.findMany({ where: { id: { in: event.contactIds } }, include: { company: true } }) : [],
  ]);
  res.json({ production, opportunity, contacts });
});

router.post("/events", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CalendarBody;
  if (!body.title || !body.startDate) { res.status(400).json({ error: "title and startDate required" }); return; }
  const eventType = parseEventType(body.eventType);
  const startDate = new Date(body.startDate);
  const endDate = body.endDate ? new Date(body.endDate) : new Date(startDate.getTime() + 60 * 60 * 1000);
  const production = body.productionId ? await prisma.production.findUnique({ where: { id: body.productionId }, select: { id: true, jobCode: true } }) : null;
  let productionDateId: string | undefined;
  const productionDateType = toProductionDateType(eventType);
  if (production && productionDateType && eventCanCreateProductionDate(eventType)) {
    const date = await prisma.productionDate.create({
      data: {
        productionId: production.id,
        dateType: productionDateType,
        date: dateOnly(startDate),
        time: body.isAllDay ? null : timeString(startDate),
        location: body.location ?? null,
        zoomLink: body.zoomLink ?? null,
        notes: body.notes ?? null,
      },
    });
    productionDateId = date.id;
  }
  const event = await prisma.calendarEvent.create({
    data: {
      title: body.title,
      startDate,
      endDate,
      isAllDay: Boolean(body.isAllDay),
      location: body.location ?? null,
      zoomLink: body.zoomLink ?? null,
      notes: body.notes ?? null,
      color: production?.jobCode ? getProductionColor(production.jobCode) : body.color ?? "#5B8DEF",
      eventType,
      productionId: production?.id ?? null,
      productionDateId,
      opportunityId: body.opportunityId ?? null,
      contactIds: Array.isArray(body.contactIds) ? body.contactIds : [],
    },
    include: eventInclude,
  });
  pushEventFireAndForget(event.id).catch((err) => console.error("[CALENDAR] Push after create failed:", err instanceof Error ? err.message : err));
  res.status(201).json(eventResponse(event));
});

router.patch("/events/:eventId", async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.calendarEvent.findUnique({ where: { id: req.params.eventId } });
  if (!existing) { res.status(404).json({ error: "Event not found" }); return; }
  const body = req.body as CalendarBody;
  const eventType = body.eventType ? parseEventType(body.eventType) : undefined;
  const startDate = body.startDate ? new Date(body.startDate) : undefined;
  const endDate = body.endDate ? new Date(body.endDate) : undefined;
  const event = await prisma.calendarEvent.update({
    where: { id: existing.id },
    data: {
      title: body.title,
      startDate,
      endDate,
      isAllDay: body.isAllDay,
      location: body.location,
      zoomLink: body.zoomLink,
      notes: body.notes,
      color: body.color,
      eventType,
      productionId: body.productionId,
      opportunityId: body.opportunityId,
      contactIds: body.contactIds,
    },
    include: eventInclude,
  });
  if (existing.productionDateId) {
    await prisma.productionDate.update({
      where: { id: existing.productionDateId },
      data: {
        dateType: eventType ? toProductionDateType(eventType) ?? undefined : undefined,
        date: startDate ? dateOnly(startDate) : undefined,
        time: body.isAllDay === true ? null : startDate ? timeString(startDate) : undefined,
        location: body.location,
        zoomLink: body.zoomLink,
        notes: body.notes,
      },
    }).catch((err) => console.error("[CALENDAR] Production date update failed:", err instanceof Error ? err.message : err));
  }
  pushEventFireAndForget(event.id).catch((err) => console.error("[CALENDAR] Push after update failed:", err instanceof Error ? err.message : err));
  res.json(eventResponse(event));
});

router.delete("/events/:eventId", async (req: Request, res: Response): Promise<void> => {
  const event = await prisma.calendarEvent.findUnique({ where: { id: req.params.eventId } });
  if (!event) { res.status(404).json({ error: "Event not found" }); return; }
  const account = await getPrimaryAccount();
  if (account) await deleteGoogleCalendarEvent(account, event);
  await prisma.calendarEvent.delete({ where: { id: event.id } });
  if (event.productionDateId) {
    await prisma.productionDate.delete({ where: { id: event.productionDateId } }).catch(() => undefined);
  }
  res.status(204).end();
});

router.post("/sync", async (_req: Request, res: Response): Promise<void> => {
  await syncProductionDatesToCalendar();
  await syncOpportunityFollowUpsToCalendar();
  const account = await getPrimaryAccount();
  if (account) await syncFromGoogleCalendar(account);
  const count = await prisma.calendarEvent.count();
  res.json({ status: "synced", count });
});

export default router;
