import fs from "node:fs";
import { Router, Request, Response } from "express";
import prisma from "../prisma";

const router = Router();

router.get("/candidate-pdfs/:token", async (req: Request, res: Response): Promise<void> => {
  const candidate = await prisma.optionCandidate.findUnique({
    where: { pdfPublicToken: req.params.token },
    select: { pdfStoredPath: true, pdfFilename: true },
  });
  if (!candidate?.pdfStoredPath || !fs.existsSync(candidate.pdfStoredPath)) {
    res.status(404).json({ error: "PDF not found" });
    return;
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${(candidate.pdfFilename ?? "option.pdf").replace(/"/g, "'")}"`);
  fs.createReadStream(candidate.pdfStoredPath).pipe(res);
});

export default router;
