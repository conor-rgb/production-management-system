import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.jobFile.findMany({
    orderBy: { createdAt: "desc" },
    include: { production: true },
  });
  res.json(items);
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.jobFile.create({ data: req.body });
  res.status(201).json(item);
});

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.jobFile.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
