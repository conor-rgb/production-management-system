import { Router, Request, Response } from "express";
import { CalendarEventType, ProjectActionStatus, ProjectActionType, ProjectActionVisibility } from "@prisma/client";
import prisma from "../prisma";
import { getProductionColor, pushToGoogleCalendar } from "../services/calendarSyncService";
import { getPrimaryAccount } from "../services/googleCalendarService";

const router = Router();

const LANE_COLORS = ["#f7c59f", "#c8d8f0", "#ead1dc", "#fff2cc", "#e6b8af", "#b4a7d6", "#cfe2f3", "#d9ead3"];

type ActionBody = {
  title?: string;
  description?: string | null;
  actionType?: ProjectActionType;
  visibility?: ProjectActionVisibility;
  status?: ProjectActionStatus;
  startAt?: string | null;
  endAt?: string | null;
  isAllDay?: boolean;
  location?: string | null;
  zoomLink?: string | null;
  reminderMinutes?: number | null;
  workstreamId?: string | null;
  roleRequirementId?: string | null;
  optionCandidateId?: string | null;
  blackbookEntryId?: string | null;
  emailThreadId?: string | null;
  emailMessageId?: string | null;
};

function actionType(value: unknown): ProjectActionType {
  return typeof value === "string" && value in ProjectActionType ? value as ProjectActionType : ProjectActionType.TASK;
}

function actionStatus(value: unknown): ProjectActionStatus {
  return typeof value === "string" && value in ProjectActionStatus ? value as ProjectActionStatus : ProjectActionStatus.TODO;
}

function actionVisibility(value: unknown): ProjectActionVisibility {
  return typeof value === "string" && value in ProjectActionVisibility ? value as ProjectActionVisibility : ProjectActionVisibility.INTERNAL;
}

function calendarType(type: ProjectActionType): CalendarEventType {
  if (type === ProjectActionType.SHOOT) return CalendarEventType.SHOOT_DAY;
  if (type === ProjectActionType.MEETING) return CalendarEventType.MEETING;
  if (type === ProjectActionType.DEADLINE || type === ProjectActionType.REMINDER) return CalendarEventType.FOLLOW_UP;
  if (type === ProjectActionType.EVENT || type === ProjectActionType.TRAVEL) return CalendarEventType.STANDALONE;
  return CalendarEventType.OTHER;
}

function defaultEnd(start: Date, isAllDay: boolean): Date {
  const end = new Date(start);
  if (isAllDay) {
    end.setDate(end.getDate() + 1);
  } else {
    end.setHours(end.getHours() + 1);
  }
  return end;
}

async function pushEvent(eventId: string): Promise<void> {
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

async function ensureWorkstreams(productionId: string) {
  const groups = await prisma.optionGroup.findMany({
    where: { productionId },
    orderBy: { order: "asc" },
    include: {
      requirements: { orderBy: { order: "asc" }, include: { assignments: { include: { candidate: { include: { blackbookEntry: true } }, date: true } } } },
      candidates: { orderBy: { order: "asc" }, include: { blackbookEntry: true, dateStatuses: { include: { date: true } }, assignments: { include: { requirement: true, date: true } } } },
    },
  });

  await Promise.all(groups.map((group, index) =>
    prisma.projectWorkstream.upsert({
      where: { productionId_optionGroupId: { productionId, optionGroupId: group.id } },
      update: { name: group.name, order: group.order, color: LANE_COLORS[index % LANE_COLORS.length] },
      create: { productionId, optionGroupId: group.id, name: group.name, order: group.order, color: LANE_COLORS[index % LANE_COLORS.length] },
    })
  ));

  const workstreams = await prisma.projectWorkstream.findMany({
    where: { productionId },
    orderBy: { order: "asc" },
    include: {
      optionGroup: {
        include: {
          requirements: { orderBy: { order: "asc" }, include: { assignments: { include: { candidate: { include: { blackbookEntry: true } }, date: true } } } },
          candidates: { orderBy: { order: "asc" }, include: { blackbookEntry: true, dateStatuses: { include: { date: true } }, assignments: { include: { requirement: true, date: true } } } },
        },
      },
    },
  });

  return workstreams;
}

async function syncCalendarEvent(actionId: string): Promise<void> {
  const action = await prisma.projectAction.findUnique({
    where: { id: actionId },
    include: { production: { select: { jobCode: true, clientName: true, brand: true, title: true } }, workstream: true },
  });
  if (!action || !action.startAt) return;

  const startDate = action.startAt;
  const endDate = action.endAt ?? defaultEnd(startDate, action.isAllDay);
  const color = action.workstream?.color ?? (action.production.jobCode ? getProductionColor(action.production.jobCode) : "#5B8DEF");
  const notes = [
    action.description,
    action.reminderMinutes ? `Reminder: ${action.reminderMinutes} minutes before` : null,
    action.emailMessageId ? `Linked email message: ${action.emailMessageId}` : null,
  ].filter(Boolean).join("\n");

  const eventData = {
    title: action.title,
    startDate,
    endDate,
    isAllDay: action.isAllDay,
    location: action.location ?? null,
    zoomLink: action.zoomLink ?? null,
    notes: notes || null,
    color,
    eventType: calendarType(action.actionType),
    productionId: action.productionId,
  };

  const event = action.calendarEventId
    ? await prisma.calendarEvent.update({ where: { id: action.calendarEventId }, data: eventData })
    : await prisma.calendarEvent.create({ data: eventData });

  if (!action.calendarEventId) {
    await prisma.projectAction.update({ where: { id: action.id }, data: { calendarEventId: event.id } });
  }
  pushEvent(event.id).catch((err) => console.error("[PROJECT ACTION] Google push failed:", err instanceof Error ? err.message : err));
}

const actionInclude = {
  workstream: true,
  roleRequirement: true,
  optionCandidate: { include: { blackbookEntry: true } },
  blackbookEntry: true,
  emailThread: { select: { id: true, subject: true, gmailThreadId: true } },
  emailMessage: { select: { id: true, subject: true, fromAddress: true, fromName: true, sentAt: true, snippet: true } },
  calendarEvent: true,
} as const;

router.get("/production/:productionId", async (req: Request, res: Response): Promise<void> => {
  const production = await prisma.production.findUnique({
    where: { id: req.params.productionId },
    select: { id: true, title: true, jobCode: true, clientName: true, brand: true },
  });
  if (!production) { res.status(404).json({ error: "Production not found" }); return; }

  const [workstreams, actions, dates] = await Promise.all([
    ensureWorkstreams(production.id),
    prisma.projectAction.findMany({ where: { productionId: production.id }, orderBy: [{ startAt: "asc" }, { createdAt: "asc" }], include: actionInclude }),
    prisma.productionDate.findMany({ where: { productionId: production.id }, orderBy: { date: "asc" } }),
  ]);

  res.json({ production, workstreams, actions, dates });
});

router.post("/production/:productionId/workstreams", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; color?: string | null; order?: number };
  if (!body.name?.trim()) { res.status(400).json({ error: "name required" }); return; }
  const workstream = await prisma.projectWorkstream.create({
    data: {
      productionId: req.params.productionId,
      name: body.name.trim(),
      color: body.color ?? LANE_COLORS[0],
      order: Number.isFinite(body.order) ? Number(body.order) : 999,
    },
  });
  res.status(201).json(workstream);
});

router.patch("/workstreams/:workstreamId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; color?: string | null; order?: number; visibleOnClientTimeline?: boolean };
  const workstream = await prisma.projectWorkstream.update({
    where: { id: req.params.workstreamId },
    data: {
      name: body.name,
      color: body.color,
      order: body.order,
      visibleOnClientTimeline: body.visibleOnClientTimeline,
    },
  });
  res.json(workstream);
});

router.post("/production/:productionId/actions", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ActionBody;
  if (!body.title?.trim()) { res.status(400).json({ error: "title required" }); return; }
  const action = await prisma.projectAction.create({
    data: {
      productionId: req.params.productionId,
      title: body.title.trim(),
      description: body.description ?? null,
      actionType: actionType(body.actionType),
      visibility: actionVisibility(body.visibility),
      status: actionStatus(body.status),
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      isAllDay: body.isAllDay ?? true,
      location: body.location ?? null,
      zoomLink: body.zoomLink ?? null,
      reminderMinutes: body.reminderMinutes ?? null,
      workstreamId: body.workstreamId ?? null,
      roleRequirementId: body.roleRequirementId ?? null,
      optionCandidateId: body.optionCandidateId ?? null,
      blackbookEntryId: body.blackbookEntryId ?? null,
      emailThreadId: body.emailThreadId ?? null,
      emailMessageId: body.emailMessageId ?? null,
    },
    include: actionInclude,
  });
  await syncCalendarEvent(action.id);
  const updated = await prisma.projectAction.findUnique({ where: { id: action.id }, include: actionInclude });
  res.status(201).json(updated ?? action);
});

router.patch("/actions/:actionId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ActionBody;
  const action = await prisma.projectAction.update({
    where: { id: req.params.actionId },
    data: {
      title: body.title,
      description: body.description,
      actionType: body.actionType ? actionType(body.actionType) : undefined,
      visibility: body.visibility ? actionVisibility(body.visibility) : undefined,
      status: body.status ? actionStatus(body.status) : undefined,
      startAt: body.startAt === null ? null : body.startAt ? new Date(body.startAt) : undefined,
      endAt: body.endAt === null ? null : body.endAt ? new Date(body.endAt) : undefined,
      isAllDay: body.isAllDay,
      location: body.location,
      zoomLink: body.zoomLink,
      reminderMinutes: body.reminderMinutes,
      workstreamId: body.workstreamId,
      roleRequirementId: body.roleRequirementId,
      optionCandidateId: body.optionCandidateId,
      blackbookEntryId: body.blackbookEntryId,
      emailThreadId: body.emailThreadId,
      emailMessageId: body.emailMessageId,
    },
    include: actionInclude,
  });
  await syncCalendarEvent(action.id);
  const updated = await prisma.projectAction.findUnique({ where: { id: action.id }, include: actionInclude });
  res.json(updated ?? action);
});

router.delete("/actions/:actionId", async (req: Request, res: Response): Promise<void> => {
  const action = await prisma.projectAction.findUnique({ where: { id: req.params.actionId } });
  if (!action) { res.status(404).json({ error: "Action not found" }); return; }
  await prisma.projectAction.delete({ where: { id: action.id } });
  if (action.calendarEventId) {
    await prisma.calendarEvent.delete({ where: { id: action.calendarEventId } }).catch(() => undefined);
  }
  res.status(204).end();
});

router.post("/email/messages/:messageId/actions", async (req: Request, res: Response): Promise<void> => {
  const message = await prisma.emailMessage.findUnique({
    where: { id: req.params.messageId },
    include: { thread: true },
  });
  if (!message) { res.status(404).json({ error: "Email message not found" }); return; }
  const body = req.body as ActionBody & { productionId?: string };
  const productionId = body.productionId ?? message.thread.linkedProductionId;
  if (!productionId) { res.status(400).json({ error: "Thread is not linked to a production" }); return; }

  const title = body.title?.trim() || `Follow up: ${message.subject}`;
  const action = await prisma.projectAction.create({
    data: {
      productionId,
      title,
      description: body.description ?? message.snippet ?? null,
      actionType: actionType(body.actionType ?? ProjectActionType.TASK),
      visibility: actionVisibility(body.visibility),
      status: actionStatus(body.status),
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      isAllDay: body.isAllDay ?? true,
      workstreamId: body.workstreamId ?? null,
      emailThreadId: message.threadId,
      emailMessageId: message.id,
    },
    include: actionInclude,
  });
  await syncCalendarEvent(action.id);
  const updated = await prisma.projectAction.findUnique({ where: { id: action.id }, include: actionInclude });
  res.status(201).json(updated ?? action);
});

export default router;
