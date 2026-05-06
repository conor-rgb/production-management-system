import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

// GET /api/contacts?type=CLIENT&search=xxx&companyId=xxx
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const { type, search, companyId } = req.query;

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (companyId) where.companyId = companyId;
  if (search) {
    const s = String(search);
    where.OR = [
      { firstName: { contains: s, mode: "insensitive" } },
      { lastName: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { tags: { has: s } },
      { company: { name: { contains: s, mode: "insensitive" } } },
    ];
  }

  const items = await prisma.contact.findMany({
    where,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: {
      company: { select: { id: true, name: true } },
      _count: { select: { opportunities: true } },
    },
  });
  res.json(items);
});

// GET /api/contacts/:id — full record with timeline
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      company: true,
      opportunities: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, stage: true, value: true, clientName: true, brand: true, createdAt: true },
      },
      crewMembers: {
        include: { production: { select: { id: true, title: true, jobCode: true, status: true } } },
      },
    },
  });
  if (!contact) { res.status(404).json({ error: "Not found" }); return; }
  res.json(contact);
});

// POST /api/contacts
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, email, phone, companyId, jobTitle, type, source, tags, notes } = req.body;
  if (!firstName) { res.status(400).json({ error: "firstName required" }); return; }

  const contact = await prisma.contact.create({
    data: { firstName, lastName, email, phone, companyId, jobTitle, type, source, tags: tags ?? [], notes },
    include: { company: true },
  });
  res.status(201).json(contact);
});

// PATCH /api/contacts/:id
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const { firstName, lastName, email, phone, companyId, jobTitle, type, source, tags, notes, lastContactedAt } = req.body;
  const contact = await prisma.contact.update({
    where: { id: req.params.id },
    data: { firstName, lastName, email, phone, companyId, jobTitle, type, source, tags, notes, lastContactedAt },
    include: { company: true },
  });
  res.json(contact);
});

// DELETE /api/contacts/:id
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.contact.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
