import { Router, Request, Response } from "express";
import multer from "multer";
import mime from "mime-types";
import { AdvanceCalcType, BlackbookCategory, BlackbookEntryType, BlackbookLifecycleStatus, Prisma, PurchaseOrderStatus, RevisionStatus, SubCostLineType, SubCostStatus } from "@prisma/client";
import prisma from "../prisma";
import {
  applyTemplate,
  calculateRevisionTotals,
  cloneRevisionForEdit,
  createLineItem,
  createRevision,
  createSection,
  duplicateLineItem,
  getOrCreateBudget,
  getRevision,
  isRevisionImmutable,
  linePatchFromBody,
  recalculateAfterSubCost,
  syncProductionTotals,
  updateLineItem,
} from "../services/budgetService";
import { exportRevisionPdf } from "../services/budgetPdf";
import { autoFileDocument } from "../services/fileStorage";
import { ParsedReceiptLineItem, parseReceiptImage } from "../services/receiptParser";

const router = Router();
const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const billParseMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

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

const purchaseOrderInclude = {
  blackbookEntry: { select: { id: true, displayName: true, email: true, phone: true, category: true, entryType: true } },
  optionCandidate: { select: { id: true, name: true, group: { select: { id: true, name: true, type: true } } } },
  allocations: {
    orderBy: { createdAt: "asc" as const },
    include: {
      invoiceFile: { select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true, uploadedAt: true } },
      lineItem: {
        select: {
          id: true,
          lineCode: true,
          description: true,
          estimatedTotal: true,
          actualTotal: true,
          variance: true,
          section: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderGroupInclude;

type PurchaseOrderWithRelations = Prisma.PurchaseOrderGroupGetPayload<{ include: typeof purchaseOrderInclude }>;

function decoratePurchaseOrder(po: PurchaseOrderWithRelations) {
  const total = po.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  return { ...po, total };
}

async function purchaseOrdersForProduction(productionId: string) {
  const purchaseOrders = await prisma.purchaseOrderGroup.findMany({
    where: { productionId },
    orderBy: [{ createdAt: "desc" }, { poNumber: "desc" }],
    include: purchaseOrderInclude,
  });
  return purchaseOrders.map(decoratePurchaseOrder);
}

async function syncPurchaseOrderStatus(purchaseOrderGroupId: string | null | undefined): Promise<void> {
  if (!purchaseOrderGroupId) return;
  const po = await prisma.purchaseOrderGroup.findUnique({
    where: { id: purchaseOrderGroupId },
    include: { allocations: true },
  });
  if (!po || po.status === PurchaseOrderStatus.CANCELLED || po.allocations.length === 0) return;
  const allPaid = po.allocations.every((allocation) => allocation.isPaid);
  const hasBill = po.allocations.some((allocation) => allocation.lineType === SubCostLineType.BILL);
  const hasPo = po.allocations.some((allocation) => allocation.lineType === SubCostLineType.PO);
  const nextStatus = allPaid
    ? PurchaseOrderStatus.PAID
    : hasBill && hasPo
      ? PurchaseOrderStatus.PART_BILLED
      : hasBill
        ? PurchaseOrderStatus.BILLED
        : po.status;
  if (nextStatus !== po.status) {
    await prisma.purchaseOrderGroup.update({
      where: { id: po.id },
      data: { status: nextStatus },
    });
  }
}

function parseBillAllocationOverrides(value: unknown): Array<{ id: string; amount?: number }> {
  if (typeof value !== "string" || !value.trim()) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item): Array<{ id: string; amount?: number }> => {
    if (!item || typeof item !== "object") return [];
    const record = item as { id?: unknown; amount?: unknown };
    if (typeof record.id !== "string") return [];
    const amount = Number(record.amount);
    return [{ id: record.id, amount: Number.isFinite(amount) && amount >= 0 ? amount : undefined }];
  });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function textTokens(value: string): Set<string> {
  const stopWords = new Set(["the", "and", "for", "with", "cost", "line", "item", "fee", "fees", "day", "days", "kit"]);
  return new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token)));
}

function tokenScore(left: string, right: string): number {
  const leftTokens = textTokens(left);
  const rightTokens = textTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function suggestBillAllocations(
  allocations: Array<{ id: string; amount: number; label: string }>,
  parsedNetAmount: number | null,
  lineItems: ParsedReceiptLineItem[] = []
): Array<{ id: string; amount: number; matchedLineItems: string[] }> {
  const matchedTotals = new Map<string, { amount: number; labels: string[] }>();
  for (const lineItem of lineItems) {
    const lineAmount = lineItem.amountNet ?? lineItem.amountGross;
    if (!lineItem.description || !lineAmount || lineAmount <= 0) continue;
    const best = allocations
      .map((allocation) => ({ allocation, score: tokenScore(lineItem.description ?? "", allocation.label) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.16) continue;
    const current = matchedTotals.get(best.allocation.id) ?? { amount: 0, labels: [] };
    current.amount += lineAmount / 100;
    current.labels.push(lineItem.description);
    matchedTotals.set(best.allocation.id, current);
  }

  if (matchedTotals.size) {
    return allocations.map((allocation) => {
      const matched = matchedTotals.get(allocation.id);
      return {
        id: allocation.id,
        amount: roundMoney(matched?.amount ?? 0),
        matchedLineItems: matched?.labels ?? [],
      };
    });
  }

  const currentTotal = allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  if (!parsedNetAmount || parsedNetAmount <= 0 || currentTotal <= 0) {
    return allocations.map((allocation) => ({ id: allocation.id, amount: roundMoney(Number(allocation.amount ?? 0)), matchedLineItems: [] }));
  }

  let running = 0;
  return allocations.map((allocation, index) => {
    if (index === allocations.length - 1) {
      return { id: allocation.id, amount: roundMoney(parsedNetAmount - running), matchedLineItems: [] };
    }
    const amount = roundMoney((Number(allocation.amount ?? 0) / currentTotal) * parsedNetAmount);
    running += amount;
    return { id: allocation.id, amount, matchedLineItems: [] };
  });
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
    purchaseOrderGroupId: body.purchaseOrderGroupId as string | null | undefined,
    lineType,
    poNumber: body.poNumber as string | null | undefined,
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
    freeAgentTransactionId: body.freeAgentTransactionId as string | null | undefined,
    datePaid: dateOrNull(body.datePaid) ?? lifecycle.datePaid,
  };
}

async function generatePoNumber(lineItemId: string): Promise<string> {
  const lineItem = await prisma.budgetLineItem.findUnique({
    where: { id: lineItemId },
    include: {
      section: {
        include: {
          revision: {
            include: {
              budget: {
                include: { production: true },
              },
            },
          },
        },
      },
    },
  });
  const production = lineItem?.section.revision.budget.production;
  const jobCode = production?.jobCode ?? "OPP";
  const existingPOCount = await prisma.subCost.count({
    where: {
      lineType: SubCostLineType.PO,
      lineItem: {
        section: {
          revision: {
            budget: production
              ? { productionId: production.id }
              : { id: lineItem?.section.revision.budgetId },
          },
        },
      },
    },
  });
  return `PO-${jobCode}-${String(existingPOCount + 1).padStart(3, "0")}`;
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

async function editableRevisionId(revisionId: string, changeSummary: string): Promise<string> {
  const revision = await prisma.budgetRevision.findUniqueOrThrow({ where: { id: revisionId } });
  if (!isRevisionImmutable(revision)) return revision.id;
  return (await cloneRevisionForEdit(revision.id, changeSummary)).revisionId;
}

async function editableSectionId(sectionId: string, changeSummary: string): Promise<string> {
  const section = await prisma.budgetSection.findUniqueOrThrow({
    where: { id: sectionId },
    include: { revision: true },
  });
  if (!isRevisionImmutable(section.revision)) return section.id;
  return (await cloneRevisionForEdit(section.revisionId, changeSummary)).sectionMap.get(section.id) ?? section.id;
}

async function editableLineItemId(lineItemId: string, changeSummary: string): Promise<string> {
  const line = await prisma.budgetLineItem.findUniqueOrThrow({
    where: { id: lineItemId },
    include: { section: { include: { revision: true } } },
  });
  if (!isRevisionImmutable(line.section.revision)) return line.id;
  return (await cloneRevisionForEdit(line.section.revisionId, changeSummary)).lineMap.get(line.id) ?? line.id;
}

async function editableSubCostId(subCostId: string, changeSummary: string): Promise<{ subCostId: string; lineItemId: string }> {
  const subCost = await prisma.subCost.findUniqueOrThrow({
    where: { id: subCostId },
    include: { lineItem: { include: { section: { include: { revision: true } } } } },
  });
  if (!isRevisionImmutable(subCost.lineItem.section.revision)) return { subCostId: subCost.id, lineItemId: subCost.lineItemId };
  const clone = await cloneRevisionForEdit(subCost.lineItem.section.revisionId, changeSummary);
  return {
    subCostId: clone.subCostMap.get(subCost.id) ?? subCost.id,
    lineItemId: clone.lineMap.get(subCost.lineItemId) ?? subCost.lineItemId,
  };
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
  const existing = await prisma.budgetRevision.findUniqueOrThrow({ where: { id: req.params.revisionId } });
  const changesContent = body.label !== undefined || body.notes !== undefined || body.productionFeePercent !== undefined || body.insurancePercent !== undefined;
  const revisionId = changesContent && isRevisionImmutable(existing)
    ? await editableRevisionId(existing.id, "Revision settings changed")
    : existing.id;
  const status = body.status as RevisionStatus | undefined;
  const revision = await prisma.budgetRevision.update({
    where: { id: revisionId },
    data: {
      label: body.label as string | undefined,
      status,
      isLocked: status === RevisionStatus.SENT || status === RevisionStatus.APPROVED || status === RevisionStatus.SUPERSEDED ? true : undefined,
      lockedAt: status === RevisionStatus.SENT || status === RevisionStatus.APPROVED || status === RevisionStatus.SUPERSEDED ? new Date() : undefined,
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
  const revisionId = await editableRevisionId(req.params.revisionId, "Template applied");
  const revision = await applyTemplate(revisionId, body.templateId);
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
  const revisionId = await editableRevisionId(req.params.revisionId, "Section added");
  res.status(201).json(await createSection(revisionId, { code: body.code, name: body.name, order: body.order, isVisible: body.isVisible }));
});

router.patch("/sections/:sectionId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const sectionId = await editableSectionId(req.params.sectionId, "Section changed");
  const section = await prisma.budgetSection.update({
    where: { id: sectionId },
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
  const sectionId = await editableSectionId(req.params.sectionId, "Section deleted");
  await prisma.budgetSection.delete({ where: { id: sectionId } });
  res.status(204).end();
});

router.patch("/sections/:sectionId/reorder", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { order?: number };
  const sectionId = await editableSectionId(req.params.sectionId, "Section reordered");
  const section = await prisma.budgetSection.update({ where: { id: sectionId }, data: { order: body.order ?? 0 } });
  res.json(section);
});

// Line items
router.post("/sections/:sectionId/lines", async (req: Request, res: Response): Promise<void> => {
  const sectionId = await editableSectionId(req.params.sectionId, "Line item added");
  const line = await createLineItem(sectionId, req.body as Partial<Prisma.BudgetLineItemUncheckedCreateInput>);
  res.status(201).json({ line, revision: await lineRevision(line.id) });
});

router.patch("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Line item changed");
  const line = await updateLineItem(lineItemId, linePatchFromBody(req.body as Record<string, unknown>));
  res.json({ line, revision: await lineRevision(line.id) });
});

router.delete("/lines/:lineItemId", async (req: Request, res: Response): Promise<void> => {
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Line item deleted");
  const line = await prisma.budgetLineItem.findUnique({ where: { id: lineItemId }, select: { section: { select: { revisionId: true } } } });
  await prisma.budgetLineItem.delete({ where: { id: lineItemId } });
  res.status(204).json(line ? await getRevision(line.section.revisionId) : null);
});

router.post("/lines/:lineItemId/duplicate", async (req: Request, res: Response): Promise<void> => {
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Line item duplicated");
  const line = await duplicateLineItem(lineItemId);
  res.status(201).json({ line, revision: await lineRevision(line.id) });
});

router.patch("/lines/:lineItemId/reorder", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { order?: number };
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Line item reordered");
  const line = await prisma.budgetLineItem.update({ where: { id: lineItemId }, data: { order: body.order ?? 0 } });
  res.json({ line, revision: await lineRevision(line.id) });
});

router.post("/lines/:lineItemId/sub-item", async (req: Request, res: Response): Promise<void> => {
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Sub-item added");
  const parent = await prisma.budgetLineItem.findUnique({ where: { id: lineItemId } });
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
  const lineItemId = await editableLineItemId(req.params.lineItemId, "Cost line added");
  const body = req.body as Record<string, unknown>;
  const lineType = normalizeLineType(body.lineType);
  const lifecycle = lineTypeLifecycle(lineType);
  const purchaseOrderGroupId = body.purchaseOrderGroupId as string | null | undefined;
  const purchaseOrder = purchaseOrderGroupId ? await prisma.purchaseOrderGroup.findUnique({ where: { id: purchaseOrderGroupId } }) : null;
  const poNumber = purchaseOrder?.poNumber ?? (lineType === SubCostLineType.PO ? await generatePoNumber(lineItemId) : null);
  const subCost = await prisma.subCost.create({
    data: {
      lineItemId,
      purchaseOrderGroupId,
      lineType,
      poNumber,
      description: body.description as string || `${lineType === SubCostLineType.PO ? "PO" : lineType === SubCostLineType.BILL ? "Bill" : "Receipt"} cost line`,
      supplierName: (body.supplierName as string | null | undefined) ?? purchaseOrder?.supplierName,
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
  await recalculateAfterSubCost(lineItemId);
  await syncPurchaseOrderStatus(purchaseOrderGroupId);
  res.status(201).json({ subCost, revision: await lineRevision(lineItemId) });
});

router.patch("/subcosts/:subCostId", async (req: Request, res: Response): Promise<void> => {
  const editable = await editableSubCostId(req.params.subCostId, "Cost line changed");
  const existing = await prisma.subCost.findUnique({ where: { id: editable.subCostId } });
  if (!existing) { res.status(404).json({ error: "Sub-cost not found" }); return; }
  const subCost = await prisma.subCost.update({ where: { id: existing.id }, data: subCostPatch(req.body as Record<string, unknown>) });
  await recalculateAfterSubCost(existing.lineItemId);
  await syncPurchaseOrderStatus(subCost.purchaseOrderGroupId ?? existing.purchaseOrderGroupId);
  res.json({ subCost, revision: await lineRevision(existing.lineItemId) });
});

router.delete("/subcosts/:subCostId", async (req: Request, res: Response): Promise<void> => {
  const editable = await editableSubCostId(req.params.subCostId, "Cost line deleted");
  const existing = await prisma.subCost.findUnique({ where: { id: editable.subCostId } });
  if (!existing) { res.status(404).json({ error: "Sub-cost not found" }); return; }
  await prisma.subCost.delete({ where: { id: existing.id } });
  await recalculateAfterSubCost(existing.lineItemId);
  await syncPurchaseOrderStatus(existing.purchaseOrderGroupId);
  res.json({ revision: await lineRevision(existing.lineItemId) });
});

router.patch("/subcosts/:subCostId/status", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { status?: SubCostStatus };
  if (!body.status || !Object.values(SubCostStatus).includes(body.status)) {
    res.status(400).json({ error: "valid status is required" });
    return;
  }
  const editable = await editableSubCostId(req.params.subCostId, "Cost line status changed");
  const existing = await prisma.subCost.findUnique({ where: { id: editable.subCostId } });
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
  await syncPurchaseOrderStatus(existing.purchaseOrderGroupId);
  res.json({ subCost, revision: await lineRevision(existing.lineItemId) });
});

// Purchase orders
router.get("/production/:productionId/purchase-orders", async (req: Request, res: Response): Promise<void> => {
  res.json(await purchaseOrdersForProduction(req.params.productionId));
});

router.get("/production/:productionId/purchase-order-context", async (req: Request, res: Response): Promise<void> => {
  const budget = await prisma.budget.findUnique({
    where: { productionId: req.params.productionId },
    include: {
      currentRevision: {
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: {
              lineItems: {
                where: { parentId: null },
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  lineCode: true,
                  description: true,
                  estimatedTotal: true,
                  actualTotal: true,
                  variance: true,
                  section: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const optionCandidates = await prisma.optionCandidate.findMany({
    where: { productionId: req.params.productionId, activeState: { not: "RELEASED" } },
    orderBy: [{ group: { order: "asc" } }, { order: "asc" }],
    select: {
      id: true,
      name: true,
      contactEmail: true,
      contactPhone: true,
      blackbookEntryId: true,
      blackbookEntry: { select: { id: true, displayName: true, email: true, phone: true } },
      group: { select: { id: true, name: true, type: true } },
    },
  });
  const lines = budget?.currentRevision?.sections.flatMap((section) => section.lineItems) ?? [];
  res.json({ budgetId: budget?.id ?? null, lines, optionCandidates });
});

router.post("/production/:productionId/purchase-orders", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    supplierName?: string;
    supplierEmail?: string | null;
    supplierPhone?: string | null;
    blackbookEntryId?: string | null;
    optionCandidateId?: string | null;
    createBlackbook?: boolean;
    notes?: string | null;
    allocations?: Array<{ lineItemId?: string; amount?: number | string | null; description?: string | null }>;
  };
  const allocations = (body.allocations ?? [])
    .map((allocation) => ({
      lineItemId: allocation.lineItemId,
      amount: Number(allocation.amount ?? 0),
      description: allocation.description?.trim() || null,
    }))
    .filter((allocation): allocation is { lineItemId: string; amount: number; description: string | null } => Boolean(allocation.lineItemId) && Number.isFinite(allocation.amount) && allocation.amount > 0);

  if (!allocations.length) {
    res.status(400).json({ error: "At least one allocation is required" });
    return;
  }

  const production = await prisma.production.findUnique({ where: { id: req.params.productionId } });
  if (!production) {
    res.status(404).json({ error: "Production not found" });
    return;
  }

  const lineItems = await prisma.budgetLineItem.findMany({
    where: { id: { in: allocations.map((allocation) => allocation.lineItemId) } },
    include: { section: { include: { revision: { include: { budget: true } } } } },
  });
  if (lineItems.length !== allocations.length || lineItems.some((line) => line.section.revision.budget.productionId !== production.id)) {
    res.status(400).json({ error: "All allocations must belong to this production budget" });
    return;
  }

  const candidate = body.optionCandidateId
    ? await prisma.optionCandidate.findUnique({ where: { id: body.optionCandidateId }, include: { blackbookEntry: true } })
    : null;
  const supplierName = body.supplierName?.trim() || candidate?.blackbookEntry?.displayName || candidate?.name;
  if (!supplierName) {
    res.status(400).json({ error: "Supplier name is required" });
    return;
  }

  const budgetId = lineItems[0]?.section.revision.budgetId ?? null;
  const created = await prisma.$transaction(async (tx) => {
    let blackbookEntryId = body.blackbookEntryId ?? candidate?.blackbookEntryId ?? null;
    if (!blackbookEntryId && body.createBlackbook) {
      const entry = await tx.blackbookEntry.create({
        data: {
          entryType: BlackbookEntryType.COMPANY,
          category: BlackbookCategory.SERVICE,
          lifecycleStatus: BlackbookLifecycleStatus.SUPPLIER,
          displayName: supplierName,
          companyName: supplierName,
          email: body.supplierEmail?.trim() || candidate?.contactEmail || null,
          phone: body.supplierPhone?.trim() || candidate?.contactPhone || null,
        },
      });
      blackbookEntryId = entry.id;
    }

    const updatedProduction = await tx.production.update({
      where: { id: production.id },
      data: { lastPoSequence: { increment: 1 } },
      select: { lastPoSequence: true, jobCode: true },
    });
    const existingPOCount = await tx.subCost.count({
      where: {
        lineType: SubCostLineType.PO,
        lineItem: { section: { revision: { budget: { productionId: production.id } } } },
      },
    });
    const sequence = Math.max(updatedProduction.lastPoSequence, existingPOCount + 1);
    if (sequence !== updatedProduction.lastPoSequence) {
      await tx.production.update({ where: { id: production.id }, data: { lastPoSequence: sequence } });
    }
    const poNumber = `PO-${updatedProduction.jobCode ?? "OPP"}-${String(sequence).padStart(3, "0")}`;
    const po = await tx.purchaseOrderGroup.create({
      data: {
        productionId: production.id,
        budgetId,
        poNumber,
        supplierName,
        supplierEmail: body.supplierEmail?.trim() || candidate?.contactEmail || candidate?.blackbookEntry?.email || null,
        supplierPhone: body.supplierPhone?.trim() || candidate?.contactPhone || candidate?.blackbookEntry?.phone || null,
        blackbookEntryId,
        optionCandidateId: candidate?.id ?? null,
        notes: body.notes ?? null,
      },
    });

    for (const allocation of allocations) {
      const lineItem = lineItems.find((line) => line.id === allocation.lineItemId);
      await tx.subCost.create({
        data: {
          lineItemId: allocation.lineItemId,
          purchaseOrderGroupId: po.id,
          lineType: SubCostLineType.PO,
          poNumber,
          description: allocation.description || `${supplierName} PO allocation`,
          supplierName,
          amount: allocation.amount,
          currency: "GBP",
          status: SubCostStatus.PENDING,
          isAgreed: false,
          isInvoiced: false,
          isPaid: false,
        },
      });
      if (lineItem) {
        const subCosts = await tx.subCost.findMany({ where: { lineItemId: lineItem.id } });
        const actualTotal = subCosts.reduce((sum, subCost) => sum + Number(subCost.amount ?? 0), 0);
        await tx.budgetLineItem.update({
          where: { id: lineItem.id },
          data: {
            actualTotal,
            variance: Number(lineItem.estimatedTotal ?? 0) - actualTotal,
          },
        });
      }
    }
    return po;
  });

  for (const allocation of allocations) {
    await recalculateAfterSubCost(allocation.lineItemId);
  }
  res.status(201).json(decoratePurchaseOrder(await prisma.purchaseOrderGroup.findUniqueOrThrow({ where: { id: created.id }, include: purchaseOrderInclude })));
});

router.patch("/purchase-orders/:purchaseOrderId", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    status?: PurchaseOrderStatus;
    supplierName?: string;
    supplierEmail?: string | null;
    supplierPhone?: string | null;
    notes?: string | null;
  };
  const status = body.status && Object.values(PurchaseOrderStatus).includes(body.status) ? body.status : undefined;
  const updated = await prisma.purchaseOrderGroup.update({
    where: { id: req.params.purchaseOrderId },
    data: {
      status,
      supplierName: body.supplierName,
      supplierEmail: body.supplierEmail,
      supplierPhone: body.supplierPhone,
      notes: body.notes,
      sentAt: status === PurchaseOrderStatus.SENT ? new Date() : undefined,
      acceptedAt: status === PurchaseOrderStatus.ACCEPTED ? new Date() : undefined,
      cancelledAt: status === PurchaseOrderStatus.CANCELLED ? new Date() : undefined,
    },
    include: purchaseOrderInclude,
  });
  res.json(decoratePurchaseOrder(updated));
});

router.post("/purchase-orders/:purchaseOrderId/parse-bill", async (req: Request, res: Response): Promise<void> => {
  invoiceUpload.single("invoiceFile")(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Maximum invoice file size is 25MB" });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invoice upload failed" });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Invoice file is required" });
        return;
      }

      const detectedMimeType = mime.lookup(file.originalname) || file.mimetype || "application/octet-stream";
      const mimeType = billParseMimeTypes.has(detectedMimeType) ? detectedMimeType : file.mimetype;
      if (!billParseMimeTypes.has(mimeType)) {
        res.status(400).json({ error: "Invoice must be a PDF or image" });
        return;
      }

      const po = await prisma.purchaseOrderGroup.findUnique({
        where: { id: req.params.purchaseOrderId },
        include: {
          allocations: {
            include: {
              lineItem: {
                select: {
                  lineCode: true,
                  description: true,
                  clientNotes: true,
                  internalNotes: true,
                  section: { select: { name: true } },
                },
              },
            },
          },
        },
      });
      if (!po) {
        res.status(404).json({ error: "PO not found" });
        return;
      }

      const parsed = await parseReceiptImage(file.buffer, mimeType);
      const parsedNetAmount = parsed.amountNet ? parsed.amountNet / 100 : null;
      const parsedGrossAmount = parsed.amountGross ? parsed.amountGross / 100 : null;
      const suggestedAmount = parsedNetAmount ?? parsedGrossAmount;
      const suggestedAllocations = suggestBillAllocations(
        po.allocations.map((allocation) => ({
          id: allocation.id,
          amount: Number(allocation.amount ?? 0),
          label: [
            allocation.description,
            allocation.lineItem.lineCode,
            allocation.lineItem.description,
            allocation.lineItem.clientNotes,
            allocation.lineItem.internalNotes,
            allocation.lineItem.section.name,
          ].filter(Boolean).join(" "),
        })),
        suggestedAmount,
        parsed.lineItems
      );

      res.json({
        supplierName: parsed.vendor,
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.date,
        amountNet: parsedNetAmount,
        amountGross: parsedGrossAmount,
        vatAmount: parsed.vatAmount ? parsed.vatAmount / 100 : null,
        vatRate: parsed.vatRate,
        currency: parsed.currency,
        description: parsed.description,
        confidence: parsed.confidence,
        rawText: parsed.rawText,
        lineItems: parsed.lineItems.map((lineItem) => ({
          description: lineItem.description,
          amountNet: lineItem.amountNet ? lineItem.amountNet / 100 : null,
          amountGross: lineItem.amountGross ? lineItem.amountGross / 100 : null,
          vatAmount: lineItem.vatAmount ? lineItem.vatAmount / 100 : null,
        })),
        allocations: suggestedAllocations,
      });
    } catch (caught) {
      res.status(400).json({ error: caught instanceof Error ? caught.message : "Failed to parse invoice" });
    }
  });
});

router.post("/purchase-orders/:purchaseOrderId/convert-to-bill", async (req: Request, res: Response): Promise<void> => {
  invoiceUpload.single("invoiceFile")(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Maximum invoice file size is 25MB" });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invoice upload failed" });
        return;
      }

      const po = await prisma.purchaseOrderGroup.findUnique({
        where: { id: req.params.purchaseOrderId },
        include: { allocations: true, production: true },
      });
      if (!po) {
        res.status(404).json({ error: "PO not found" });
        return;
      }
      if (po.status === PurchaseOrderStatus.CANCELLED) {
        res.status(400).json({ error: "Cancelled POs cannot be converted to bills" });
        return;
      }
      if (!po.allocations.length) {
        res.status(400).json({ error: "PO has no budget allocations" });
        return;
      }

      const allocationOverrides = parseBillAllocationOverrides(req.body.allocations);
      const allocationIds = allocationOverrides.length ? allocationOverrides.map((allocation) => allocation.id) : po.allocations.map((allocation) => allocation.id);
      const targetAllocations = po.allocations.filter((allocation) => allocationIds.includes(allocation.id));
      if (!targetAllocations.length) {
        res.status(400).json({ error: "No matching PO allocations selected" });
        return;
      }

      const file = req.file;
      const jobFile = file
        ? await autoFileDocument(po.productionId, "Receipts", file.buffer, file.originalname, file.mimetype, {
            notes: `Invoice for ${po.poNumber}`,
            linkedBudgetLineId: targetAllocations[0]?.lineItemId,
            receiptVendor: po.supplierName,
            receiptAmount: Math.round(targetAllocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0) * 100),
          })
        : null;

      const invoiceNumber = typeof req.body.invoiceNumber === "string" && req.body.invoiceNumber.trim()
        ? req.body.invoiceNumber.trim()
        : null;
      const invoiceDate = dateOrNull(req.body.invoiceDate) ?? null;

      await prisma.$transaction(async (tx) => {
        for (const allocation of targetAllocations) {
          const override = allocationOverrides.find((item) => item.id === allocation.id);
          await tx.subCost.update({
            where: { id: allocation.id },
            data: {
              lineType: SubCostLineType.BILL,
              status: SubCostStatus.INVOICED,
              isInvoiced: true,
              isPaid: false,
              invoiceNumber,
              invoiceDate,
              invoiceFileId: jobFile?.id ?? allocation.invoiceFileId,
              amount: override?.amount,
            },
          });
        }
      });

      for (const allocation of targetAllocations) {
        await recalculateAfterSubCost(allocation.lineItemId);
      }
      await syncPurchaseOrderStatus(po.id);

      const updated = await prisma.purchaseOrderGroup.findUniqueOrThrow({
        where: { id: po.id },
        include: purchaseOrderInclude,
      });
      res.json(decoratePurchaseOrder(updated));
    } catch (caught) {
      res.status(400).json({ error: caught instanceof Error ? caught.message : "Failed to convert PO to bill" });
    }
  });
});

router.delete("/purchase-orders/:purchaseOrderId", async (req: Request, res: Response): Promise<void> => {
  const po = await prisma.purchaseOrderGroup.findUnique({
    where: { id: req.params.purchaseOrderId },
    include: { allocations: true },
  });
  if (!po) {
    res.status(404).json({ error: "PO not found" });
    return;
  }
  const lineItemIds = po.allocations.map((allocation) => allocation.lineItemId);
  await prisma.$transaction(async (tx) => {
    await tx.subCost.deleteMany({ where: { purchaseOrderGroupId: po.id } });
    await tx.purchaseOrderGroup.delete({ where: { id: po.id } });
  });
  for (const lineItemId of lineItemIds) {
    await recalculateAfterSubCost(lineItemId);
  }
  res.json({ deleted: true });
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
