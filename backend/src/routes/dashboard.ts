import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { ProductionStatus, Stage } from "@prisma/client";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    opportunityCount,
    productionCount,
    contactCount,
    companyCount,
    stageCounts,
    overdueOpportunities,
    todaysAgenda,
    activeProductions,
  ] = await Promise.all([
    prisma.opportunity.count({ where: { stage: { notIn: [Stage.WON, Stage.LOST] } } }),
    prisma.production.count(),
    prisma.contact.count(),
    prisma.company.count(),
    prisma.opportunity.groupBy({
      by: ["stage"],
      _count: { stage: true },
      where: { stage: { notIn: [Stage.WON, Stage.LOST] } },
    }),
    prisma.opportunity.findMany({
      where: {
        followUpDate: { lt: today },
        stage: { notIn: [Stage.WON, Stage.LOST] },
      },
      orderBy: { followUpDate: "asc" },
      select: {
        id: true,
        title: true,
        clientName: true,
        brand: true,
        followUpDate: true,
        stage: true,
        value: true,
      },
    }),
    prisma.productionDate.findMany({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 86_400_000),
        },
      },
      orderBy: [{ time: "asc" }, { createdAt: "asc" }],
      include: {
        production: { select: { id: true, title: true, jobCode: true, clientName: true, brand: true } },
      },
    }),
    prisma.production.findMany({
      where: { status: { not: ProductionStatus.WRAPPED } },
      orderBy: { updatedAt: "desc" },
      include: {
        dates: { orderBy: [{ date: "asc" }, { time: "asc" }] },
        budgets: { include: { currentRevision: { include: { sections: { include: { lineItems: true } } } } } },
      },
    }),
  ]);

  const stageMap: Record<string, number> = {};
  for (const c of stageCounts) stageMap[c.stage] = c._count.stage;

  res.json({
    opportunityCount,
    productionCount,
    contactCount,
    companyCount,
    stageCounts: stageMap,
    overdueOpportunities,
    todaysAgenda,
    activeProductions: activeProductions.map((production) => {
      const actualSpend = production.budgets.reduce((budgetSum, budget) => (
        budgetSum + (budget.currentRevision?.sections.reduce((sectionSum, section) => (
          sectionSum + section.lineItems.reduce((lineSum, line) => lineSum + Number(line.actualCost ?? 0), 0)
        ), 0) ?? 0)
      ), 0);
      const currentRevision = production.budgets[0]?.currentRevision;
      const clientTotal = currentRevision?.sections.reduce((sectionSum, section) => (
        sectionSum + section.lineItems.reduce((lineSum, line) => lineSum + Number(line.clientSubtotal ?? 0), 0)
      ), 0) ?? Number(production.value ?? 0);
      const quotedValue = currentRevision ? clientTotal * (1 + currentRevision.productionFeePercent / 100) : Number(production.value ?? 0);
      const variance = actualSpend - quotedValue;
      const nextDate = production.dates.find((date) => {
        const d = new Date(date.date);
        d.setHours(23, 59, 59, 999);
        return d >= new Date();
      });

      return {
        id: production.id,
        title: production.title,
        jobCode: production.jobCode,
        clientName: production.clientName,
        brand: production.brand,
        status: production.status,
        quotedValue,
        actualSpend,
        variance,
        overBudget: variance > 0,
        nextDate,
      };
    }),
  });
});

export default router;
