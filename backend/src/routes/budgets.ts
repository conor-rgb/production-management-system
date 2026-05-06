import { Router, Request, Response } from "express";
import { BudgetRevisionStatus, InvoiceStatus, Prisma } from "@prisma/client";
import prisma from "../prisma";
import {
  calculateRevisionTotals,
  createLineItem,
  createRevision,
  getOrCreateBudget,
  getRevision,
  insertCatalogGroup,
  insertCatalogItem,
  syncProductionTotals,
  updateLineItem,
} from "../services/budgetService";
import { exportRevisionPdf } from "../services/budgetPdf";

const router = Router();

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function lineData(body: Record<string, unknown>): Prisma.BudgetLineItemUncheckedCreateInput {
  return {
    sectionId: String(body.sectionId ?? ""),
    lineCode: String(body.lineCode ?? ""),
    description: String(body.description ?? "New line item"),
    privateMemo: body.privateMemo as string | undefined,
    publicMemo: body.publicMemo as string | undefined,
    internalUnitCost: numberValue(body.internalUnitCost) ?? 0,
    clientUnitCost: numberValue(body.clientUnitCost) ?? 0,
    quantity: numberValue(body.quantity) ?? 1,
    daysUnits: numberValue(body.daysUnits) ?? 1,
    unitLabel: String(body.unitLabel ?? "Days"),
    agencyMarkup: numberValue(body.agencyMarkup) ?? 0,
    internalSubtotal: 0,
    clientSubtotal: 0,
    actualCost: numberValue(body.actualCost) ?? 0,
    variance: 0,
    isTaxable: Boolean(body.isTaxable ?? false),
    hasPW: Boolean(body.hasPW ?? false),
    hasHealthSafety: Boolean(body.hasHealthSafety ?? false),
    baseHours: numberValue(body.baseHours),
    overtime15x: numberValue(body.overtime15x),
    overtime2x: numberValue(body.overtime2x),
    catalogItemId: body.catalogItemId as string | undefined,
    order: numberValue(body.order) ?? 0,
  };
}

router.get("/production/:productionId", async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getOrCreateBudget({ productionId: req.params.productionId }));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to load budget" });
  }
});

router.get("/opportunity/:opportunityId", async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getOrCreateBudget({ opportunityId: req.params.opportunityId }));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to load budget" });
  }
});

router.get("/:budgetId/revisions", async (req: Request, res: Response): Promise<void> => {
  const revisions = await prisma.budgetRevision.findMany({
    where: { budgetId: req.params.budgetId },
    orderBy: { revisionNumber: "desc" },
    include: {
      sections: { include: { lineItems: true } },
    },
  });
  res.json(revisions.map((revision) => ({
    id: revision.id,
    budgetId: revision.budgetId,
    revisionNumber: revision.revisionNumber,
    label: revision.label,
    status: revision.status,
    version: revision.version,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
    clientGrandTotal: revision.sections.reduce((sum, section) => (
      sum + section.lineItems.reduce((lineSum, line) => lineSum + line.clientSubtotal, 0)
    ), 0) * (1 + revision.productionFeePercent / 100),
  })));
});

router.get("/revisions/:revisionId", async (req: Request, res: Response): Promise<void> => {
  const revision = await getRevision(req.params.revisionId);
  if (!revision) { res.status(404).json({ error: "Revision not found" }); return; }
  res.json(revision);
});

router.post("/:budgetId/revisions", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await createRevision(req.params.budgetId, { label: req.body.label, sourceRevisionId: req.body.sourceRevisionId }));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create revision" });
  }
});

router.patch("/revisions/:revisionId", async (req: Request, res: Response): Promise<void> => {
  const { label, status, notes, productionFeePercent } = req.body;
  const revision = await prisma.budgetRevision.update({
    where: { id: req.params.revisionId },
    data: {
      label,
      status: status as BudgetRevisionStatus | undefined,
      notes,
      productionFeePercent: numberValue(productionFeePercent),
    },
    include: { budget: true },
  });
  if (revision.budget.productionId) await syncProductionTotals(revision.budget.productionId);
  res.json(await getRevision(revision.id));
});

router.post("/revisions/:revisionId/sections/:sectionId/lines", async (req: Request, res: Response): Promise<void> => {
  try {
    const data = lineData({ ...req.body, sectionId: req.params.sectionId });
    res.status(201).json(await createLineItem(req.params.revisionId, req.params.sectionId, data));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create line item" });
  }
});

router.post("/revisions/:revisionId/catalog-item", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await insertCatalogItem(req.params.revisionId, req.body.sectionCode, req.body.catalogItemId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to insert catalog item" });
  }
});

router.post("/revisions/:revisionId/catalog-group", async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await insertCatalogGroup(req.params.revisionId, req.body.groupId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to insert catalog group" });
  }
});

router.patch("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await updateLineItem(req.params.lineItemId, req.body));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update line item" });
  }
});

router.post("/lines/:lineItemId/duplicate", async (req: Request, res: Response): Promise<void> => {
  const line = await prisma.budgetLineItem.findUnique({ where: { id: req.params.lineItemId }, include: { section: true } });
  if (!line) { res.status(404).json({ error: "Line item not found" }); return; }
  const count = await prisma.budgetLineItem.count({ where: { sectionId: line.sectionId } });
  const duplicate = await prisma.budgetLineItem.create({
    data: {
      sectionId: line.sectionId,
      lineCode: `${line.section.code}_${String(count + 1).padStart(2, "0")}`,
      description: line.description,
      privateMemo: line.privateMemo,
      publicMemo: line.publicMemo,
      internalUnitCost: line.internalUnitCost,
      clientUnitCost: line.clientUnitCost,
      quantity: line.quantity,
      daysUnits: line.daysUnits,
      unitLabel: line.unitLabel,
      agencyMarkup: line.agencyMarkup,
      internalSubtotal: line.internalSubtotal,
      clientSubtotal: line.clientSubtotal,
      actualCost: line.actualCost,
      variance: line.variance,
      isTaxable: line.isTaxable,
      hasPW: line.hasPW,
      hasHealthSafety: line.hasHealthSafety,
      baseHours: line.baseHours,
      overtime15x: line.overtime15x,
      overtime2x: line.overtime2x,
      catalogItemId: line.catalogItemId,
      order: line.order + 1,
    },
  });
  res.status(201).json(duplicate);
});

router.delete("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  const line = await prisma.budgetLineItem.findUnique({
    where: { id: req.params.lineItemId },
    include: { section: { include: { revision: { include: { budget: true } } } } },
  });
  if (!line) { res.status(404).json({ error: "Line item not found" }); return; }
  await prisma.budgetLineItem.delete({ where: { id: req.params.lineItemId } });
  if (line.section.revision.budget.productionId) await syncProductionTotals(line.section.revision.budget.productionId);
  res.status(204).end();
});

router.patch("/lines/:lineItemId/reorder", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.budgetLineItem.update({ where: { id: req.params.lineItemId }, data: { order: numberValue(req.body.order) ?? 0 } });
  res.json(item);
});

router.post("/lines/:lineItemId/invoices", async (req: Request, res: Response): Promise<void> => {
  const invoice = await prisma.lineItemInvoice.create({
    data: {
      lineItemId: req.params.lineItemId,
      supplierName: req.body.supplierName,
      invoiceNumber: req.body.invoiceNumber,
      amount: Number(req.body.amount ?? 0),
      dateReceived: req.body.dateReceived ? new Date(req.body.dateReceived) : undefined,
      status: (req.body.status as InvoiceStatus | undefined) ?? InvoiceStatus.PENDING,
      jobFileId: req.body.jobFileId,
      notes: req.body.notes,
    },
  });
  res.status(201).json(invoice);
});

router.patch("/invoices/:invoiceId", async (req: Request, res: Response): Promise<void> => {
  const invoice = await prisma.lineItemInvoice.update({
    where: { id: req.params.invoiceId },
    data: {
      supplierName: req.body.supplierName,
      invoiceNumber: req.body.invoiceNumber,
      amount: numberValue(req.body.amount),
      dateReceived: req.body.dateReceived !== undefined ? (req.body.dateReceived ? new Date(req.body.dateReceived) : null) : undefined,
      status: req.body.status as InvoiceStatus | undefined,
      jobFileId: req.body.jobFileId,
      notes: req.body.notes,
    },
  });
  res.json(invoice);
});

router.delete("/invoices/:invoiceId", async (req: Request, res: Response): Promise<void> => {
  await prisma.lineItemInvoice.delete({ where: { id: req.params.invoiceId } });
  res.status(204).end();
});

router.post("/revisions/:revisionId/export-pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    const mode = req.body.mode === "internal" ? "internal" : "client";
    res.status(201).json(await exportRevisionPdf(req.params.revisionId, mode));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to export PDF" });
  }
});

router.get("/revisions/:revisionId/totals", async (req: Request, res: Response): Promise<void> => {
  res.json(await calculateRevisionTotals(req.params.revisionId));
});

export default router;
