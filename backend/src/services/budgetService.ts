import { AdvanceCalcType, Prisma, RevisionStatus } from "@prisma/client";
import prisma from "../prisma";

export const revisionInclude = {
  budget: {
    include: {
      production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true, value: true } },
      opportunity: { select: { id: true, title: true, clientName: true, brand: true, value: true } },
      advanceInvoices: { orderBy: { createdAt: "asc" as const } },
    },
  },
  sections: {
    orderBy: { order: "asc" as const },
    include: {
      lineItems: {
        orderBy: { order: "asc" as const },
        include: {
          subCosts: { orderBy: { createdAt: "asc" as const } },
          children: { orderBy: { order: "asc" as const }, include: { subCosts: true } },
        },
      },
    },
  },
} satisfies Prisma.BudgetRevisionInclude;

export type FullRevision = Prisma.BudgetRevisionGetPayload<{ include: typeof revisionInclude }>;
type FullSection = FullRevision["sections"][number];
type FullLineItem = FullSection["lineItems"][number];
type RevisionEditClone = {
  revisionId: string;
  sectionMap: Map<string, string>;
  lineMap: Map<string, string>;
  subCostMap: Map<string, string>;
};
type FullBudget = Prisma.BudgetGetPayload<{
  include: {
    currentRevision: { include: typeof revisionInclude };
    revisions: true;
    advanceInvoices: true;
    production: true;
    opportunity: true;
  };
}>;

export interface SectionTemplateSection {
  code: string;
  name: string;
  order: number;
  defaultLineItems: string[];
}

export interface SectionTotals {
  sectionId: string;
  code: string;
  name: string;
  estimatedTotal: number;
  actualTotal: number;
  variance: number;
  remainingBudget: number;
  agreedCount: number;
  invoicedCount: number;
  paidCount: number;
  closedCount: number;
}

export interface RevisionTotals {
  subtotal: number;
  productionFee: number;
  insurance: number;
  grandTotal: number;
  totalActuals: number;
  totalVariance: number;
  totalRemaining: number;
  currencyConverted: number | null;
  sectionTotals: SectionTotals[];
  advances: Array<{ id: string; calculatedAmount: number }>;
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function calculateLineItem(item: {
  qty?: number | null;
  days?: number | null;
  rate?: number | null;
  agencyFeePercent?: number | null;
}): number {
  const base = (item.qty ?? 1) * (item.days ?? 1) * (item.rate ?? 0);
  const agencyMultiplier = 1 + ((item.agencyFeePercent ?? 0) / 100);
  return roundMoney(base * agencyMultiplier);
}

export function calculateLineItemActual(lineItem: { subCosts: Array<{ amount: number }> }): number {
  return roundMoney(lineItem.subCosts.reduce((sum, subCost) => sum + Number(subCost.amount ?? 0), 0));
}

export function calculateSectionTotals(section: FullSection): SectionTotals {
  const lineItems = section.lineItems.filter((line) => !line.isSubItem);
  const estimatedTotal = roundMoney(lineItems.reduce((sum, line) => sum + Number(line.estimatedTotal ?? 0), 0));
  const actualTotal = roundMoney(lineItems.reduce((sum, line) => sum + Number(line.actualTotal ?? 0), 0));
  const variance = roundMoney(estimatedTotal - actualTotal);
  return {
    sectionId: section.id,
    code: section.code,
    name: section.name,
    estimatedTotal,
    actualTotal,
    variance,
    remainingBudget: variance,
    agreedCount: lineItems.filter((line) => line.subCosts.some((subCost) => subCost.isAgreed)).length,
    invoicedCount: lineItems.filter((line) => line.subCosts.some((subCost) => subCost.isInvoiced)).length,
    paidCount: lineItems.filter((line) => line.subCosts.length > 0 && line.subCosts.every((subCost) => subCost.isPaid)).length,
    closedCount: lineItems.filter((line) => line.isClosed).length,
  };
}

function calculateAdvanceAmount(advance: { calculationType: AdvanceCalcType; percent: number | null; amount: number | null }, grandTotal: number, subtotal: number): number {
  if (advance.calculationType === AdvanceCalcType.FIXED_AMOUNT) return roundMoney(advance.amount ?? 0);
  const base = advance.calculationType === AdvanceCalcType.PERCENT_OF_PRODUCTION ? subtotal : grandTotal;
  return roundMoney(base * ((advance.percent ?? 0) / 100));
}

export function calculateRevisionTotalsFromRevision(revision: FullRevision): RevisionTotals {
  const visibleSections = revision.sections.filter((section) => section.isVisible);
  const sectionTotals = visibleSections.map(calculateSectionTotals);
  const subtotal = roundMoney(sectionTotals.reduce((sum, section) => sum + section.estimatedTotal, 0));
  const productionFee = roundMoney(subtotal * (revision.productionFeePercent / 100));
  const insurance = roundMoney((subtotal + productionFee) * (revision.insurancePercent / 100));
  const grandTotal = roundMoney(subtotal + productionFee + insurance);
  const totalActuals = roundMoney(sectionTotals.reduce((sum, section) => sum + section.actualTotal, 0));
  const totalVariance = roundMoney(grandTotal - totalActuals);
  const rate = revision.budget.currencyRate ?? null;
  const advances = revision.budget.advanceInvoices.map((advance) => ({
    id: advance.id,
    calculatedAmount: calculateAdvanceAmount(advance, grandTotal, subtotal),
  }));

  return {
    subtotal,
    productionFee,
    insurance,
    grandTotal,
    totalActuals,
    totalVariance,
    totalRemaining: totalVariance,
    currencyConverted: rate ? roundMoney(grandTotal * rate) : null,
    sectionTotals,
    advances,
  };
}

export async function calculateRevisionTotals(revisionId: string): Promise<RevisionTotals> {
  const revision = await getRevision(revisionId);
  if (!revision) throw new Error("Revision not found");
  return revision.totals;
}

async function updateAdvanceCalculations(budgetId: string, totals: RevisionTotals): Promise<void> {
  await Promise.all(totals.advances.map((advance) => prisma.advanceInvoice.update({
    where: { id: advance.id },
    data: { calculatedAmount: advance.calculatedAmount },
  })));
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, select: { productionId: true } });
  if (budget?.productionId) await syncProductionTotals(budget.productionId);
}

export async function getRevision(revisionId: string) {
  const revision = await prisma.budgetRevision.findUnique({ where: { id: revisionId }, include: revisionInclude });
  if (!revision) return null;
  const totals = calculateRevisionTotalsFromRevision(revision);
  return { ...revision, totals };
}

async function budgetWithCurrent(id: string): Promise<FullBudget> {
  return prisma.budget.findUniqueOrThrow({
    where: { id },
    include: {
      currentRevision: { include: revisionInclude },
      revisions: { orderBy: { revisionNumber: "asc" } },
      advanceInvoices: { orderBy: { createdAt: "asc" } },
      production: true,
      opportunity: true,
    },
  });
}

async function decorateBudget(budget: FullBudget) {
  const currentRevision = budget.currentRevision ? await getRevision(budget.currentRevision.id) : null;
  const totals = currentRevision?.totals ?? null;
  return { ...budget, currentRevision, totals };
}

export async function getOrCreateBudget({ productionId, opportunityId }: { productionId?: string; opportunityId?: string }) {
  if (Boolean(productionId) === Boolean(opportunityId)) throw new Error("Budget must be linked to exactly one production or opportunity");

  const existing = await prisma.budget.findFirst({ where: productionId ? { productionId } : { opportunityId } });
  if (existing) return decorateBudget(await budgetWithCurrent(existing.id));

  const [production, opportunity] = await Promise.all([
    productionId ? prisma.production.findUnique({ where: { id: productionId } }) : null,
    opportunityId ? prisma.opportunity.findUnique({ where: { id: opportunityId } }) : null,
  ]);

  const budget = await prisma.$transaction(async (tx) => {
    const createdBudget = await tx.budget.create({
      data: {
        productionId,
        opportunityId,
        jobName: production?.title ?? opportunity?.title ?? null,
        shootDates: null,
        status: productionId ? "IN_PRODUCTION" : "DRAFT",
      },
    });
    const revision = await tx.budgetRevision.create({
      data: {
        budgetId: createdBudget.id,
        revisionNumber: 1,
        label: "Original",
        productionFeePercent: createdBudget.productionFeePercent,
        insurancePercent: createdBudget.insurancePercent,
      },
    });
    await tx.budget.update({ where: { id: createdBudget.id }, data: { currentRevisionId: revision.id } });
    return createdBudget;
  });

  return decorateBudget(await budgetWithCurrent(budget.id));
}

export async function createRevision(budgetId: string) {
  const budget = await budgetWithCurrent(budgetId);
  const source = budget.currentRevision;
  const nextNumber = Math.max(0, ...budget.revisions.map((revision) => revision.revisionNumber)) + 1;
  const nextMajor = Math.max(0, ...budget.revisions.map((revision) => revision.majorVersion ?? revision.revisionNumber)) + 1;

  const created = await prisma.$transaction(async (tx) => {
    if (source) {
      await tx.budgetRevision.update({ where: { id: source.id }, data: { isLocked: true, lockedAt: new Date() } });
    }
    const revision = await tx.budgetRevision.create({
      data: {
        budgetId,
        revisionNumber: nextNumber,
        majorVersion: nextMajor,
        minorVersion: 0,
        label: `V${nextMajor}`,
        productionFeePercent: source?.productionFeePercent ?? budget.productionFeePercent,
        insurancePercent: source?.insurancePercent ?? budget.insurancePercent,
        notes: source?.notes,
      },
    });

    if (source) {
      for (const section of source.sections) {
        const copiedSection = await tx.budgetSection.create({
          data: {
            revisionId: revision.id,
            code: section.code,
            name: section.name,
            order: section.order,
            isVisible: section.isVisible,
          },
        });
        const parentMap = new Map<string, string>();
        for (const line of section.lineItems.filter((item) => !item.parentId)) {
          const copied = await tx.budgetLineItem.create({
            data: copyLineData(line, copiedSection.id, line.order, null),
          });
          parentMap.set(line.id, copied.id);
        }
        for (const line of section.lineItems.filter((item) => item.parentId)) {
          await tx.budgetLineItem.create({
            data: copyLineData(line, copiedSection.id, line.order, parentMap.get(line.parentId ?? "") ?? null),
          });
        }
      }
    }

    await tx.budget.update({ where: { id: budgetId }, data: { currentRevisionId: revision.id, version: { increment: 1 } } });
    return revision;
  });

  return getRevision(created.id);
}

export function revisionVersionLabel(revision: { majorVersion?: number | null; minorVersion?: number | null; revisionNumber: number; label?: string | null }): string {
  const major = revision.majorVersion ?? revision.revisionNumber;
  const minor = revision.minorVersion ?? 0;
  return `V${major}${minor > 0 ? `.${minor}` : ""}`;
}

export function isRevisionImmutable(revision: { status: RevisionStatus; isLocked?: boolean | null }): boolean {
  return Boolean(revision.isLocked) || revision.status === RevisionStatus.SENT || revision.status === RevisionStatus.APPROVED || revision.status === RevisionStatus.SUPERSEDED;
}

function copySubCostData(subCost: FullLineItem["subCosts"][number], lineItemId: string): Prisma.SubCostUncheckedCreateInput {
  return {
    lineItemId,
    purchaseOrderGroupId: subCost.purchaseOrderGroupId,
    lineType: subCost.lineType,
    poNumber: subCost.poNumber,
    description: subCost.description,
    supplierName: subCost.supplierName,
    amount: subCost.amount,
    amountGross: subCost.amountGross,
    vatAmount: subCost.vatAmount,
    vatRate: subCost.vatRate,
    currency: subCost.currency,
    status: subCost.status,
    invoiceNumber: subCost.invoiceNumber,
    invoiceDate: subCost.invoiceDate,
    datePaid: subCost.datePaid,
    invoiceFileId: subCost.invoiceFileId,
    proofOfPayment: subCost.proofOfPayment,
    receiptCaptureId: subCost.receiptCaptureId,
    isAgreed: subCost.isAgreed,
    isInvoiced: subCost.isInvoiced,
    isPaid: subCost.isPaid,
    freeAgentTransactionId: subCost.freeAgentTransactionId,
  };
}

export async function cloneRevisionForEdit(revisionId: string, changeSummary = "Working edit"): Promise<RevisionEditClone> {
  const source = await prisma.budgetRevision.findUniqueOrThrow({ where: { id: revisionId }, include: revisionInclude });
  if (!isRevisionImmutable(source)) {
    return {
      revisionId: source.id,
      sectionMap: new Map(source.sections.map((section) => [section.id, section.id])),
      lineMap: new Map(source.sections.flatMap((section) => section.lineItems.map((line) => [line.id, line.id] as const))),
      subCostMap: new Map(source.sections.flatMap((section) => section.lineItems.flatMap((line) => line.subCosts.map((subCost) => [subCost.id, subCost.id] as const)))),
    };
  }

  const maxRevision = await prisma.budgetRevision.aggregate({ where: { budgetId: source.budgetId }, _max: { revisionNumber: true } });
  const majorVersion = source.majorVersion ?? source.revisionNumber;
  const maxMinor = await prisma.budgetRevision.aggregate({ where: { budgetId: source.budgetId, majorVersion }, _max: { minorVersion: true } });
  const nextMinor = (maxMinor._max.minorVersion ?? 0) + 1;
  const sectionMap = new Map<string, string>();
  const lineMap = new Map<string, string>();
  const subCostMap = new Map<string, string>();

  const created = await prisma.$transaction(async (tx) => {
    const revision = await tx.budgetRevision.create({
      data: {
        budgetId: source.budgetId,
        revisionNumber: (maxRevision._max.revisionNumber ?? 0) + 1,
        majorVersion,
        minorVersion: nextMinor,
        label: `V${majorVersion}.${nextMinor}`,
        status: RevisionStatus.DRAFT,
        productionFeePercent: source.productionFeePercent,
        insurancePercent: source.insurancePercent,
        notes: source.notes,
        sourceRevisionId: source.id,
        changeSummary,
      },
    });

    for (const section of source.sections) {
      const copiedSection = await tx.budgetSection.create({
        data: {
          revisionId: revision.id,
          code: section.code,
          name: section.name,
          order: section.order,
          isVisible: section.isVisible,
        },
      });
      sectionMap.set(section.id, copiedSection.id);

      for (const line of section.lineItems.filter((item) => !item.parentId)) {
        const copied = await tx.budgetLineItem.create({
          data: copyLineData(line, copiedSection.id, line.order, null),
        });
        lineMap.set(line.id, copied.id);
        for (const subCost of line.subCosts) {
          const copiedSubCost = await tx.subCost.create({ data: copySubCostData(subCost, copied.id) });
          subCostMap.set(subCost.id, copiedSubCost.id);
        }
        await tx.budgetLineItem.update({ where: { id: copied.id }, data: { actualTotal: line.actualTotal, variance: line.variance } });
      }

      for (const line of section.lineItems.filter((item) => item.parentId)) {
        const parentId = lineMap.get(line.parentId ?? "") ?? null;
        const copied = await tx.budgetLineItem.create({
          data: copyLineData(line, copiedSection.id, line.order, parentId),
        });
        lineMap.set(line.id, copied.id);
        for (const subCost of line.subCosts) {
          const copiedSubCost = await tx.subCost.create({ data: copySubCostData(subCost, copied.id) });
          subCostMap.set(subCost.id, copiedSubCost.id);
        }
        await tx.budgetLineItem.update({ where: { id: copied.id }, data: { actualTotal: line.actualTotal, variance: line.variance } });
      }
    }

    await tx.budget.update({ where: { id: source.budgetId }, data: { currentRevisionId: revision.id } });
    return revision;
  });

  return { revisionId: created.id, sectionMap, lineMap, subCostMap };
}

function copyLineData(line: FullLineItem, sectionId: string, order: number, parentId: string | null): Prisma.BudgetLineItemUncheckedCreateInput {
  return {
    sectionId,
    lineCode: line.lineCode,
    description: line.description,
    clientNotes: line.clientNotes,
    internalNotes: line.internalNotes,
    qty: line.qty,
    days: line.days,
    rate: line.rate,
    unit: line.unit,
    agencyFeePercent: line.agencyFeePercent,
    estimatedTotal: line.estimatedTotal,
    actualTotal: 0,
    variance: line.estimatedTotal,
    isAgreed: false,
    isClosed: false,
    order,
    isSubItem: Boolean(parentId),
    parentId,
    reconNotes: null,
  };
}

export async function createSection(revisionId: string, data: { code: string; name: string; order?: number; isVisible?: boolean }) {
  const max = await prisma.budgetSection.aggregate({ where: { revisionId }, _max: { order: true } });
  return prisma.budgetSection.create({
    data: {
      revisionId,
      code: data.code,
      name: data.name,
      order: data.order ?? ((max._max.order ?? 0) + 1),
      isVisible: data.isVisible ?? true,
    },
  });
}

export async function nextLineCode(sectionId: string, parentId?: string | null) {
  const section = await prisma.budgetSection.findUniqueOrThrow({ where: { id: sectionId } });
  if (parentId) {
    const parent = await prisma.budgetLineItem.findUniqueOrThrow({ where: { id: parentId } });
    const count = await prisma.budgetLineItem.count({ where: { parentId } });
    return `${parent.lineCode}${String.fromCharCode(97 + count)}`;
  }
  const count = await prisma.budgetLineItem.count({ where: { sectionId, parentId: null } });
  return `${section.code}.${count + 1}`;
}

export async function createLineItem(sectionId: string, data: Partial<Prisma.BudgetLineItemUncheckedCreateInput>) {
  const max = await prisma.budgetLineItem.aggregate({ where: { sectionId }, _max: { order: true } });
  const lineCode = data.lineCode ?? await nextLineCode(sectionId, data.parentId as string | null | undefined);
  const unit = data.unit ?? "Days";
  const days = unit === "Flat Fee" ? 1 : data.days ?? 1;
  const estimatedTotal = calculateLineItem({ ...data, days });
  return prisma.budgetLineItem.create({
    data: {
      sectionId,
      lineCode,
      description: data.description ?? "New line item",
      clientNotes: data.clientNotes ?? null,
      internalNotes: data.internalNotes ?? null,
      qty: data.qty ?? 1,
      days,
      rate: data.rate ?? 0,
      unit,
      agencyFeePercent: data.agencyFeePercent ?? 0,
      estimatedTotal,
      actualTotal: 0,
      variance: estimatedTotal,
      isAgreed: data.isAgreed ?? false,
      isClosed: data.isClosed ?? false,
      order: data.order ?? ((max._max.order ?? 0) + 1),
      isSubItem: data.isSubItem ?? Boolean(data.parentId),
      parentId: data.parentId ?? null,
      reconNotes: data.reconNotes ?? null,
    },
  });
}

export function linePatchFromBody(body: Record<string, unknown>): Prisma.BudgetLineItemUncheckedUpdateInput {
  const unit = body.unit as string | undefined;
  return {
    description: body.description as string | undefined,
    clientNotes: body.clientNotes as string | null | undefined,
    internalNotes: body.internalNotes as string | null | undefined,
    qty: requiredNumber(body.qty),
    days: unit === "Flat Fee" ? 1 : requiredNumber(body.days),
    rate: requiredNumber(body.rate),
    unit,
    agencyFeePercent: requiredNumber(body.agencyFeePercent),
    isAgreed: body.isAgreed as boolean | undefined,
    isClosed: body.isClosed as boolean | undefined,
    reconNotes: body.reconNotes as string | null | undefined,
    order: requiredNumber(body.order),
  };
}

export async function recalculateLineItem(lineItemId: string) {
  const line = await prisma.budgetLineItem.findUniqueOrThrow({ where: { id: lineItemId }, include: { subCosts: true } });
  const estimatedTotal = calculateLineItem(line);
  const actualTotal = calculateLineItemActual(line);
  return prisma.budgetLineItem.update({
    where: { id: lineItemId },
    data: {
      estimatedTotal,
      actualTotal,
      variance: roundMoney(estimatedTotal - actualTotal),
    },
    include: { subCosts: true, children: { include: { subCosts: true } } },
  });
}

export async function updateLineItem(lineItemId: string, data: Prisma.BudgetLineItemUncheckedUpdateInput) {
  await prisma.budgetLineItem.update({ where: { id: lineItemId }, data });
  return recalculateLineItem(lineItemId);
}

export async function duplicateLineItem(lineItemId: string) {
  const line = await prisma.budgetLineItem.findUniqueOrThrow({ where: { id: lineItemId }, include: { subCosts: true } });
  const max = await prisma.budgetLineItem.aggregate({ where: { sectionId: line.sectionId }, _max: { order: true } });
  return createLineItem(line.sectionId, {
    ...copyLineData(line as FullLineItem, line.sectionId, (max._max.order ?? 0) + 1, line.parentId),
    lineCode: await nextLineCode(line.sectionId, line.parentId),
    description: `${line.description} copy`,
  });
}

export async function recalculateAfterSubCost(lineItemId: string) {
  const line = await recalculateLineItem(lineItemId);
  const section = await prisma.budgetSection.findUnique({ where: { id: line.sectionId }, include: { revision: true } });
  if (section?.revision.budgetId) {
    const totals = await calculateRevisionTotals(section.revision.id);
    await updateAdvanceCalculations(section.revision.budgetId, totals);
  }
  return line;
}

export async function applyTemplate(revisionId: string, templateId: string) {
  const template = await prisma.sectionTemplate.findUniqueOrThrow({ where: { id: templateId } });
  const sections = template.sections as unknown as SectionTemplateSection[];
  await prisma.$transaction(async (tx) => {
    await tx.budgetSection.deleteMany({ where: { revisionId } });
    for (const section of sections.sort((a, b) => a.order - b.order)) {
      const createdSection = await tx.budgetSection.create({
        data: {
          revisionId,
          code: section.code,
          name: section.name,
          order: section.order,
          isVisible: true,
        },
      });
      for (const [index, description] of section.defaultLineItems.entries()) {
        await tx.budgetLineItem.create({
          data: {
            sectionId: createdSection.id,
            lineCode: `${section.code}.${index + 1}`,
            description,
            qty: 1,
            days: 1,
            rate: 0,
            unit: "Days",
            estimatedTotal: 0,
            actualTotal: 0,
            variance: 0,
            order: index + 1,
          },
        });
      }
    }
  });
  return getRevision(revisionId);
}

export async function syncProductionTotals(productionId: string) {
  const budget = await prisma.budget.findUnique({ where: { productionId }, select: { currentRevisionId: true } });
  if (!budget?.currentRevisionId) return null;
  const totals = await calculateRevisionTotals(budget.currentRevisionId);
  return prisma.production.update({
    where: { id: productionId },
    data: {
      value: new Prisma.Decimal(totals.grandTotal),
      actualSpend: totals.totalActuals,
      variance: totals.totalVariance,
    },
  });
}

export async function cloneBudgetToProduction(opportunityId: string, productionId: string) {
  const opportunityBudget = await prisma.budget.findUnique({
    where: { opportunityId },
    include: { currentRevision: { include: revisionInclude }, advanceInvoices: true },
  });
  if (!opportunityBudget?.currentRevision) return null;

  const source = opportunityBudget.currentRevision;
  const createdBudget = await prisma.$transaction(async (tx) => {
    await tx.budget.deleteMany({ where: { productionId } });
    const budget = await tx.budget.create({
      data: {
        productionId,
        jobName: opportunityBudget.jobName,
        jobLocation: opportunityBudget.jobLocation,
        shotCount: opportunityBudget.shotCount,
        prepTravelDate: opportunityBudget.prepTravelDate,
        shootDates: opportunityBudget.shootDates,
        photographerDirector: opportunityBudget.photographerDirector,
        accountingContact: opportunityBudget.accountingContact,
        comments: opportunityBudget.comments,
        caveats: opportunityBudget.caveats,
        usages: opportunityBudget.usages,
        productionFeePercent: opportunityBudget.productionFeePercent,
        insurancePercent: opportunityBudget.insurancePercent,
        currencyBase: opportunityBudget.currencyBase,
        currencySecondary: opportunityBudget.currencySecondary,
        currencyRate: opportunityBudget.currencyRate,
        status: "IN_PRODUCTION",
      },
    });
    const revision = await tx.budgetRevision.create({
      data: {
        budgetId: budget.id,
        revisionNumber: 1,
        label: "Production budget",
        status: "APPROVED",
        productionFeePercent: source.productionFeePercent,
        insurancePercent: source.insurancePercent,
        notes: source.notes,
      },
    });
    for (const section of source.sections) {
      const copiedSection = await tx.budgetSection.create({
        data: {
          revisionId: revision.id,
          code: section.code,
          name: section.name,
          order: section.order,
          isVisible: section.isVisible,
        },
      });
      const parentMap = new Map<string, string>();
      for (const line of section.lineItems.filter((item) => !item.parentId)) {
        const copied = await tx.budgetLineItem.create({
          data: copyLineData(line, copiedSection.id, line.order, null),
        });
        parentMap.set(line.id, copied.id);
      }
      for (const line of section.lineItems.filter((item) => item.parentId)) {
        await tx.budgetLineItem.create({
          data: copyLineData(line, copiedSection.id, line.order, parentMap.get(line.parentId ?? "") ?? null),
        });
      }
    }
    for (const advance of opportunityBudget.advanceInvoices) {
      await tx.advanceInvoice.create({
        data: {
          budgetId: budget.id,
          label: advance.label,
          percent: advance.percent,
          amount: advance.amount,
          calculationType: advance.calculationType,
          dueDate: advance.dueDate,
          notes: advance.notes,
        },
      });
    }
    await tx.budget.update({ where: { id: budget.id }, data: { currentRevisionId: revision.id } });
    return budget;
  });

  await syncProductionTotals(productionId);
  return decorateBudget(await budgetWithCurrent(createdBudget.id));
}

const photoSections: SectionTemplateSection[] = [
  { code: "A", name: "Production & Management", order: 1, defaultLineItems: ["Producer", "Production manager", "Production assistant", "Creative direction & pre-production", "Budget management"] },
  { code: "B", name: "Photo Crew", order: 2, defaultLineItems: ["Photographer", "Digital operator", "Lighting assistant", "Photo assistant", "Retoucher"] },
  { code: "C", name: "Photo Equipment", order: 3, defaultLineItems: ["Camera kit", "Lighting kit", "Grip", "Capture station", "Hard drives"] },
  { code: "D", name: "Studio / Location", order: 4, defaultLineItems: ["Studio hire", "Location fee", "Location manager", "Permits", "Cleaning"] },
  { code: "E", name: "Location Vehicles & Transportation", order: 5, defaultLineItems: ["Production van", "Courier", "Taxi / car service", "Parking", "Fuel"] },
  { code: "F", name: "Catering", order: 6, defaultLineItems: ["Breakfast", "Lunch", "Coffee / snacks", "Per diems"] },
  { code: "G", name: "Travel & Accommodation", order: 7, defaultLineItems: ["Flights", "Train travel", "Hotel", "Transfers", "Travel days"] },
  { code: "H", name: "Styling & HMU", order: 8, defaultLineItems: ["Stylist", "Styling assistant", "Hair stylist", "Makeup artist", "Wardrobe expenses"] },
  { code: "I", name: "Set Design & Props", order: 9, defaultLineItems: ["Set designer", "Props", "Materials", "Build labour", "Strike"] },
  { code: "J", name: "Post Production", order: 10, defaultLineItems: ["Edit", "Retouching", "Colour", "Delivery masters", "Archive"] },
  { code: "K", name: "Miscellaneous", order: 11, defaultLineItems: ["Insurance", "Contingency", "Sundries", "Bank / transfer fees"] },
];

const motionSections: SectionTemplateSection[] = [
  { code: "A", name: "Production & Management", order: 1, defaultLineItems: ["Producer", "Production manager", "Production assistant", "Creative direction", "Budget management"] },
  { code: "B", name: "Photo Crew", order: 2, defaultLineItems: ["Photographer", "Digital operator", "Photo assistant"] },
  { code: "C", name: "Motion Crew", order: 3, defaultLineItems: ["Director", "DOP", "1st AC", "Gaffer", "Sound recordist", "Runner"] },
  { code: "D", name: "Photo Equipment", order: 4, defaultLineItems: ["Camera kit", "Lighting kit", "Capture station"] },
  { code: "E", name: "Motion Equipment", order: 5, defaultLineItems: ["Camera package", "Lenses", "Lighting", "Grip", "Monitor / playback", "Sound kit"] },
  { code: "F", name: "Studio / Location", order: 6, defaultLineItems: ["Studio hire", "Location fee", "Permits", "Security", "Cleaning"] },
  { code: "G", name: "Location Vehicles & Transportation", order: 7, defaultLineItems: ["Production van", "Camera van", "Courier", "Parking", "Fuel"] },
  { code: "H", name: "Catering", order: 8, defaultLineItems: ["Breakfast", "Lunch", "Craft", "Per diems"] },
  { code: "I", name: "Travel & Accommodation", order: 9, defaultLineItems: ["Flights", "Train travel", "Hotel", "Transfers", "Travel days"] },
  { code: "J", name: "Styling & HMU", order: 10, defaultLineItems: ["Stylist", "Styling assistant", "Hair", "Makeup", "Wardrobe expenses"] },
  { code: "K", name: "Set Design & Props", order: 11, defaultLineItems: ["Set designer", "Props", "Materials", "Build labour", "Strike"] },
  { code: "L", name: "Post Production", order: 12, defaultLineItems: ["Editor", "Grade", "Sound mix", "Motion graphics", "Delivery masters"] },
  { code: "M", name: "Miscellaneous", order: 13, defaultLineItems: ["Insurance", "Contingency", "Sundries", "Bank / transfer fees"] },
];

const eventSections: SectionTemplateSection[] = [
  { code: "A", name: "Production & Management", order: 1, defaultLineItems: ["Producer", "Production manager", "Production assistant", "Run of show", "Budget management"] },
  { code: "B", name: "Crew", order: 2, defaultLineItems: ["Event crew", "Stage manager", "Runner", "Photographer", "Videographer"] },
  { code: "C", name: "AV & Technical", order: 3, defaultLineItems: ["AV package", "Lighting", "Audio", "Screens", "Technical operator"] },
  { code: "D", name: "Venue & Location", order: 4, defaultLineItems: ["Venue hire", "Permits", "Security", "Cleaning", "Power"] },
  { code: "E", name: "Location Vehicles & Transportation", order: 5, defaultLineItems: ["Production van", "Courier", "Parking", "Fuel"] },
  { code: "F", name: "Catering", order: 6, defaultLineItems: ["Crew catering", "Client catering", "Drinks", "Snacks"] },
  { code: "G", name: "Travel & Accommodation", order: 7, defaultLineItems: ["Flights", "Train travel", "Hotel", "Transfers"] },
  { code: "H", name: "Styling & HMU", order: 8, defaultLineItems: ["Stylist", "HMU", "Wardrobe support"] },
  { code: "I", name: "Set Design & Props", order: 9, defaultLineItems: ["Set design", "Props", "Floral", "Build", "Strike"] },
  { code: "J", name: "Miscellaneous", order: 10, defaultLineItems: ["Insurance", "Contingency", "Sundries"] },
];

export async function seedSectionTemplates() {
  const templates = [
    { name: "Photo Shoot", description: "Stills production checklist", isDefault: true, sections: photoSections },
    { name: "Motion / Video", description: "Motion production checklist", isDefault: false, sections: motionSections },
    { name: "Event", description: "Event production checklist", isDefault: false, sections: eventSections },
  ];

  for (const template of templates) {
    const existing = await prisma.sectionTemplate.findFirst({ where: { name: template.name } });
    if (existing) {
      await prisma.sectionTemplate.update({
        where: { id: existing.id },
        data: { description: template.description, isDefault: template.isDefault, sections: template.sections as unknown as Prisma.InputJsonValue },
      });
    } else {
      await prisma.sectionTemplate.create({
        data: { ...template, sections: template.sections as unknown as Prisma.InputJsonValue },
      });
    }
  }
}
