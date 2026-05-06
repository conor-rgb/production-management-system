import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.production.findMany({
    orderBy: { createdAt: "desc" },
    include: { dates: true, opportunity: true },
  });
  res.json(items);
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.production.findUnique({
    where: { id: req.params.id },
    include: {
      dates: true,
      crewMembers: { include: { role: true, contact: true } },
      budgets: { include: { sections: { include: { lineItems: true } } } },
      jobFiles: true,
      emailThreads: { include: { messages: true } },
      opportunity: true,
    },
  });
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.production.create({ data: req.body });
  res.status(201).json(item);
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.production.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(item);
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.production.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
