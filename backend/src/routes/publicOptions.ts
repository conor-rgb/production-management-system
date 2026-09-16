import fs from "node:fs";
import { Router, Request, Response } from "express";
import prisma from "../prisma";
import { publicTokenParamsValidator, validateParams, validatedParams, type PublicTokenParams } from "../utils/validation";

const router = Router();

router.get("/candidate-pdfs/:token", validateParams(publicTokenParamsValidator), async (req: Request, res: Response): Promise<void> => {
  const { token } = validatedParams<PublicTokenParams>(req);
  const candidate = await prisma.optionCandidate.findUnique({
    where: { pdfPublicToken: token },
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
