import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { BlackbookCategory, Prisma } from "@prisma/client";
import prisma from "../prisma";

const router = Router();

const DEFAULT_BLACKBOOK_CATEGORIES: Array<{
  name: string;
  slug: string;
  broadType: BlackbookCategory;
  color: string;
  coreFields: string[];
  types: string[];
}> = [
  { name: "Crew", slug: "crew", broadType: "CREW", color: "#1a1a1f", coreFields: ["email", "phone", "rate", "dietaries", "travel"], types: ["Photographer", "Fashion Photographer", "Still Life Photographer", "Ecom Photographer", "Photo Assistant", "Lighting Assistant", "Digital Operator", "DOP", "Focus Puller", "Producer", "Production Manager", "Runner"] },
  { name: "Locations", slug: "locations", broadType: "LOCATION", color: "#2563eb", coreFields: ["address", "website", "photos", "map", "daylight", "blackout", "area", "access"], types: ["Studio", "Location House", "Hotel", "Restaurant", "Event Space", "Gallery", "Outdoor", "Warehouse", "Office"] },
  { name: "Florists", slug: "florists", broadType: "SERVICE", color: "#16a34a", coreFields: ["email", "phone", "website", "rate", "delivery"], types: ["Floral Design", "Installation", "Table Flowers", "Set Dressing", "Plants"] },
  { name: "Catering", slug: "catering", broadType: "SERVICE", color: "#d97706", coreFields: ["email", "phone", "rate", "dietaries", "delivery"], types: ["Breakfast", "Lunch", "Craft", "Coffee", "Private Chef", "Event Catering"] },
  { name: "Art Department", slug: "art-department", broadType: "SERVICE", color: "#8b5cf6", coreFields: ["email", "phone", "rate", "portfolio"], types: ["Set Designer", "Prop Stylist", "Set Build", "Scenic Painter", "Prop House"] },
  { name: "Styling & HMU", slug: "styling-hmu", broadType: "CREW", color: "#db2777", coreFields: ["email", "phone", "rate", "portfolio", "dietaries"], types: ["Stylist", "Styling Assistant", "Hair Stylist", "Makeup Artist", "Manicurist", "Tailor"] },
  { name: "Talent", slug: "talent", broadType: "TALENT", color: "#0f766e", coreFields: ["agency", "book", "social", "stats", "photos"], types: ["Model", "Actor", "Real Person", "Child Talent", "Hand Model", "Featured Extra"] },
  { name: "Transport", slug: "transport", broadType: "TRANSPORT", color: "#475569", coreFields: ["email", "phone", "vehicle", "parking", "rate"], types: ["Driver", "Runner Driver", "Van", "Car Service", "Courier", "Truck"] },
  { name: "AV & Technical", slug: "av-technical", broadType: "SERVICE", color: "#0891b2", coreFields: ["email", "phone", "rate", "equipment"], types: ["AV Supplier", "Sound", "Lighting", "Projection", "Streaming", "Power"] },
  { name: "Post Production", slug: "post-production", broadType: "POST", color: "#4f46e5", coreFields: ["email", "phone", "rate", "portfolio"], types: ["Retoucher", "Editor", "Colourist", "VFX", "Sound Mix", "Grade"] },
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";
}

async function ensureBlackbookDefaults(): Promise<void> {
  const count = await prisma.blackbookConfigCategory.count();
  if (count > 0) return;
  for (const [index, category] of DEFAULT_BLACKBOOK_CATEGORIES.entries()) {
    const created = await prisma.blackbookConfigCategory.create({
      data: {
        name: category.name,
        slug: category.slug,
        broadType: category.broadType,
        color: category.color,
        order: index,
        coreFields: category.coreFields,
      },
    });
    await prisma.blackbookConfigType.createMany({
      data: category.types.map((name, typeIndex) => ({
        categoryId: created.id,
        name,
        slug: slugify(name),
        order: typeIndex,
      })),
      skipDuplicates: true,
    });
  }
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  const settings = await prisma.settings.findUnique({ where: { id: req.session.userId! } });
  if (!settings) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ email: settings.email });
});

router.patch("/password", async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword required" });
    return;
  }

  const settings = await prisma.settings.findUnique({ where: { id: req.session.userId! } });
  if (!settings) { res.status(404).json({ error: "Not found" }); return; }

  const valid = await bcrypt.compare(currentPassword, settings.password);
  if (!valid) { res.status(401).json({ error: "Current password incorrect" }); return; }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.settings.update({ where: { id: settings.id }, data: { password: hashed } });
  res.json({ ok: true });
});

router.patch("/email", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: "email required" }); return; }

  const updated = await prisma.settings.update({
    where: { id: req.session.userId! },
    data: { email },
  });
  req.session.email = updated.email;
  res.json({ email: updated.email });
});

router.get("/crew-roles", async (_req: Request, res: Response): Promise<void> => {
  const roles = await prisma.crewRole.findMany({ orderBy: { name: "asc" } });
  res.json(roles);
});

router.post("/crew-roles", async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const role = await prisma.crewRole.create({ data: { name, description } });
  res.status(201).json(role);
});

router.patch("/crew-roles/:id", async (req: Request, res: Response): Promise<void> => {
  const { name, description } = req.body;
  const role = await prisma.crewRole.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  res.json(role);
});

router.delete("/crew-roles/:id", async (req: Request, res: Response): Promise<void> => {
  const inUse = await prisma.crewMember.count({ where: { roleId: req.params.id } });
  if (inUse > 0) {
    res.status(400).json({ error: "Role is used by crew and cannot be deleted" });
    return;
  }

  await prisma.crewRole.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

router.get("/blackbook/categories", async (_req: Request, res: Response): Promise<void> => {
  await ensureBlackbookDefaults();
  const categories = await prisma.blackbookConfigCategory.findMany({
    orderBy: { order: "asc" },
    include: { types: { orderBy: { order: "asc" } } },
  });
  res.json(categories);
});

router.post("/blackbook/categories", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; broadType?: BlackbookCategory; color?: string; coreFields?: string[] };
  if (!body.name?.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const order = await prisma.blackbookConfigCategory.count();
  const category = await prisma.blackbookConfigCategory.create({
    data: {
      name: body.name.trim(),
      slug: slugify(body.name),
      broadType: body.broadType ?? "OTHER",
      color: body.color ?? "#1a1a1f",
      coreFields: body.coreFields ?? [],
      order,
    },
    include: { types: true },
  });
  res.status(201).json(category);
});

router.patch("/blackbook/categories/:id", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; broadType?: BlackbookCategory; color?: string; coreFields?: string[]; order?: number };
  const data: Prisma.BlackbookConfigCategoryUpdateInput = {};
  if (body.name !== undefined) {
    data.name = body.name;
    data.slug = slugify(body.name);
  }
  if (body.broadType !== undefined) data.broadType = body.broadType;
  if (body.color !== undefined) data.color = body.color;
  if (body.coreFields !== undefined) data.coreFields = body.coreFields;
  if (body.order !== undefined) data.order = body.order;
  const category = await prisma.blackbookConfigCategory.update({
    where: { id: req.params.id },
    data,
    include: { types: { orderBy: { order: "asc" } } },
  });
  res.json(category);
});

router.post("/blackbook/categories/:id/types", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string };
  if (!body.name?.trim()) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const order = await prisma.blackbookConfigType.count({ where: { categoryId: req.params.id } });
  const type = await prisma.blackbookConfigType.create({
    data: { categoryId: req.params.id, name: body.name.trim(), slug: slugify(body.name), order },
  });
  res.status(201).json(type);
});

router.patch("/blackbook/types/:id", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { name?: string; order?: number };
  const data: Prisma.BlackbookConfigTypeUpdateInput = {};
  if (body.name !== undefined) {
    data.name = body.name;
    data.slug = slugify(body.name);
  }
  if (body.order !== undefined) data.order = body.order;
  const type = await prisma.blackbookConfigType.update({ where: { id: req.params.id }, data });
  res.json(type);
});

router.delete("/blackbook/types/:id", async (req: Request, res: Response): Promise<void> => {
  await prisma.blackbookConfigType.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
