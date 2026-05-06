import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../prisma";

const router = Router();

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

export default router;
