import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { contacts: true } } },
  });
  res.json(items);
});

router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: { contacts: true },
  });
  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.company.create({ data: req.body });
  res.status(201).json(item);
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.company.update({ where: { id: req.params.id }, data: req.body });
  res.json(item);
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.company.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
