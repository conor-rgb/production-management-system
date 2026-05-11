import { Router, Request, Response } from "express";
import { AdvanceCalcType, Prisma, RevisionStatus, SubCostLineType, SubCostStatus } from "@prisma/client";
import prisma from "../prisma";
import {
  applyTemplate,
  calculateRevisionTotals,
  createLineItem,
  createRevision,
  createSection,
  duplicateLineItem,
  getOrCreateBudget,
  getRevision,
  linePatchFromBody,
  recalculateAfterSubCost,
  syncProductionTotals,
  updateLineItem,
} from "../services/budgetService";
import { exportRevisionPdf } from "../services/budgetPdf";

const router = Router();

function numberOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(String(value));
}

function normalizeLineType(value: unknown): SubCostLineType {
  return Object.values(SubCostLineType).includes(value as SubCostLineType) ? value as SubCostLineType : SubCostLineType.PO;
}

function lineTypeLifecycle(lineType: SubCostLineType): Pick<Prisma.SubCostUncheckedCreateInput, "status" | "isAgreed" | "isInvoiced" | "isPaid" | "datePaid"> {
  if (lineType === SubCostLineType.RECEIPT) {
    return { status: SubCostStatus.PAID, isAgreed: true, isInvoiced: true, isPaid: true, datePaid: new Date() };
  }
  if (lineType === SubCostLineType.BILL) {
    return { status: SubCostStatus.INVOICED, isAgreed: false, isInvoiced: true, isPaid: false };
  }
  return { status: SubCostStatus.PENDING, isAgreed: false, isInvoiced: false, isPaid: false, datePaid: null };
}

function budgetPatch(body: Record<string, unknown>): Prisma.BudgetUpdateInput {
  return {
    jobName: body.jobName as string | null | undefined,
    jobLocation: body.jobLocation as string | null | undefined,
    shotCount: body.shotCount as string | null | undefined,
    prepTravelDate: body.prepTravelDate as string | null | undefined,
    shootDates: body.shootDates as string | null | undefined,
    photographerDirector: body.photographerDirector as string | null | undefined,
    accountingContact: body.accountingContact as string | null | undefined,
    comments: body.comments as string | null | undefined,
    caveats: body.caveats as string | null | undefined,
    usages: body.usages as string | null | undefined,
    productionFeePercent: numberOrUndefined(body.productionFeePercent),
    insurancePercent: numberOrUndefined(body.insurancePercent),
    currencyBase: body.currencyBase as string | undefined,
    currencySecondary: body.currencySecondary as string | null | undefined,
    currencyRate: numberOrNull(body.currencyRate),
    status: body.status as Prisma.EnumBudgetStatusFieldUpdateOperationsInput | undefined,
  };
}

function subCostPatch(body: Record<string, unknown>): Prisma.SubCostUncheckedUpdateInput {
  const status = body.status as SubCostStatus | undefined;
  const lineType = body.lineType === undefined ? undefined : normalizeLineType(body.lineType);
  const lifecycle = lineType ? lineTypeLifecycle(lineType) : {};
  return {
    description: body.description as string | undefined,
    lineType,
    supplierName: body.supplierName as string | null | undefined,
    amount: numberOrUndefined(body.amount),
    amountGross: numberOrNull(body.amountGross),
    vatAmount: numberOrNull(body.vatAmount),
    vatRate: numberOrNull(body.vatRate),
    currency: body.currency as string | undefined,
    status: status ?? lifecycle.status,
    invoiceNumber: body.invoiceNumber as string | null | undefined,
    invoiceDate: dateOrNull(body.invoiceDate),
    invoiceFileId: body.invoiceFileId as string | null | undefined,
    proofOfPayment: body.proofOfPayment as string | null | undefined,
    isAgreed: body.isAgreed as boolean | undefined ?? lifecycle.isAgreed,
    isInvoiced: body.isInvoiced as boolean | undefined ?? lifecycle.isInvoiced,
    isPaid: body.isPaid as boolean | undefined ?? lifecycle.isPaid,
    datePaid: dateOrNull(body.datePaid) ?? lifecycle.datePaid,
  };
}

async function lineRevision(lineItemId: string) {
  const line = await prisma.budgetLineItem.findUnique({
    where: { id: lineItemId },
    select: { section: { select: { revisionId: true, revision: { select: { budget: { select: { productionId: true } } } } } } },
  });
  if (!line) return null;
  if (line.section.revision.budget.productionId) await syncProductionTotals(line.section.revision.budget.productionId);
  return getRevision(line.section.revisionId);
}

// Budget
router.get("/production/:productionId", async (req: Request, res: Response): Promise<void> => {
  res.json(await getOrCreateBudget({ productionId: req.params.productionId }));
});

router.get("/opportunity/:opportunityId", async (req: Request, res: Response): Promise<void> => {
  res.json(await getOrCreateBudget({ opportunityId: req.params.opportunityId }));
});

router.patch("/:budgetId", async (req: Request, res: Response): Promise<void> => {
  const updated = await prisma.budget.update({
    where: { id: req.params.budgetId },
    data: budgetPatch(req.body as Record<string, unknown>),
  });
  if (updated.productionId) await syncProductionTotals(updated.productionId);
  res.json(await getOrCreateBudget(updated.productionId ? { productionId: updated.productionId } : { opportunityId: updated.opportunityId ?? undefined }));
});

// Templates
router.get("/templates", async (_req: Request, res: Response): Promise<void> => {
  const templates = await prisma.sectionTemplate.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  res.json(templates);
});

router.post("/templates", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; description?: string; sections?: Prisma.InputJsonValue };
  if (!body.name) { res.status(400).json({ error: "name is required" }); return; }
  const template = await prisma.sectionTemplate.create({
    data: {
      name: body.name,
      description: body.description,
      isDefault: false,
      sections: body.sections ?? [],
    },
  });
  res.status(201).json(template);
});

router.delete("/templates/:templateId", async (req: Request, res: Response): Promise<void> => {
  const template = await prisma.sectionTemplate.findUnique({ where: { id: req.params.templateId } });
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (template.isDefault) { res.status(400).json({ error: "Default templates cannot be deleted" }); return; }
  await prisma.sectionTemplate.delete({ where: { id: template.id } });
  res.status(204).end();
});

// Revisions
router.get("/:budgetId/revisions", async (req: Request, res: Response): Promise<void> => {
  const revisions = await prisma.budgetRevision.findMany({
    where: { budgetId: req.params.budgetId },
    orderBy: { revisionNumber: "asc" },
  });
  const withTotals = await Promise.all(revisions.map(async (revision) => ({
    ...revision,
    grandTotal: (await calculateRevisionTotals(revision.id)).grandTotal,
  })));
  res.json(withTotals);
});

router.get("/revisions/:revisionId", async (req: Request, res: Response): Promise<void> => {
  const revision = await getRevision(req.params.revisionId);
  if (!revision) { res.status(404).json({ error: "Revision not found" }); return; }
  res.json(revision);
});

router.post("/:budgetId/revisions", async (req: Request, res: Response): Promise<void> => {
  const revision = await createRevision(req.params.budgetId);
  res.status(201).json(revision);
});

router.patch("/revisions/:revisionId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const revision = await prisma.budgetRevision.update({
    where: { id: req.params.revisionId },
    data: {
      label: body.label as string | undefined,
      status: body.status as RevisionStatus | undefined,
      notes: body.notes as string | null | undefined,
      productionFeePercent: numberOrUndefined(body.productionFeePercent),
      insurancePercent: numberOrUndefined(body.insurancePercent),
    },
  });
  const totals = await calculateRevisionTotals(revision.id);
  await prisma.advanceInvoice.updateMany({ where: { budgetId: revision.budgetId }, data: {} });
  res.json({ ...await getRevision(revision.id), totals });
});

router.post("/revisions/:revisionId/apply-template", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { templateId?: string };
  if (!body.templateId) { res.status(400).json({ error: "templateId is required" }); return; }
  const revision = await applyTemplate(req.params.revisionId, body.templateId);
  res.status(201).json(revision);
});

router.post("/revisions/:revisionId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  const mode = req.body?.mode === "internal" ? "internal" : "client";
  try {
    const file = await exportRevisionPdf(req.params.revisionId, mode);
    res.json(file);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "PDF export failed" });
  }
});

// Sections
router.post("/revisions/:revisionId/sections", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { code?: string; name?: string; order?: number; isVisible?: boolean };
  if (!body.code || !body.name) { res.status(400).json({ error: "code and name are required" }); return; }
  res.status(201).json(await createSection(req.params.revisionId, { code: body.code, name: body.name, order: body.order, isVisible: body.isVisible }));
});

router.patch("/sections/:sectionId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const section = await prisma.budgetSection.update({
    where: { id: req.params.sectionId },
    data: {
      code: body.code as string | undefined,
      name: body.name as string | undefined,
      order: numberOrUndefined(body.order),
      isVisible: body.isVisible as boolean | undefined,
    },
  });
  res.json(section);
});

router.delete("/sections/:sectionId", async (req: Request, res: Response): Promise<void> => {
  await prisma.budgetSection.delete({ where: { id: req.params.sectionId } });
  res.status(204).end();
});

router.patch("/sections/:sectionId/reorder", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { order?: number };
  const section = await prisma.budgetSection.update({ where: { id: req.params.sectionId }, data: { order: body.order ?? 0 } });
  res.json(section);
});

// Line items
router.post("/sections/:sectionId/lines", async (req: Request, res: Response): Promise<void> => {
  const line = await createLineItem(req.params.sectionId, req.body as Partial<Prisma.BudgetLineItemUncheckedCreateInput>);
  res.status(201).json({ line, revision: await lineRevision(line.id) });
});

router.patch("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  const line = await updateLineItem(req.params.lineItemId, linePatchFromBody(req.body as Record<string, unknown>));
  res.json({ line, revision: await lineRevision(line.id) });
});

router.delete("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  const line = await prisma.budgetLineItem.findUnique({ where: { id: req.params.lineItemId }, select: { section: { select: { revisionId: true } } } });
  await prisma.budgetLineItem.delete({ where: { id: req.params.lineItemId } });
  res.status(204).json(line ? await getRevision(line.section.revisionId) : null);
});

router.post("/lines/:lineItemId/duplicate", async (req: Request, res: Response): Promise<void> => {
  const line = await duplicateLineItem(req.params.lineItemId);
  res.status(201).json({ line, revision: await lineRevision(line.id) });
});

router.patch("/lines/:lineItemId/reorder", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { order?: number };
  const line = await prisma.budgetLineItem.update({ where: { id: req.params.lineItemId }, data: { order: body.order ?? 0 } });
  res.json({ line, revision: await lineRevision(line.id) });
});

router.post("/lines/:lineItemId/sub-item", async (req: Request, res: Response): Promise<void> => {
  const parent = await prisma.budgetLineItem.findUnique({ where: { id: req.params.lineItemId } });
  if (!parent) { res.status(404).json({ error: "Line item not found" }); return; }
  const line = await createLineItem(parent.sectionId, {
    ...(req.body as Partial<Prisma.BudgetLineItemUncheckedCreateInput>),
    parentId: parent.id,
    isSubItem: true,
  });
  res.status(201).json({ line, revision: await lineRevision(line.id) });
});

// Sub-costs
router.post("/lines/:lineItemId/subcosts", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const lineType = normalizeLineType(body.lineType);
  const lifecycle = lineTypeLifecycle(lineType);
  const subCost = await prisma.subCost.create({
    data: {
      lineItemId: req.params.lineItemId,
      lineType,
      description: body.description as string || `${lineType === SubCostLineType.PO ? "PO" : lineType === SubCostLineType.BILL ? "Bill" : "Receipt"} cost line`,
      supplierName: body.supplierName as string | null | undefined,
      amount: Number(body.amount ?? 0),
      amountGross: numberOrNull(body.amountGross),
      vatAmount: numberOrNull(body.vatAmount),
      vatRate: numberOrNull(body.vatRate),
      currency: body.currency as string || "GBP",
      status: body.status as SubCostStatus | undefined ?? lifecycle.status,
      invoiceNumber: body.invoiceNumber as string | null | undefined,
      invoiceDate: dateOrNull(body.invoiceDate),
      datePaid: dateOrNull(body.datePaid),
      invoiceFileId: body.invoiceFileId as string | null | undefined,
      proofOfPayment: body.proofOfPayment as string | null | undefined,
      receiptCaptureId: body.receiptCaptureId as string | null | undefined,
      isAgreed: body.isAgreed as boolean | undefined ?? lifecycle.isAgreed,
      isInvoiced: body.isInvoiced as boolean | undefined ?? lifecycle.isInvoiced,
      isPaid: body.isPaid as boolean | undefined ?? lifecycle.isPaid,
    },
  });
  await recalculateAfterSubCost(req.params.lineItemId);
  res.status(201).json({ subCost, revision: await lineRevision(req.params.lineItemId) });
});

router.patch("/subcosts/:subCostId", async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.subCost.findUnique({ where: { id: req.params.subCostId } });
  if (!existing) { res.status(404).json({ error: "Sub-cost not found" }); return; }
  const subCost = await prisma.subCost.update({ where: { id: existing.id }, data: subCostPatch(req.body as Record<string, unknown>) });
  await recalculateAfterSubCost(existing.lineItemId);
  res.json({ subCost, revision: await lineRevision(existing.lineItemId) });
});

router.delete("/subcosts/:subCostId", async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.subCost.findUnique({ where: { id: req.params.subCostId } });
  if (!existing) { res.status(404).json({ error: "Sub-cost not found" }); return; }
  await prisma.subCost.delete({ where: { id: existing.id } });
  await recalculateAfterSubCost(existing.lineItemId);
  res.json({ revision: await lineRevision(existing.lineItemId) });
});

router.patch("/subcosts/:subCostId/status", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { status?: SubCostStatus };
  if (!body.status || !Object.values(SubCostStatus).includes(body.status)) {
    res.status(400).json({ error: "valid status is required" });
    return;
  }
  const existing = await prisma.subCost.findUnique({ where: { id: req.params.subCostId } });
  if (!existing) { res.status(404).json({ error: "Sub-cost not found" }); return; }
  const subCost = await prisma.subCost.update({
    where: { id: existing.id },
    data: {
      status: body.status,
      isAgreed: body.status !== SubCostStatus.PENDING,
      isInvoiced: body.status === SubCostStatus.INVOICED || body.status === SubCostStatus.PAID,
      isPaid: body.status === SubCostStatus.PAID,
      datePaid: body.status === SubCostStatus.PAID ? new Date() : undefined,
    },
  });
  await recalculateAfterSubCost(existing.lineItemId);
  res.json({ subCost, revision: await lineRevision(existing.lineItemId) });
});

// Advance invoices
router.get("/:budgetId/advances", async (req: Request, res: Response): Promise<void> => {
  const advances = await prisma.advanceInvoice.findMany({ where: { budgetId: req.params.budgetId }, orderBy: { createdAt: "asc" } });
  res.json(advances);
});

router.post("/:budgetId/advances", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const advance = await prisma.advanceInvoice.create({
    data: {
      budgetId: req.params.budgetId,
      label: body.label as string || "Advance",
      percent: numberOrNull(body.percent),
      amount: numberOrNull(body.amount),
      calculationType: body.calculationType as AdvanceCalcType | undefined,
      dueDate: dateOrNull(body.dueDate),
      notes: body.notes as string | null | undefined,
    },
  });
  res.status(201).json(advance);
});

router.patch("/advances/:advanceId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const advance = await prisma.advanceInvoice.update({
    where: { id: req.params.advanceId },
    data: {
      label: body.label as string | undefined,
      percent: numberOrNull(body.percent),
      amount: numberOrNull(body.amount),
      calculationType: body.calculationType as AdvanceCalcType | undefined,
      isPaid: body.isPaid as boolean | undefined,
      datePaid: dateOrNull(body.datePaid),
      dueDate: dateOrNull(body.dueDate),
      notes: body.notes as string | null | undefined,
    },
  });
  res.json(advance);
});

router.delete("/advances/:advanceId", async (req: Request, res: Response): Promise<void> => {
  await prisma.advanceInvoice.delete({ where: { id: req.params.advanceId } });
  res.status(204).end();
});

export default router;
