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

export default router;
