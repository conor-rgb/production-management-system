import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { Stage } from "@prisma/client";

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
  });
});

export default router;
