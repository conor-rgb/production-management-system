import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

// GET /api/companies?search=xxx
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { search } = req.query;
  const where = search
    ? { name: { contains: String(search), mode: "insensitive" as const } }
    : {};

  const items = await prisma.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { contacts: true, opportunities: true } },
    },
  });
  res.json(items);
});

// GET /api/companies/:id — with all contacts and linked opportunities
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: {
        orderBy: [{ firstName: "asc" }],
        include: { _count: { select: { opportunities: true } } },
      },
      opportunities: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, brand: true, createdAt: true },
      },
    },
  });
  if (!company) { res.status(404).json({ error: "Not found" }); return; }
  res.json(company);
});

// POST /api/companies
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { name, website, address, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const company = await prisma.company.create({ data: { name, website, address, notes } });
  res.status(201).json(company);
});

// PATCH /api/companies/:id
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json(company);
});

// DELETE /api/companies/:id
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.company.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
