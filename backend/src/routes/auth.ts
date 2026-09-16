import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import prisma from "../prisma";
import { requireAuth } from "../middleware/auth";
import { loginBodyValidator, validateBody, validatedBody, type LoginBody } from "../utils/validation";

const router = Router();

router.post("/login", validateBody(loginBodyValidator), async (req: Request, res: Response): Promise<void> => {
  const { email, password } = validatedBody<LoginBody>(req);

  const settings = await prisma.settings.findUnique({ where: { email } });
  if (!settings) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, settings.password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = settings.id;
  req.session.email = settings.email;
  req.session.save((err) => {
    if (err) {
      console.error("Session save error:", err);
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({ ok: true, email: settings.email });
  });
});

router.post("/logout", (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req: Request, res: Response): void => {
  res.json({ ok: true, email: req.session.email });
});

export default router;
