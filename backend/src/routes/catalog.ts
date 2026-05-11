import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.status(410).json({ error: "The legacy item catalog has been replaced by budget section templates." });
});

export default router;
