import PDFDocument from "pdfkit";
import prisma from "../prisma";
import { autoFileDocument } from "./fileStorage";
import { calculateRevisionTotalsFromRevision, FullRevision, getRevision, revisionVersionLabel } from "./budgetService";

const PAGE = { left: 52, right: 543, top: 58, bottom: 780 };
const TEXT = "#111111";
const MUTED = "#5f5f5f";
const LINE = "#111111";
const PALE = "#f5f5f1";

function money(value: number): string {
  if (!value) return "£0.00";
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

function cleanLines(value?: string | null): string[] {
  return (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function dateString(value?: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB");
}

function detailPair(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 210) {
  doc.font("Helvetica-Bold").fontSize(7.6).fillColor(TEXT).text(label, x, y, { width: 70 });
  doc.font("Helvetica").fontSize(8).fillColor(TEXT).text(value || "-", x + 76, y, { width: width - 76 });
}

function drawRule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).lineWidth(0.65).strokeColor(LINE).stroke();
}

function footer(doc: PDFKit.PDFDocument, page: number, pageCount: number, jobCode: string) {
  drawRule(doc, 742);
  doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("BOND UN LIMITED", PAGE.left, 758);
  doc.font("Helvetica").fontSize(7).fillColor(TEXT).text(
    "128 City Road | London EC1V 2NX, England, United Kingdom | www.unlimited.bond | Tel: +44 (0) 7711 825 340 | VAT Number: GB 493336372 | Company Number: 16215041",
    PAGE.left,
    770,
    { width: PAGE.right - PAGE.left }
  );
  doc.fontSize(7).fillColor(MUTED).text(`unlimited.bond · ${jobCode} · Page ${page} of ${pageCount}`, PAGE.left, 806, { width: PAGE.right - PAGE.left, align: "center" });
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number, mode: "client" | "internal") {
  if (y + needed <= PAGE.bottom - 30) return y;
  doc.addPage();
  if (mode === "internal") watermark(doc);
  return PAGE.top;
}

function watermark(doc: PDFKit.PDFDocument) {
  doc.save().rotate(-35, { origin: [300, 390] }).font("Helvetica-Bold").fontSize(54).fillColor("#eeeeee").text("INTERNAL", 82, 360).restore();
}

function sectionRows(revision: FullRevision, mode: "client" | "internal") {
  return revision.sections
    .filter((section) => section.isVisible)
    .map((section) => ({
      section,
      lines: section.lineItems.filter((line) => !line.isSubItem && (mode === "internal" || line.estimatedTotal > 0)),
    }))
    .filter((item) => item.lines.length > 0);
}

async function renderPdf(revision: FullRevision, mode: "client" | "internal") {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const totals = calculateRevisionTotalsFromRevision(revision);
  const budget = revision.budget;
  const production = budget.production;
  const opportunity = budget.opportunity;
  const jobCode = production?.jobCode ?? "BID";
  const client = production?.clientName ?? opportunity?.clientName ?? "Client";
  const brand = production?.brand ?? opportunity?.brand ?? "";
  const projectName = budget.jobName ?? production?.title ?? opportunity?.title ?? brand;
  const version = revisionVersionLabel(revision);
  const generated = dateString(new Date());
  const validUntil = dateString(revision.validUntil) || "";
  const representative = revision.representative || "Conor Bond";
  const description = revision.estimateDescription || budget.comments || "";
  const included = cleanLines(revision.includedNotes || budget.comments);
  const notIncluded = cleanLines(revision.notIncludedNotes || budget.caveats);
  const assumptions = cleanLines(revision.assumptions || revision.notes);
  const paymentTerms = revision.paymentTerms || "50% deposit required before shoot.";

  doc.font("Helvetica-Bold").fontSize(29).fillColor(TEXT).text("unlimited.bond", PAGE.left, 84);
  doc.font("Helvetica-Bold").fontSize(18).text("ESTIMATE", 420, 92, { width: 120, align: "right" });

  let y = 154;
  const colA = PAGE.left;
  const colB = 230;
  const colC = 410;
  detailPair(doc, "Client", client, colA, y, 170);
  detailPair(doc, "Client Contact", client, colA, y + 15, 170);
  detailPair(doc, "Client Email", "", colA, y + 30, 170);
  detailPair(doc, "Client Notes", budget.comments ?? "", colA, y + 45, 170);
  detailPair(doc, "Accounting Contact", budget.accountingContact ?? "", colB, y, 170);
  detailPair(doc, "Accounting Email", "", colB, y + 15, 170);
  detailPair(doc, "Billing Address", "", colB, y + 30, 170);
  detailPair(doc, "Date", generated, colC, y, 140);
  detailPair(doc, "Estimate Version", version, colC, y + 15, 140);
  detailPair(doc, "Job Number", jobCode, colC, y + 30, 140);
  detailPair(doc, "Representative", representative, colC, y + 45, 140);
  detailPair(doc, "Generated", generated, colC, y + 60, 140);
  detailPair(doc, "Valid Until", validUntil, colC, y + 75, 140);

  drawRule(doc, 256);
  y = 274;
  detailPair(doc, "Artist", budget.photographerDirector ?? "", PAGE.left, y, 420);
  detailPair(doc, "Job Name", projectName ?? "", PAGE.left, y + 15, 420);
  detailPair(doc, "Job Location", budget.jobLocation ?? "", PAGE.left, y + 30, 420);
  detailPair(doc, "Production Dates", budget.shootDates ?? "", PAGE.left, y + 45, 420);
  detailPair(doc, "Prep / Travel", budget.prepTravelDate ?? "", PAGE.left, y + 60, 420);
  detailPair(doc, "Shot Count", budget.shotCount ?? "", PAGE.left, y + 75, 420);
  detailPair(doc, "Deliverables", description, PAGE.left, y + 90, 420);
  detailPair(doc, "Usage", budget.usages ?? "", PAGE.left, y + 105, 420);

  drawRule(doc, 410);
  y = 432;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text("SUMMARY OF FIRM BID PRODUCTION EXPENSES", PAGE.left, y);
  y += 17;
  for (const section of totals.sectionTotals.filter((item) => item.estimatedTotal > 0)) {
    doc.font("Helvetica").fontSize(8).fillColor(TEXT).text(`${section.code}. ${section.name}`, PAGE.left, y, { width: 330 });
    doc.text(money(section.estimatedTotal), 430, y, { width: 110, align: "right" });
    y += 13;
  }
  y += 6;
  doc.rect(PAGE.left, y, 490, 0.6).fill(TEXT);
  y += 10;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text("SUBTOTAL", 330, y, { width: 100, align: "right" });
  doc.text(money(totals.subtotal), 430, y, { width: 110, align: "right" });
  y += 13;
  doc.text(`PRODUCTION FEE ${percent(revision.productionFeePercent)}`, 330, y, { width: 100, align: "right" });
  doc.text(money(totals.productionFee), 430, y, { width: 110, align: "right" });
  y += 13;
  if (revision.insurancePercent > 0) {
    doc.text(`INSURANCE ${percent(revision.insurancePercent)}`, 330, y, { width: 100, align: "right" });
    doc.text(money(totals.insurance), 430, y, { width: 110, align: "right" });
    y += 13;
  }
  doc.fontSize(9).text("TOTAL ESTIMATED PRODUCTION EXPENSES", 260, y, { width: 170, align: "right" });
  doc.text(money(totals.grandTotal), 430, y, { width: 110, align: "right" });
  y += 20;
  const advanceTotal = totals.advances.reduce((sum, advance) => sum + advance.calculatedAmount, 0);
  if (advanceTotal > 0) {
    doc.text("ADVANCE DUE", 330, y, { width: 100, align: "right" });
    doc.text(money(advanceTotal), 430, y, { width: 110, align: "right" });
  }

  const infoTop = 620;
  doc.rect(PAGE.left, infoTop, 490, 74).strokeColor("#222").lineWidth(0.45).stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("COMMENTS", PAGE.left + 8, infoTop + 10, { width: 58 });
  doc.font("Helvetica").fontSize(7.5).fillColor(TEXT).text(
    [...included.map((line) => `+ ${line}`), ...notIncluded.map((line) => `- ${line}`), ...assumptions.map((line) => `• ${line}`)].slice(0, 10).join("\n") || "All costs are based on current brief and confirmed teams.",
    PAGE.left + 78,
    infoTop + 10,
    { width: 390, lineGap: 2 }
  );
  doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("Payment Terms", 330, 710, { width: 90 });
  doc.font("Helvetica").text(paymentTerms, 420, 710, { width: 120 });

  const blocks = sectionRows(revision, mode);
  doc.addPage();
  if (mode === "internal") watermark(doc);
  y = PAGE.top;
  doc.font("Helvetica-Bold").fontSize(14).fillColor(TEXT).text("Estimate breakdown", PAGE.left, y);
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${client}${brand ? ` · ${brand}` : ""} · ${version}`, PAGE.left, y + 18);
  y += 44;

  for (const { section, lines } of blocks) {
    y = ensureSpace(doc, y, 48 + lines.length * 13, mode);
    doc.rect(PAGE.left, y, 490, 17).fill("#111111");
    const sectionTotal = totals.sectionTotals.find((item) => item.sectionId === section.id)?.estimatedTotal ?? 0;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff").text(`${section.code}. ${section.name}`, PAGE.left + 6, y + 5, { width: 330 });
    doc.text(money(sectionTotal), 430, y + 5, { width: 104, align: "right" });
    y += 21;

    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(MUTED);
    doc.text("DESCRIPTION", PAGE.left + 6, y);
    doc.text("QTY", 286, y, { width: 30, align: "right" });
    doc.text("UNIT", 322, y, { width: 54, align: "right" });
    doc.text("RATE", 384, y, { width: 60, align: "right" });
    doc.text(mode === "internal" ? "ACTUAL" : "BUDGET", 466, y, { width: 68, align: "right" });
    y += 10;

    for (const line of lines) {
      y = ensureSpace(doc, y, line.clientNotes && mode === "client" ? 24 : 14, mode);
      doc.rect(PAGE.left, y - 2, 490, 0.35).fill("#d9d9d4");
      doc.font("Helvetica").fontSize(7.4).fillColor(TEXT).text(`${line.lineCode}  ${line.description}`, PAGE.left + 6, y, { width: 260, ellipsis: true });
      doc.text(String(line.qty || ""), 286, y, { width: 30, align: "right" });
      doc.text(line.unit === "Flat Fee" ? "Flat Fee" : `${line.days} ${line.unit}`, 322, y, { width: 54, align: "right" });
      doc.text(money(line.rate), 384, y, { width: 60, align: "right" });
      doc.font("Helvetica-Bold").text(money(mode === "internal" ? line.actualTotal : line.estimatedTotal), 466, y, { width: 68, align: "right" });
      y += 12;
      if (line.clientNotes && mode === "client") {
        doc.font("Helvetica-Oblique").fontSize(6.6).fillColor(MUTED).text(line.clientNotes, PAGE.left + 22, y - 1, { width: 260, ellipsis: true });
        y += 10;
      }
    }
    y += 8;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    footer(doc, i + 1, range.count, jobCode);
  }

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function exportRevisionPdf(revisionId: string, mode: "client" | "internal") {
  const loaded = await getRevision(revisionId);
  if (!loaded) throw new Error("Revision not found");
  const revision = loaded as FullRevision & { totals: ReturnType<typeof calculateRevisionTotalsFromRevision> };
  const budget = revision.budget;
  const nextVersion = budget.version + 1;
  await prisma.budget.update({ where: { id: budget.id }, data: { version: nextVersion } });
  const pdfBuffer = await renderPdf(revision, mode);
  const jobCode = budget.production?.jobCode ?? "BID";
  const filename = `${jobCode}_Estimate_${revisionVersionLabel(revision)}_${mode}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (!budget.productionId) {
    return {
      id: `generated-${revisionId}`,
      originalFilename: filename,
      storedFilename: filename,
      mimeType: "application/pdf",
      sizeBytes: pdfBuffer.byteLength,
      contentBase64: pdfBuffer.toString("base64"),
    };
  }

  return autoFileDocument(budget.productionId, "Estimates", pdfBuffer, filename, "application/pdf");
}
