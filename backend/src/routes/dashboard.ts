import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const [opportunityCount, productionCount, contactCount, companyCount] = await Promise.all([
    prisma.opportunity.count(),
    prisma.production.count(),
    prisma.contact.count(),
    prisma.company.count(),
  ]);

  res.json({
    opportunityCount,
    productionCount,
    contactCount,
    companyCount,
  });
});

export default router;
