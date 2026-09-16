import fs from "node:fs";
import path from "node:path";

const LOGO_CANDIDATES = [
  process.env.BRAND_LOGO_PATH,
  path.resolve(process.cwd(), "../logo.png"),
  path.resolve(process.cwd(), "logo.png"),
  path.resolve(__dirname, "../../../logo.png"),
].filter((item): item is string => Boolean(item));

export function brandLogoPath(): string | null {
  return LOGO_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function drawBrandLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number): void {
  const logo = brandLogoPath();
  if (logo) {
    doc.image(logo, x, y, { width });
    return;
  }
  doc.font("Helvetica-Bold").fontSize(width / 8.8).fillColor("#111111").text("unlimited.bond", x, y);
}

export function brandLogoDataUrl(): string | null {
  const logo = brandLogoPath();
  if (!logo) return null;
  return `data:image/png;base64,${fs.readFileSync(logo).toString("base64")}`;
}
