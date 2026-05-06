import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { Stage, LostReason } from "@prisma/client";
import { generateJobCode } from "../utils/jobCode";
import { ensureProductionFoldersForRecord } from "../services/fileStorage";
import { cloneBudgetToProduction } from "../services/budgetService";

const router = Router();

const fullInclude = {
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true } },
  activityNotes: { orderBy: { createdAt: "asc" as const } },
  tasks: { orderBy: { createdAt: "asc" as const } },
  productions: { select: { id: true, title: true, jobCode: true, status: true } },
};

const productionSelect = {
  id: true,
  title: true,
  clientName: true,
  brand: true,
  jobType: true,
  value: true,
  contactId: true,
  opportunityId: true,
  jobCode: true,
  status: true,
  storagePath: true,
  createdAt: true,
} as const;

async function transitionOpportunityStage(
  opportunityId: string,
  stage: Stage,
  lostReason?: LostReason,
  lostNote?: string
) {
  if (stage === Stage.LOST) {
    if (!lostReason) throw new Error("lostReason required when marking Lost");
    const validReasons = Object.values(LostReason);
    if (!validReasons.includes(lostReason)) {
      throw new Error(`lostReason must be one of: ${validReasons.join(", ")}`);
    }
  }

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { productions: { select: productionSelect } },
  });
  if (!opp) return null;

  let production = stage === Stage.WON ? opp.productions[0] : undefined;
  let budgetCloned = false;

  if (stage === Stage.WON && !production) {
    const jobCode = await generateJobCode();
    production = await prisma.production.create({
      data: {
        title: opp.title,
        clientName: opp.clientName,
        brand: opp.brand,
        jobType: opp.jobType,
        value: opp.value,
        opportunityId: opp.id,
        contactId: opp.contactId,
        jobCode,
        status: "PRE_PRO",
      },
      select: productionSelect,
    });
    await ensureProductionFoldersForRecord(production);
    production = await prisma.production.findUniqueOrThrow({
      where: { id: production.id },
      select: productionSelect,
    });
    const cloned = await cloneBudgetToProduction(opportunityId, production.id);
    budgetCloned = Boolean(cloned);
  }

  const opportunity = await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      stage,
      lostReason: stage === Stage.LOST ? lostReason : null,
      lostNote: stage === Stage.LOST ? (lostNote ?? null) : null,
    },
    include: fullInclude,
  });

  return { opportunity, production, budgetCloned };
}

// GET /api/opportunities?stage=&overdue=true&search=
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { stage, overdue, search } = req.query;

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (overdue === "true") {
    where.followUpDate = { lt: new Date() };
    where.stage = { notIn: [Stage.WON, Stage.LOST] };
  }
  if (search) {
    const s = String(search);
    where.OR = [
      { title: { contains: s, mode: "insensitive" } },
      { clientName: { contains: s, mode: "insensitive" } },
      { brand: { contains: s, mode: "insensitive" } },
    ];
  }

  const items = await prisma.opportunity.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
      _count: { select: { activityNotes: true, tasks: true } },
    },
  });
  res.json(items);
});

// GET /api/opportunities/overdue — for dashboard widget
router.get("/overdue", async (_req: Request, res: Response): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = await prisma.opportunity.findMany({
    where: {
      followUpDate: { lt: today },
      stage: { notIn: [Stage.WON, Stage.LOST] },
    },
    orderBy: { followUpDate: "asc" },
    select: {
      id: true, title: true, clientName: true, brand: true,
      followUpDate: true, stage: true, value: true,
    },
  });
  res.json(items);
});

// GET /api/opportunities/stage-counts — for dashboard widget
router.get("/stage-counts", async (_req: Request, res: Response): Promise<void> => {
  const counts = await prisma.opportunity.groupBy({
    by: ["stage"],
    _count: { stage: true },
    where: { stage: { notIn: [Stage.WON, Stage.LOST] } },
  });
  const result: Record<string, number> = {};
  for (const c of counts) result[c.stage] = c._count.stage;
  res.json(result);
});

// GET /api/opportunities/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.opportunity.findUnique({
    where: { id: req.params.id },
    include: fullInclude,
  });
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

// POST /api/opportunities
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    title, clientName, brand, jobType, source, contactId, companyId,
    description, value, stage, followUpDate, dateReceived, notes,
    // auto-create contact fields
    newContactFirstName, newContactLastName, newContactEmail,
  } = req.body;

  if (!title) { res.status(400).json({ error: "title required" }); return; }

  let resolvedContactId = contactId;

  // Auto-create contact if name provided but no existing contactId
  if (!contactId && newContactFirstName) {
    const newContact = await prisma.contact.create({
      data: {
        firstName: newContactFirstName,
        lastName: newContactLastName,
        email: newContactEmail,
        type: "CLIENT",
        companyId: companyId ?? undefined,
      },
    });
    resolvedContactId = newContact.id;
  }

  const item = await prisma.opportunity.create({
    data: {
      title, clientName, brand, jobType, source, description, notes,
      value: value ? parseFloat(value) : undefined,
      stage: stage ?? Stage.ENQUIRY,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
      dateReceived: dateReceived ? new Date(dateReceived) : undefined,
      contactId: resolvedContactId,
      companyId,
    },
    include: fullInclude,
  });
  res.status(201).json(item);
});

// PATCH /api/opportunities/:id — general field updates
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const {
    title, clientName, brand, jobType, source, contactId, companyId,
    description, value, followUpDate, dateReceived, notes, stage, lostReason, lostNote,
  } = req.body;

  if (stage !== undefined) {
    if (!Object.values(Stage).includes(stage)) {
      res.status(400).json({ error: `stage must be one of: ${Object.values(Stage).join(", ")}` });
      return;
    }

    try {
      const result = await transitionOpportunityStage(req.params.id, stage, lostReason, lostNote);
      if (!result) { res.status(404).json({ error: "Not found" }); return; }
      res.json(result);
      return;
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid stage transition" });
      return;
    }
  }

  const item = await prisma.opportunity.update({
    where: { id: req.params.id },
    data: {
      title, clientName, brand, jobType, source, contactId, companyId,
      description, notes,
      value: value !== undefined ? (value === null ? null : parseFloat(value)) : undefined,
      followUpDate: followUpDate !== undefined ? (followUpDate ? new Date(followUpDate) : null) : undefined,
      dateReceived: dateReceived !== undefined ? (dateReceived ? new Date(dateReceived) : null) : undefined,
    },
    include: fullInclude,
  });
  res.json(item);
});

// POST /api/opportunities/:id/stage — stage transition with business logic
router.post("/:id/stage", async (req: Request, res: Response): Promise<void> => {
  const { stage, lostReason, lostNote } = req.body;
  if (!stage) { res.status(400).json({ error: "stage required" }); return; }
  if (!Object.values(Stage).includes(stage)) {
    res.status(400).json({ error: `stage must be one of: ${Object.values(Stage).join(", ")}` });
    return;
  }

  try {
    const result = await transitionOpportunityStage(req.params.id, stage, lostReason, lostNote);
    if (!result) { res.status(404).json({ error: "Not found" }); return; }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid stage transition" });
  }
});

// DELETE /api/opportunities/:id
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.opportunity.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ─── Notes ───────────────────────────────────────────────────────────────────

router.post("/:id/notes", async (req: Request, res: Response): Promise<void> => {
  const { body } = req.body;
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const note = await prisma.opportunityNote.create({
    data: { opportunityId: req.params.id, body },
  });
  res.status(201).json(note);
});

router.patch("/:id/notes/:noteId", async (req: Request, res: Response): Promise<void> => {
  const note = await prisma.opportunityNote.update({
    where: { id: req.params.noteId },
    data: { body: req.body.body },
  });
  res.json(note);
});

router.delete("/:id/notes/:noteId", async (req: Request, res: Response): Promise<void> => {
  await prisma.opportunityNote.delete({ where: { id: req.params.noteId } });
  res.status(204).end();
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

router.post("/:id/tasks", async (req: Request, res: Response): Promise<void> => {
  const { body, dueDate } = req.body;
  if (!body) { res.status(400).json({ error: "body required" }); return; }
  const task = await prisma.opportunityTask.create({
    data: {
      opportunityId: req.params.id,
      body,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  });
  res.status(201).json(task);
});

router.patch("/:id/tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  const { body, completed, dueDate } = req.body;
  const task = await prisma.opportunityTask.update({
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
  await prisma.opportunityTask.delete({ where: { id: req.params.taskId } });
  res.status(204).end();
});

export default router;
