import { CalendarEvent, CalendarEventType, EmailAccount, ProductionDateType, ProductionStatus, Stage } from "@prisma/client";
import prisma from "../prisma";
import { ensureAccessToken } from "./emailService";

const PRODUCTION_COLORS = [
  "#5B8DEF",
  "#E8A838",
  "#E85D5D",
  "#5DBE8A",
  "#9B5DEF",
  "#EF8C5D",
  "#5DBEE8",
  "#EF5DB8",
];

type GoogleCalendarDate = {
  date?: string;
  dateTime?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleCalendarDate;
  end?: GoogleCalendarDate;
  extendedProperties?: {
    private?: Record<string, string | undefined>;
  };
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEvent[];
};

type GoogleCalendarWriteResponse = {
  id?: string;
};

function calendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID ?? "primary";
}

function dateOnly(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function eventTypeFromProductionDate(type: ProductionDateType): CalendarEventType {
  if (type === ProductionDateType.OTHER) return CalendarEventType.OTHER;
  return type as unknown as CalendarEventType;
}

function productionDateTypeFromEvent(type: CalendarEventType): ProductionDateType | null {
  if (type === CalendarEventType.OTHER) return ProductionDateType.OTHER;
  if (
    type === CalendarEventType.SHOOT_DAY ||
    type === CalendarEventType.PPM ||
    type === CalendarEventType.RECCE ||
    type === CalendarEventType.FITTING ||
    type === CalendarEventType.MEETING ||
    type === CalendarEventType.POST_DELIVERY
  ) {
    return type as unknown as ProductionDateType;
  }
  return null;
}

function startForProductionDate(date: Date, time: string | null): Date {
  if (!time) return date;
  return new Date(`${dateOnly(date)}T${time}:00`);
}

function endForProductionDate(date: Date, time: string | null): Date {
  if (!time) return date;
  const end = startForProductionDate(date, time);
  end.setHours(end.getHours() + 1);
  return end;
}

export function formatDateType(type: string): string {
  const labels: Record<string, string> = {
    SHOOT_DAY: "Shoot Day",
    PPM: "PPM",
    RECCE: "Recce",
    FITTING: "Fitting",
    MEETING: "Meeting",
    POST_DELIVERY: "Post Delivery",
    FOLLOW_UP: "Follow Up",
    GOOGLE_SYNC: "Google Calendar",
    STANDALONE: "Event",
    OTHER: "Other",
  };
  return labels[type] ?? type;
}

export function getEventTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    SHOOT_DAY: "🎬",
    PPM: "📋",
    RECCE: "📍",
    FITTING: "👗",
    MEETING: "🤝",
    POST_DELIVERY: "📦",
    FOLLOW_UP: "🔔",
    GOOGLE_SYNC: "📅",
    STANDALONE: "📌",
    OTHER: "📌",
  };
  return icons[type] ?? "📅";
}

export function getProductionColor(jobCode: string): string {
  let hash = 0;
  for (let i = 0; i < jobCode.length; i += 1) {
    hash = jobCode.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PRODUCTION_COLORS[Math.abs(hash) % PRODUCTION_COLORS.length] ?? PRODUCTION_COLORS[0];
}

export async function syncProductionDatesToCalendar(): Promise<void> {
  const dates = await prisma.productionDate.findMany({
    include: {
      production: { select: { id: true, jobCode: true, clientName: true, brand: true, status: true } },
    },
    where: { production: { status: { not: ProductionStatus.WRAPPED } } },
  });

  const activeDateIds = dates.map((date) => date.id);
  if (activeDateIds.length > 0) {
    await prisma.calendarEvent.deleteMany({
      where: {
        productionDateId: { not: null, notIn: activeDateIds },
        syncedFromGoogle: false,
      },
    });
  } else {
    await prisma.calendarEvent.deleteMany({
      where: { productionDateId: { not: null }, syncedFromGoogle: false },
    });
  }

  for (const date of dates) {
    const jobCode = date.production.jobCode ?? "No code";
    const client = date.production.clientName ?? date.production.brand ?? "Production";
    const eventData = {
      title: `${formatDateType(date.dateType)} — ${jobCode} ${client}`.trim(),
      startDate: startForProductionDate(date.date, date.time),
      endDate: endForProductionDate(date.date, date.time),
      isAllDay: !date.time,
      location: date.location ?? null,
      zoomLink: date.zoomLink ?? null,
      notes: date.notes ?? null,
      color: getProductionColor(jobCode),
      eventType: eventTypeFromProductionDate(date.dateType),
      productionId: date.production.id,
      productionDateId: date.id,
    };

    const existing = await prisma.calendarEvent.findFirst({ where: { productionDateId: date.id }, select: { id: true } });
    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data: eventData });
    } else {
      await prisma.calendarEvent.create({ data: eventData });
    }
  }
  console.log(`[CALENDAR] Synced ${dates.length} production dates to calendar events`);
}

export async function syncOpportunityFollowUpsToCalendar(): Promise<void> {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      followUpDate: { not: null },
      stage: { notIn: [Stage.WON, Stage.LOST] },
    },
  });
  const activeIds = opportunities.map((opportunity) => opportunity.id);
  await prisma.calendarEvent.deleteMany({
    where: {
      eventType: CalendarEventType.FOLLOW_UP,
      opportunityId: activeIds.length ? { notIn: activeIds } : { not: null },
    },
  });

  for (const opportunity of opportunities) {
    const eventData = {
      title: `Follow up — ${opportunity.clientName ?? opportunity.title} ${opportunity.brand ?? ""}`.trim(),
      startDate: opportunity.followUpDate ?? new Date(),
      endDate: opportunity.followUpDate ?? new Date(),
      isAllDay: true,
      color: "#E8A838",
      eventType: CalendarEventType.FOLLOW_UP,
      opportunityId: opportunity.id,
    };
    const existing = await prisma.calendarEvent.findFirst({
      where: { opportunityId: opportunity.id, eventType: CalendarEventType.FOLLOW_UP },
      select: { id: true },
    });
    if (existing) {
      await prisma.calendarEvent.update({ where: { id: existing.id }, data: eventData });
    } else {
      await prisma.calendarEvent.create({ data: eventData });
    }
  }
  console.log(`[CALENDAR] Synced ${opportunities.length} opportunity follow-ups to calendar events`);
}

export async function deleteGoogleCalendarEvent(account: EmailAccount, event: CalendarEvent): Promise<void> {
  if (!event.googleCalendarEventId) return;
  try {
    const accessToken = await ensureAccessToken(account);
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${event.googleCalendarId ?? calendarId()}/events/${event.googleCalendarEventId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 410 && response.status !== 404) {
      console.error("[CALENDAR] Google Calendar delete failed:", await response.text());
    }
  } catch (err) {
    console.error("[CALENDAR] Google Calendar delete error:", err instanceof Error ? err.message : err);
  }
}

export async function syncFromGoogleCalendar(account: EmailAccount): Promise<void> {
  try {
    const accessToken = await ensureAccessToken(account);
    const id = calendarId();
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=500`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      console.error("[CALENDAR] Google Calendar fetch failed:", await response.text());
      return;
    }
    const data = await response.json() as GoogleCalendarListResponse;
    const googleEvents = data.items ?? [];
    console.log(`[CALENDAR] Fetched ${googleEvents.length} events from Google Calendar`);

    const syncedIds: string[] = [];
    for (const googleEvent of googleEvents) {
      if (!googleEvent.id) continue;
      if (googleEvent.extendedProperties?.private?.unlimitedBondEventId || googleEvent.extendedProperties?.private?.unlimitedBondProductionDateId) continue;
      const startSource = googleEvent.start?.dateTime ?? googleEvent.start?.date;
      const endSource = googleEvent.end?.dateTime ?? googleEvent.end?.date ?? startSource;
      if (!startSource || !endSource) continue;
      syncedIds.push(googleEvent.id);
      const eventData = {
        title: googleEvent.summary ?? "(No title)",
        startDate: new Date(startSource),
        endDate: new Date(endSource),
        isAllDay: !googleEvent.start?.dateTime,
        location: googleEvent.location ?? null,
        notes: googleEvent.description ?? null,
        color: null,
        eventType: CalendarEventType.GOOGLE_SYNC,
        googleCalendarEventId: googleEvent.id,
        googleCalendarId: id,
        syncedFromGoogle: true,
        lastSyncedAt: new Date(),
      };
      const existing = await prisma.calendarEvent.findFirst({ where: { googleCalendarEventId: googleEvent.id }, select: { id: true } });
      if (existing) {
        await prisma.calendarEvent.update({ where: { id: existing.id }, data: eventData });
      } else {
        await prisma.calendarEvent.create({ data: eventData });
      }
    }

    await prisma.calendarEvent.deleteMany({
      where: {
        syncedFromGoogle: true,
        googleCalendarEventId: syncedIds.length ? { notIn: syncedIds } : { not: null },
      },
    });
  } catch (err) {
    console.error("[CALENDAR] Google Calendar sync failed:", err instanceof Error ? err.message : err);
  }
}

export async function pushToGoogleCalendar(account: EmailAccount, event: CalendarEvent): Promise<string | null> {
  try {
    const accessToken = await ensureAccessToken(account);
    const id = event.googleCalendarId ?? calendarId();
    const body: Record<string, unknown> = {
      summary: event.title,
      description: [event.notes, event.zoomLink ? `Zoom: ${event.zoomLink}` : null, "\nManaged in unlimited.bond"].filter(Boolean).join("\n"),
      location: event.location ?? undefined,
      extendedProperties: { private: { unlimitedBondEventId: event.id, unlimitedBondProductionDateId: event.productionDateId ?? undefined } },
    };
    if (event.isAllDay) {
      body.start = { date: dateOnly(event.startDate) };
      body.end = { date: dateOnly(event.endDate) };
    } else {
      body.start = { dateTime: event.startDate.toISOString(), timeZone: "Europe/London" };
      body.end = { dateTime: event.endDate.toISOString(), timeZone: "Europe/London" };
    }

    const url = event.googleCalendarEventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events/${event.googleCalendarEventId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`;
    const response = await fetch(url, {
      method: event.googleCalendarEventId ? "PUT" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error("[CALENDAR] Push to Google failed:", await response.text());
      return null;
    }
    const result = await response.json() as GoogleCalendarWriteResponse;
    return result.id ?? null;
  } catch (err) {
    console.error("[CALENDAR] Push error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export function eventCanCreateProductionDate(type: CalendarEventType): boolean {
  return productionDateTypeFromEvent(type) !== null;
}

export function toProductionDateType(type: CalendarEventType): ProductionDateType | null {
  return productionDateTypeFromEvent(type);
}
