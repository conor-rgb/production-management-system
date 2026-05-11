import PDFDocument from "pdfkit";
import prisma from "../prisma";
import { autoFileDocument } from "./fileStorage";
import { calculateRevisionTotalsFromRevision, FullRevision, getRevision } from "./budgetService";

function money(value: number): string {
  if (value === 0) return "£      -";
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: number): string {
  return `${value.toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

function writePair(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number) {
  doc.font("Helvetica").fontSize(8).fillColor("#555").text(label, x, y, { width: 86 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(value || "-", x + 90, y, { width: 170 });
}

async function renderPdf(revision: FullRevision, mode: "client" | "internal") {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 38, size: "A4", bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const totals = calculateRevisionTotalsFromRevision(revision);
  const budget = revision.budget;
  const production = budget.production;
  const opportunity = budget.opportunity;
  const jobCode = production?.jobCode ?? "BID";
  const client = production?.clientName ?? opportunity?.clientName ?? "Client";
  const brand = production?.brand ?? opportunity?.brand ?? "";
  const jobName = budget.jobName ?? production?.title ?? opportunity?.title ?? brand;
  const bidDate = new Date().toLocaleDateString("en-GB");

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#111").text("unlimited.bond", 38, 38);
  doc.fontSize(16).text(`ESTIMATE V${budget.version}`, 380, 38, { width: 170, align: "right" });
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff").rect(430, 62, 120, 18).fill("#1a1a1f");
  doc.text(`STATUS: ${budget.status.replace(/_/g, " ")}`, 438, 67, { width: 104, align: "center" });
  doc.fillColor("#111").moveDown(2);

  doc.font("Helvetica-Bold").fontSize(11).text("PROJECT DETAILS", 38, 100);
  const leftY = 126;
  writePair(doc, "Client:", client, 38, leftY);
  writePair(doc, "Billing Address:", "", 38, leftY + 18);
  writePair(doc, "Contact:", "", 38, leftY + 36);
  writePair(doc, "Phone:", "", 38, leftY + 54);
  writePair(doc, "Email:", "", 38, leftY + 72);
  writePair(doc, "Accounting:", budget.accountingContact ?? "", 38, leftY + 90);
  writePair(doc, "Bid Date:", bidDate, 310, leftY);
  writePair(doc, "Job Name/Ref:", jobName ?? "", 310, leftY + 18);
  writePair(doc, "Location:", budget.jobLocation ?? "", 310, leftY + 36);
  writePair(doc, "Shot Count:", budget.shotCount ?? "", 310, leftY + 54);
  writePair(doc, "Prep/Travel:", budget.prepTravelDate ?? "", 310, leftY + 72);
  writePair(doc, "Shoot Dates:", budget.shootDates ?? "", 310, leftY + 90);
  writePair(doc, "Phot/Director:", budget.photographerDirector ?? "", 310, leftY + 108);

  let y = 270;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text("SUMMARY OF FIRM BID PRODUCTION EXPENSES:", 38, y);
  y += 22;
  for (const section of totals.sectionTotals.filter((item) => item.estimatedTotal > 0)) {
    doc.font("Helvetica").fontSize(9).fillColor("#111").text(`${section.code}. ${section.name}`, 56, y, { width: 330 });
    doc.font("Helvetica").text(money(section.estimatedTotal), 420, y, { width: 110, align: "right" });
    y += 16;
  }
  y += 6;
  doc.moveTo(400, y).lineTo(532, y).strokeColor("#888").stroke();
  y += 10;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text("SUBTOTAL", 56, y);
  doc.text(money(totals.subtotal), 420, y, { width: 110, align: "right" });
  y += 16;
  doc.text(`PRODUCTION FEE ${percent(revision.productionFeePercent)}`, 56, y);
  doc.text(money(totals.productionFee), 420, y, { width: 110, align: "right" });
  y += 16;
  if (revision.insurancePercent > 0) {
    doc.text(`INSURANCE ${percent(revision.insurancePercent)}`, 56, y);
    doc.text(money(totals.insurance), 420, y, { width: 110, align: "right" });
    y += 16;
  }
  doc.moveTo(400, y).lineTo(532, y).lineWidth(1.5).strokeColor("#111").stroke();
  y += 10;
  doc.fontSize(10).text("TOTAL ESTIMATED PRODUCTION EXPENSES", 56, y);
  doc.text(money(totals.grandTotal), 400, y, { width: 130, align: "right" });
  y += 22;
  if (budget.currencySecondary && totals.currencyConverted) {
    doc.font("Helvetica").fontSize(9).text(`TOTAL IN ${budget.currencySecondary} (@ ${budget.currencyRate ?? 0})`, 56, y);
    doc.text(totals.currencyConverted.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 400, y, { width: 130, align: "right" });
    y += 20;
  }
  for (const advance of budget.advanceInvoices) {
    const calculated = totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? 0;
    doc.font("Helvetica-Bold").fontSize(9).text(advance.label.toUpperCase(), 56, y);
    doc.text(money(calculated), 400, y, { width: 130, align: "right" });
    y += 16;
  }

  if (budget.comments) {
    y += 16;
    doc.font("Helvetica-Bold").fontSize(10).text("COMMENTS:", 38, y);
    doc.font("Helvetica").fontSize(9).text(budget.comments, 38, y + 14, { width: 500 });
  }

  doc.font("Helvetica-Bold").fontSize(10).text("CONFIRMATION:", 38, 660);
  doc.font("Helvetica").fontSize(9).text("Signed: _________________________ Date: _____________", 38, 690);
  doc.text("For and on behalf of: unlimited.bond / BOND UN LIMITED", 38, 708);
  doc.text("I have read and agreed to your Terms & Conditions.", 38, 740);
  doc.text("Signed: _________________________ Date: _____________", 38, 760);
  doc.text(`For and on behalf of: ${client}`, 38, 778);

  for (const section of revision.sections.filter((item) => item.isVisible)) {
    const sectionTotal = totals.sectionTotals.find((item) => item.sectionId === section.id);
    if (!sectionTotal || sectionTotal.estimatedTotal === 0) continue;
    doc.addPage();
    if (mode === "internal") {
      doc.save().rotate(-35, { origin: [280, 380] }).fontSize(54).fillColor("#eeeeee").text("INTERNAL", 80, 360).restore();
    }
    let rowY = 44;
    doc.rect(38, rowY, 520, 20).fill("#1a1a1f");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff").text(`${section.code}. ${section.name}`, 48, rowY + 6, { width: 330 });
    doc.text(money(sectionTotal.estimatedTotal), 430, rowY + 6, { width: 110, align: "right" });
    rowY += 30;
    doc.fillColor("#555").fontSize(7);
    if (mode === "internal") {
      doc.text("DESCRIPTION", 44, rowY);
      doc.text("QTY", 234, rowY, { width: 28, align: "right" });
      doc.text("UNIT", 268, rowY, { width: 50, align: "right" });
      doc.text("RATE", 322, rowY, { width: 58, align: "right" });
      doc.text("AGY%", 384, rowY, { width: 32, align: "right" });
      doc.text("EST.", 420, rowY, { width: 52, align: "right" });
      doc.text("ACT.", 476, rowY, { width: 46, align: "right" });
      doc.text("REM.", 526, rowY, { width: 32, align: "right" });
    } else {
      doc.text("DESCRIPTION", 44, rowY);
      doc.text("QTY", 310, rowY, { width: 40, align: "right" });
      doc.text("UNIT", 354, rowY, { width: 62, align: "right" });
      doc.text("RATE", 420, rowY, { width: 60, align: "right" });
      doc.text("BUDGET", 486, rowY, { width: 58, align: "right" });
    }
    rowY += 14;

    for (const line of section.lineItems.filter((item) => !item.isSubItem)) {
      if (line.estimatedTotal === 0 && mode === "client") continue;
      doc.fillColor("#111").font("Helvetica").fontSize(8).text(`${line.lineCode} ${line.description}`, 44, rowY, { width: mode === "internal" ? 160 : 250 });
      if (line.clientNotes && mode === "client") {
        doc.font("Helvetica-Oblique").fillColor("#666").text(line.clientNotes, 64, rowY + 10, { width: 230 });
      }
      doc.fillColor("#111").font("Helvetica").fontSize(8);
      if (mode === "internal") {
        doc.text(String(line.qty), 234, rowY, { width: 28, align: "right" });
        doc.text(line.unit === "Flat Fee" ? "Flat Fee" : `${line.days} ${line.unit}`, 268, rowY, { width: 50, align: "right" });
        doc.text(money(line.rate), 322, rowY, { width: 58, align: "right" });
        doc.text(percent(line.agencyFeePercent ?? 0), 384, rowY, { width: 32, align: "right" });
        doc.text(money(line.estimatedTotal), 420, rowY, { width: 52, align: "right" });
        doc.text(money(line.actualTotal), 476, rowY, { width: 46, align: "right" });
        doc.text(money(line.variance), 526, rowY, { width: 32, align: "right" });
      } else {
        doc.text(String(line.qty), 310, rowY, { width: 40, align: "right" });
        doc.text(line.unit === "Flat Fee" ? "Flat Fee" : `${line.days} ${line.unit}`, 354, rowY, { width: 62, align: "right" });
        doc.text(money(line.rate), 420, rowY, { width: 60, align: "right" });
        doc.text(money(line.estimatedTotal), 486, rowY, { width: 58, align: "right" });
      }
      rowY += line.clientNotes && mode === "client" ? 25 : 16;
      if (rowY > 760) {
        doc.addPage();
        rowY = 44;
      }
    }
  }

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text("Summary", 38, 44);
  let summaryY = 80;
  for (const section of totals.sectionTotals.filter((item) => item.estimatedTotal > 0)) {
    doc.font("Helvetica").fontSize(9).text(`${section.code}. ${section.name}`, 56, summaryY, { width: 330 });
    doc.text(money(section.estimatedTotal), 420, summaryY, { width: 110, align: "right" });
    summaryY += 16;
  }
  summaryY += 10;
  doc.font("Helvetica-Bold").text("SUBTOTAL", 56, summaryY);
  doc.text(money(totals.subtotal), 420, summaryY, { width: 110, align: "right" });
  summaryY += 16;
  doc.text(`PRODUCTION FEE ${percent(revision.productionFeePercent)}`, 56, summaryY);
  doc.text(money(totals.productionFee), 420, summaryY, { width: 110, align: "right" });
  summaryY += 16;
  if (revision.insurancePercent > 0) {
    doc.text(`INSURANCE ${percent(revision.insurancePercent)}`, 56, summaryY);
    doc.text(money(totals.insurance), 420, summaryY, { width: 110, align: "right" });
    summaryY += 16;
  }
  doc.fontSize(11).text("GRAND TOTAL", 56, summaryY);
  doc.text(money(totals.grandTotal), 400, summaryY, { width: 130, align: "right" });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor("#777").text(
      `unlimited.bond | VAT GB 493336372 | ${jobCode} | R${revision.revisionNumber} | Page ${i + 1} of ${range.count}`,
      38,
      808,
      { width: 520, align: "center" }
    );
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
  const filename = `${jobCode}_Estimate_R${revision.revisionNumber}_V${nextVersion}_${mode}.pdf`;

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
