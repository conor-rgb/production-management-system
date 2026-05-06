import { BudgetRevisionStatus, InvoiceStatus, Prisma } from "@prisma/client";
import prisma from "../prisma";
import { AICP_SECTIONS, sectionName } from "./aicp";

export const revisionInclude = {
  budget: {
    include: {
      production: true,
      opportunity: true,
    },
  },
  sections: {
    orderBy: { order: "asc" as const },
    include: {
      lineItems: {
        orderBy: { order: "asc" as const },
        include: {
          invoices: { orderBy: { createdAt: "asc" as const }, include: { jobFile: true } },
          purchaseOrders: { orderBy: { dateRaised: "asc" as const }, include: { invoiceFile: true } },
          catalogItem: true,
        },
      },
    },
  },
};

export type FullRevision = Prisma.BudgetRevisionGetPayload<{ include: typeof revisionInclude }>;
type FullLineItem = FullRevision["sections"][number]["lineItems"][number];

export interface LineItemInput {
  internalUnitCost?: number;
  clientUnitCost?: number;
  quantity?: number;
  daysUnits?: number;
  agencyMarkup?: number;
  actualCost?: number;
}

export function recalculateLineItem<T extends LineItemInput>(data: T) {
  const internalUnitCost = Number(data.internalUnitCost ?? 0);
  const clientUnitCost = Number(data.clientUnitCost ?? 0);
  const quantity = Number(data.quantity ?? 1);
  const daysUnits = Number(data.daysUnits ?? 1);
  const agencyMarkup = Number(data.agencyMarkup ?? 0);
  const actualCost = Number(data.actualCost ?? 0);
  const internalSubtotal = internalUnitCost * quantity * daysUnits;
  const clientSubtotal = (clientUnitCost * quantity * daysUnits) + agencyMarkup;
  const variance = actualCost - clientSubtotal;
  const marginAmount = clientSubtotal - internalSubtotal;
  const marginPercent = clientSubtotal > 0 ? (marginAmount / clientSubtotal) * 100 : 0;

  return { internalSubtotal, clientSubtotal, variance, marginAmount, marginPercent };
}

function invoiceAmountByStatus(line: FullLineItem, status: InvoiceStatus) {
  return line.invoices
    .filter((invoice) => invoice.status === status)
    .reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);
}

export function calculateLineFinancialStack(line: FullLineItem, productionMode: boolean) {
  const totalPOs = productionMode && !line.isClosed
    ? line.purchaseOrders.reduce((sum, po) => sum + Number(po.agreedAmount ?? 0), 0)
    : 0;
  const totalInvoiced = productionMode && !line.isClosed ? invoiceAmountByStatus(line, InvoiceStatus.PENDING) : 0;
  const totalPaid = productionMode ? invoiceAmountByStatus(line, InvoiceStatus.PAID) : 0;
  const totalCommitted = line.isClosed ? totalPaid : totalPOs + totalInvoiced + totalPaid;
  const remainingAccrual = line.isClosed ? 0 : Number(line.internalSubtotal) - totalCommitted;
  const isOverAccrual = !line.isClosed && totalCommitted > Number(line.internalSubtotal);
  const isOverBudget = totalCommitted > Number(line.clientSubtotal);
  const accrualUsedPercent = Number(line.internalSubtotal) > 0 ? (totalCommitted / Number(line.internalSubtotal)) * 100 : 0;
  const releasedToMargin = line.isClosed ? Math.max(0, Number(line.internalSubtotal) - totalCommitted) : 0;

  return {
    totalPOs,
    totalInvoiced,
    totalPaid,
    totalCommitted,
    remainingAccrual,
    isOverAccrual,
    isOverBudget,
    accrualUsedPercent,
    releasedToMargin,
  };
}

function enrichRevision(revision: FullRevision) {
  const productionMode = Boolean(revision.budget.productionId);
  const sections = revision.sections.map((section) => ({
    ...section,
    lineItems: section.lineItems.map((line) => ({
      ...line,
      ...(productionMode ? calculateLineFinancialStack(line, productionMode) : {}),
    })),
  }));

  return { ...revision, sections };
}

export async function getRevision(revisionId: string) {
  const revision = await prisma.budgetRevision.findUnique({
    where: { id: revisionId },
    include: revisionInclude,
  });
  if (!revision) return null;
  return { ...enrichRevision(revision), totals: calculateRevisionTotalsFromRevision(revision) };
}

export function calculateRevisionTotalsFromRevision(revision: FullRevision) {
  const productionMode = Boolean(revision.budget.productionId);
  const sectionTotals = revision.sections.map((section) => {
    const internalTotal = section.lineItems.reduce((sum, line) => sum + line.internalSubtotal, 0);
    const clientTotal = section.lineItems.reduce((sum, line) => sum + line.clientSubtotal, 0);
    const marginAmount = section.lineItems.reduce((sum, line) => sum + line.marginAmount, 0);
    const marginPercent = clientTotal > 0 ? (marginAmount / clientTotal) * 100 : 0;
    const stacks = section.lineItems.map((line) => calculateLineFinancialStack(line, productionMode));
    const totalPOs = stacks.reduce((sum, stack) => sum + stack.totalPOs, 0);
    const totalInvoiced = stacks.reduce((sum, stack) => sum + stack.totalInvoiced, 0);
    const totalPaid = stacks.reduce((sum, stack) => sum + stack.totalPaid, 0);
    const totalCommitted = stacks.reduce((sum, stack) => sum + stack.totalCommitted, 0);
    const remaining = stacks.reduce((sum, stack) => sum + stack.remainingAccrual, 0);
    const releasedToMargin = stacks.reduce((sum, stack) => sum + stack.releasedToMargin, 0);

    return {
      sectionId: section.id,
      code: section.code,
      name: section.name,
      internalTotal,
      clientTotal,
      marginAmount,
      marginPercent,
      accrual: internalTotal,
      totalPOs,
      totalInvoiced,
      totalPaid,
      totalCommitted,
      remaining,
      releasedToMargin,
    };
  });

  const internalTotal = sectionTotals.reduce((sum, section) => sum + section.internalTotal, 0);
  const clientTotal = sectionTotals.reduce((sum, section) => sum + section.clientTotal, 0);
  const productionFeeAmount = clientTotal * (revision.productionFeePercent / 100);
  const clientGrandTotal = clientTotal + productionFeeAmount;
  const totalMarginAmount = clientGrandTotal - internalTotal;
  const totalMarginPercent = clientGrandTotal > 0 ? (totalMarginAmount / clientGrandTotal) * 100 : 0;
  const totalAccrual = internalTotal;
  const totalPOs = sectionTotals.reduce((sum, section) => sum + section.totalPOs, 0);
  const totalInvoiced = sectionTotals.reduce((sum, section) => sum + section.totalInvoiced, 0);
  const totalPaid = sectionTotals.reduce((sum, section) => sum + section.totalPaid, 0);
  const totalCommitted = sectionTotals.reduce((sum, section) => sum + section.totalCommitted, 0);
  const totalRemaining = sectionTotals.reduce((sum, section) => sum + section.remaining, 0);
  const releasedToMargin = sectionTotals.reduce((sum, section) => sum + section.releasedToMargin, 0);
  const projectedMargin = clientGrandTotal - totalAccrual + releasedToMargin;
  const projectedMarginPercent = clientGrandTotal > 0 ? (projectedMargin / clientGrandTotal) * 100 : 0;

  return {
    mode: productionMode ? "production" : "bidding",
    internalTotal,
    clientTotal,
    productionFeeAmount,
    clientGrandTotal,
    totalMarginAmount,
    totalMarginPercent,
    totalAccrual: productionMode ? totalAccrual : undefined,
    totalPOs: productionMode ? totalPOs : undefined,
    totalInvoiced: productionMode ? totalInvoiced : undefined,
    totalPaid: productionMode ? totalPaid : undefined,
    totalCommitted: productionMode ? totalCommitted : undefined,
    totalRemaining: productionMode ? totalRemaining : undefined,
    projectedMargin: productionMode ? projectedMargin : undefined,
    projectedMarginPercent: productionMode ? projectedMarginPercent : undefined,
    isOverAccrual: productionMode ? totalCommitted > totalAccrual : undefined,
    isOverBudget: productionMode ? totalCommitted > clientGrandTotal : undefined,
    actualTotal: productionMode ? totalCommitted : undefined,
    variance: productionMode ? totalRemaining : undefined,
    overBudget: productionMode ? totalCommitted > clientGrandTotal : false,
    sectionTotals,
  };
}

export async function calculateRevisionTotals(revisionId: string) {
  const revision = await prisma.budgetRevision.findUnique({
    where: { id: revisionId },
    include: revisionInclude,
  });
  if (!revision) throw new Error("Revision not found");
  return calculateRevisionTotalsFromRevision(revision);
}

export async function getOrCreateBudget({ productionId, opportunityId }: { productionId?: string; opportunityId?: string }) {
  if ((productionId && opportunityId) || (!productionId && !opportunityId)) {
    throw new Error("Budget must be linked to exactly one production or opportunity");
  }

  const where = productionId ? { productionId } : { opportunityId };
  let budget = await prisma.budget.findFirst({
    where,
    include: { currentRevision: { include: revisionInclude } },
  });

  if (!budget) {
    budget = await prisma.$transaction(async (tx) => {
      const createdBudget = await tx.budget.create({ data: { productionId, opportunityId } });
      const revision = await tx.budgetRevision.create({
        data: {
          budgetId: createdBudget.id,
          revisionNumber: 1,
          label: "Original",
          status: BudgetRevisionStatus.DRAFT,
          productionFeePercent: 10,
          sections: {
            create: AICP_SECTIONS.map((section, index) => ({
              code: section.code,
              name: section.name,
              order: index,
            })),
          },
        },
      });
      await tx.budget.update({ where: { id: createdBudget.id }, data: { currentRevisionId: revision.id } });
      return tx.budget.findUniqueOrThrow({
        where: { id: createdBudget.id },
        include: { currentRevision: { include: revisionInclude } },
      });
    });
  }

  if (productionId && budget.currentRevisionId) await syncProductionTotals(productionId);
  const fullRevision = budget.currentRevisionId ? await getRevision(budget.currentRevisionId) : null;
  return { ...budget, currentRevision: fullRevision, totals: fullRevision?.totals ?? null };
}

export async function createRevision(budgetId: string, options?: { label?: string; sourceRevisionId?: string }) {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: { currentRevision: { include: revisionInclude }, revisions: { select: { revisionNumber: true } } },
  });
  if (!budget) throw new Error("Budget not found");

  const source = options?.sourceRevisionId
    ? await prisma.budgetRevision.findUnique({ where: { id: options.sourceRevisionId }, include: revisionInclude })
    : budget.currentRevision;
  if (!source) throw new Error("Source revision not found");

  const revisionNumber = Math.max(0, ...budget.revisions.map((revision) => revision.revisionNumber)) + 1;

  const newRevision = await prisma.$transaction(async (tx) => {
    if (budget.currentRevisionId) {
      await tx.budgetRevision.update({
        where: { id: budget.currentRevisionId },
        data: { status: BudgetRevisionStatus.SUPERSEDED },
      });
    }

    const created = await tx.budgetRevision.create({
      data: {
        budgetId,
        revisionNumber,
        label: options?.label ?? `Revision ${revisionNumber}`,
        status: BudgetRevisionStatus.DRAFT,
        version: source.version,
        productionFeePercent: source.productionFeePercent,
        notes: source.notes,
      },
    });

    for (const section of source.sections) {
      const createdSection = await tx.budgetSection.create({
        data: { revisionId: created.id, code: section.code, name: section.name, order: section.order },
      });
      for (const line of section.lineItems) {
        await tx.budgetLineItem.create({
          data: {
            sectionId: createdSection.id,
            lineCode: line.lineCode,
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
            actualCost: 0,
            variance: -line.clientSubtotal,
            isClosed: false,
            isTaxable: line.isTaxable,
            hasPW: line.hasPW,
            hasHealthSafety: line.hasHealthSafety,
            baseHours: line.baseHours,
            overtime15x: line.overtime15x,
            overtime2x: line.overtime2x,
            catalogItemId: line.catalogItemId,
            order: line.order,
          },
        });
      }
    }

    await tx.budget.update({ where: { id: budgetId }, data: { currentRevisionId: created.id } });
    return created;
  });

  if (budget.productionId) await syncProductionTotals(budget.productionId);
  return getRevision(newRevision.id);
}

export async function syncProductionTotals(productionId: string) {
  const budget = await prisma.budget.findFirst({ where: { productionId }, include: { currentRevision: { include: revisionInclude } } });
  if (!budget?.currentRevision) return null;
  const totals = calculateRevisionTotalsFromRevision(budget.currentRevision);
  await prisma.production.update({
    where: { id: productionId },
    data: { value: totals.clientGrandTotal },
  });
  return totals;
}

async function nextLineCode(sectionId: string, sectionCode: string) {
  const count = await prisma.budgetLineItem.count({ where: { sectionId } });
  return `${sectionCode}_${String(count + 1).padStart(2, "0")}`;
}

export async function createLineItem(revisionId: string, sectionId: string, data: Prisma.BudgetLineItemUncheckedCreateInput) {
  const section = await prisma.budgetSection.findFirst({ where: { id: sectionId, revisionId }, include: { revision: { include: { budget: true } } } });
  if (!section) throw new Error("Section not found");
  const order = await prisma.budgetLineItem.count({ where: { sectionId } });
  const calculated = recalculateLineItem(data);
  const line = await prisma.budgetLineItem.create({
    data: {
      ...data,
      sectionId,
      lineCode: data.lineCode ?? await nextLineCode(sectionId, section.code),
      order,
      ...calculated,
    },
    include: { invoices: true, purchaseOrders: true },
  });
  if (section.revision.budget.productionId) await syncProductionTotals(section.revision.budget.productionId);
  return line;
}

export async function updateLineItem(lineItemId: string, data: Prisma.BudgetLineItemUncheckedUpdateInput) {
  const current = await prisma.budgetLineItem.findUnique({
    where: { id: lineItemId },
    include: { section: { include: { revision: { include: { budget: true } } } } },
  });
  if (!current) throw new Error("Line item not found");
  const merged = {
    internalUnitCost: Number(data.internalUnitCost ?? current.internalUnitCost),
    clientUnitCost: Number(data.clientUnitCost ?? current.clientUnitCost),
    quantity: Number(data.quantity ?? current.quantity),
    daysUnits: Number(data.daysUnits ?? current.daysUnits),
    agencyMarkup: Number(data.agencyMarkup ?? current.agencyMarkup),
    actualCost: Number(data.actualCost ?? current.actualCost),
  };
  const calculated = recalculateLineItem(merged);
  const line = await prisma.budgetLineItem.update({
    where: { id: lineItemId },
    data: { ...data, ...calculated },
    include: { invoices: true, purchaseOrders: true },
  });
  if (current.section.revision.budget.productionId) await syncProductionTotals(current.section.revision.budget.productionId);
  return line;
}

export async function insertCatalogItem(revisionId: string, sectionCode: string, catalogItemId: string) {
  const catalogItem = await prisma.catalogItem.findUnique({ where: { id: catalogItemId } });
  if (!catalogItem) throw new Error("Catalog item not found");

  const section = await prisma.budgetSection.upsert({
    where: { revisionId_code: { revisionId, code: sectionCode } },
    update: {},
    create: {
      revisionId,
      code: sectionCode,
      name: sectionName(sectionCode),
      order: AICP_SECTIONS.findIndex((item) => item.code === sectionCode),
    },
    include: { revision: { include: { budget: true } } },
  });

  return createLineItem(revisionId, section.id, {
    sectionId: section.id,
    lineCode: await nextLineCode(section.id, section.code),
    description: catalogItem.description,
    internalUnitCost: catalogItem.defaultInternalUnitCost,
    clientUnitCost: catalogItem.defaultClientUnitCost,
    quantity: catalogItem.defaultQuantity,
    daysUnits: catalogItem.defaultDaysUnits,
    unitLabel: catalogItem.defaultUnitLabel,
    agencyMarkup: catalogItem.defaultAgencyMarkup,
    catalogItemId: catalogItem.id,
  });
}

export async function insertCatalogGroup(revisionId: string, groupId: string) {
  const group = await prisma.catalogGroup.findUnique({
    where: { id: groupId },
    include: { items: { orderBy: { order: "asc" }, include: { catalogItem: true } } },
  });
  if (!group) throw new Error("Catalog group not found");

  const created = [];
  for (const item of group.items) {
    created.push(await insertCatalogItem(revisionId, item.catalogItem.section, item.catalogItemId));
  }
  return created;
}

export async function cloneBudgetToProduction(opportunityId: string, productionId: string) {
  const opportunityBudget = await prisma.budget.findFirst({
    where: { opportunityId },
    include: { currentRevision: { include: revisionInclude } },
  });
  if (!opportunityBudget?.currentRevision) return null;

  const budget = await prisma.$transaction(async (tx) => {
    const createdBudget = await tx.budget.create({ data: { productionId } });
    const source = opportunityBudget.currentRevision!;
    const revision = await tx.budgetRevision.create({
      data: {
        budgetId: createdBudget.id,
        revisionNumber: 1,
        label: "From bid",
        status: BudgetRevisionStatus.DRAFT,
        version: source.version,
        productionFeePercent: source.productionFeePercent,
        notes: source.notes,
      },
    });

    for (const section of source.sections) {
      const createdSection = await tx.budgetSection.create({
        data: { revisionId: revision.id, code: section.code, name: section.name, order: section.order },
      });
      for (const line of section.lineItems) {
        await tx.budgetLineItem.create({
          data: {
            sectionId: createdSection.id,
            lineCode: line.lineCode,
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
            actualCost: 0,
            variance: -line.clientSubtotal,
            isClosed: false,
            isTaxable: line.isTaxable,
            hasPW: line.hasPW,
            hasHealthSafety: line.hasHealthSafety,
            baseHours: line.baseHours,
            overtime15x: line.overtime15x,
            overtime2x: line.overtime2x,
            catalogItemId: line.catalogItemId,
            order: line.order,
          },
        });
      }
    }

    return tx.budget.update({
      where: { id: createdBudget.id },
      data: { currentRevisionId: revision.id },
      include: { currentRevision: { include: revisionInclude } },
    });
  });

  await syncProductionTotals(productionId);
  return budget;
}

export async function generatePoNumber(productionId: string) {
  const production = await prisma.production.findUnique({
    where: { id: productionId },
    select: { jobCode: true, lastPoSequence: true },
  });
  if (!production?.jobCode) throw new Error("Production job code required before raising a PO");

  const nextSequence = production.lastPoSequence + 1;
  await prisma.production.update({ where: { id: productionId }, data: { lastPoSequence: nextSequence } });
  return `PO-${production.jobCode}-${String(nextSequence).padStart(3, "0")}`;
}
