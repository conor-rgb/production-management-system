import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/threads", async (_req: Request, res: Response): Promise<void> => {
  const threads = await prisma.emailThread.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      production: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });
  res.json(threads);
});

router.get("/threads/:id", async (req: Request, res: Response): Promise<void> => {
  const thread = await prisma.emailThread.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { sentAt: "asc" }, include: { contact: true } },
      production: true,
    },
  });
  if (!thread) { res.status(404).json({ error: "Not found" }); return; }
  res.json(thread);
});

export default router;
