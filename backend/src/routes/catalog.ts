import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { AICP_SECTIONS } from "../services/aicp";

const router = Router();

function itemData(body: Record<string, unknown>) {
  return {
    section: body.section as string | undefined,
    description: body.description as string | undefined,
    defaultInternalUnitCost: body.defaultInternalUnitCost !== undefined ? Number(body.defaultInternalUnitCost) : undefined,
    defaultClientUnitCost: body.defaultClientUnitCost !== undefined ? Number(body.defaultClientUnitCost) : undefined,
    defaultUnitLabel: body.defaultUnitLabel as string | undefined,
    defaultQuantity: body.defaultQuantity !== undefined ? Number(body.defaultQuantity) : undefined,
    defaultDaysUnits: body.defaultDaysUnits !== undefined ? Number(body.defaultDaysUnits) : undefined,
    defaultAgencyMarkup: body.defaultAgencyMarkup !== undefined ? Number(body.defaultAgencyMarkup) : undefined,
    notes: body.notes as string | null | undefined,
    order: body.order !== undefined ? Number(body.order) : undefined,
  };
}

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.catalogItem.findMany({
    where: { isActive: true },
    orderBy: [{ section: "asc" }, { order: "asc" }, { description: "asc" }],
  });
  res.json(AICP_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => item.section === section.code),
  })));
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  if (!req.body.section || !req.body.description) {
    res.status(400).json({ error: "section and description required" });
    return;
  }
  const data = itemData(req.body);
  const item = await prisma.catalogItem.create({
    data: {
      ...data,
      section: req.body.section,
      description: req.body.description,
    },
  });
  res.status(201).json(item);
});

router.patch("/:itemId", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.catalogItem.update({ where: { id: req.params.itemId }, data: itemData(req.body) });
  res.json(item);
});

router.delete("/:itemId", async (req: Request, res: Response): Promise<void> => {
  await prisma.catalogItem.update({ where: { id: req.params.itemId }, data: { isActive: false } });
  res.status(204).end();
});

router.patch("/:itemId/reorder", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.catalogItem.update({ where: { id: req.params.itemId }, data: { order: Number(req.body.order ?? 0) } });
  res.json(item);
});

router.get("/groups", async (_req: Request, res: Response): Promise<void> => {
  const groups = await prisma.catalogGroup.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { order: "asc" }, include: { catalogItem: true } } },
  });
  res.json(groups);
});

router.post("/groups", async (req: Request, res: Response): Promise<void> => {
  if (!req.body.name) { res.status(400).json({ error: "name required" }); return; }
  const group = await prisma.catalogGroup.create({ data: { name: req.body.name, description: req.body.description } });
  res.status(201).json(group);
});

router.patch("/groups/:groupId", async (req: Request, res: Response): Promise<void> => {
  const group = await prisma.catalogGroup.update({
    where: { id: req.params.groupId },
    data: { name: req.body.name, description: req.body.description },
  });
  res.json(group);
});

router.delete("/groups/:groupId", async (req: Request, res: Response): Promise<void> => {
  await prisma.catalogGroup.delete({ where: { id: req.params.groupId } });
  res.status(204).end();
});

router.post("/groups/:groupId/items", async (req: Request, res: Response): Promise<void> => {
  const item = await prisma.catalogGroupItem.create({
    data: {
      groupId: req.params.groupId,
      catalogItemId: req.body.catalogItemId,
      order: Number(req.body.order ?? 0),
    },
    include: { catalogItem: true },
  });
  res.status(201).json(item);
});

router.delete("/groups/:groupId/items/:catalogItemId", async (req: Request, res: Response): Promise<void> => {
  await prisma.catalogGroupItem.delete({
    where: { groupId_catalogItemId: { groupId: req.params.groupId, catalogItemId: req.params.catalogItemId } },
  });
  res.status(204).end();
});

export default router;
