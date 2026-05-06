import { Router, Request, Response } from "express";
import { BudgetRevisionStatus, InvoiceStatus, Prisma, PurchaseOrderStatus } from "@prisma/client";
import prisma from "../prisma";
import {
  calculateRevisionTotals,
  createLineItem,
  createRevision,
  getOrCreateBudget,
  getRevision,
  insertCatalogGroup,
  insertCatalogItem,
  generatePoNumber,
  syncProductionTotals,
  updateLineItem,
} from "../services/budgetService";
import { exportRevisionPdf } from "../services/budgetPdf";

const router = Router();

function numberValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function dateValue(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return new Date(String(value));
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
    marginAmount: 0,
    marginPercent: 0,
    isClosed: Boolean(body.isClosed ?? false),
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

async function syncLineProduction(lineItemId: string) {
  const line = await prisma.budgetLineItem.findUnique({
    where: { id: lineItemId },
    select: { section: { select: { revision: { select: { budget: { select: { productionId: true } } } } } } },
  });
  const productionId = line?.section.revision.budget.productionId;
  if (productionId) await syncProductionTotals(productionId);
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
    const line = await updateLineItem(req.params.lineItemId, req.body);
    const owner = await prisma.budgetLineItem.findUnique({
      where: { id: req.params.lineItemId },
      select: { section: { select: { revisionId: true } } },
    });
    const revision = owner ? await getRevision(owner.section.revisionId) : null;
    res.json({ line, revision });
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
      marginAmount: line.marginAmount,
      marginPercent: line.marginPercent,
      actualCost: line.actualCost,
      variance: line.variance,
      isClosed: false,
      isTaxable: line.isTaxable,
      hasPW: line.hasPW,
      hasHealthSafety: line.hasHealthSafety,
      baseHours: line.baseHours,
      overtime15x: line.overtime15x,
      overtime2x: line.overtime2x,
      catalogItemId: line.catalogItemId,
      order: line.order + 1,
    },
    include: { invoices: true, purchaseOrders: true },
  });
  const revision = await getRevision(line.section.revisionId);
  res.status(201).json({ line: duplicate, revision });
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
  await syncLineProduction(req.params.lineItemId);
  res.status(201).json(invoice);
});

router.patch("/invoices/:invoiceId", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.lineItemInvoice.findUnique({ where: { id: req.params.invoiceId }, select: { lineItemId: true } });
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
  if (current) await syncLineProduction(current.lineItemId);
  res.json(invoice);
});

router.delete("/invoices/:invoiceId", async (req: Request, res: Response): Promise<void> => {
  const current = await prisma.lineItemInvoice.findUnique({ where: { id: req.params.invoiceId }, select: { lineItemId: true } });
  await prisma.lineItemInvoice.delete({ where: { id: req.params.invoiceId } });
  if (current) await syncLineProduction(current.lineItemId);
  res.status(204).end();
});

router.get("/lines/:lineItemId/pos", async (req: Request, res: Response): Promise<void> => {
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { lineItemId: req.params.lineItemId },
    orderBy: { dateRaised: "asc" },
    include: { invoiceFile: true },
  });
  res.json(purchaseOrders);
});

router.post("/lines/:lineItemId/pos", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.body.supplierName) { res.status(400).json({ error: "supplierName required" }); return; }
    const agreedAmount = numberValue(req.body.agreedAmount);
    if (agreedAmount === undefined) { res.status(400).json({ error: "agreedAmount required" }); return; }

    const line = await prisma.budgetLineItem.findUnique({
      where: { id: req.params.lineItemId },
      include: { section: { include: { revision: { include: { budget: true } } } } },
    });
    const productionId = line?.section.revision.budget.productionId;
    if (!line || !productionId) { res.status(400).json({ error: "Purchase orders can only be created for production budgets" }); return; }

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        lineItemId: req.params.lineItemId,
        productionId,
        poNumber: await generatePoNumber(productionId),
        supplierName: String(req.body.supplierName),
        description: req.body.description as string | undefined,
        agreedAmount,
        dateRaised: dateValue(req.body.dateRaised),
        notes: req.body.notes as string | undefined,
      },
      include: { invoiceFile: true },
    });
    await syncProductionTotals(productionId);
    res.status(201).json(purchaseOrder);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to create purchase order" });
  }
});

router.patch("/pos/:poId", async (req: Request, res: Response): Promise<void> => {
  try {
    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id: req.params.poId },
      data: {
        supplierName: req.body.supplierName as string | undefined,
        description: req.body.description as string | null | undefined,
        agreedAmount: numberValue(req.body.agreedAmount),
        status: req.body.status as PurchaseOrderStatus | undefined,
        invoiceNumber: req.body.invoiceNumber as string | null | undefined,
        invoiceDate: req.body.invoiceDate !== undefined ? (req.body.invoiceDate ? new Date(req.body.invoiceDate) : null) : undefined,
        invoiceFileId: req.body.invoiceFileId as string | null | undefined,
        notes: req.body.notes as string | null | undefined,
      },
      include: { invoiceFile: true },
    });
    await syncProductionTotals(purchaseOrder.productionId);
    res.json(purchaseOrder);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to update purchase order" });
  }
});

router.delete("/pos/:poId", async (req: Request, res: Response): Promise<void> => {
  const purchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: req.params.poId } });
  if (!purchaseOrder) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (purchaseOrder.status !== PurchaseOrderStatus.OPEN) {
    res.status(400).json({ error: "Only Open purchase orders can be deleted" });
    return;
  }
  await prisma.purchaseOrder.delete({ where: { id: req.params.poId } });
  await syncProductionTotals(purchaseOrder.productionId);
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
