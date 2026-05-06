import PDFDocument from "pdfkit";
import { BudgetRevisionStatus } from "@prisma/client";
import prisma from "../prisma";
import { autoFileDocument } from "./fileStorage";
import { calculateRevisionTotalsFromRevision, FullRevision, getRevision } from "./budgetService";

function money(value: number) {
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusLabel(status: BudgetRevisionStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

async function renderPdf(revision: FullRevision, mode: "client" | "internal") {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 42, size: "A4", bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const totals = calculateRevisionTotalsFromRevision(revision);
  const production = revision.budget.production;
  const opportunity = revision.budget.opportunity;
  const jobCode = production?.jobCode ?? "BID";
  const client = production?.clientName ?? opportunity?.clientName ?? "Client";
  const brand = production?.brand ?? opportunity?.brand ?? "";

  doc.fontSize(24).text("unlimited.bond", { continued: false });
  doc.moveDown(1.5);
  doc.fontSize(20).text(`${jobCode} ${client}`);
  if (brand) doc.fontSize(15).fillColor("#555").text(brand).fillColor("#000");
  doc.moveDown();
  doc.fontSize(13).text(`ESTIMATE — REVISION ${revision.revisionNumber} — V${revision.version}`);
  doc.text(`${revision.label} — ${statusLabel(revision.status)}`);
  doc.text(new Date().toLocaleDateString("en-GB"));
  doc.moveDown();
  doc.fontSize(10).text("BOND UN LIMITED");
  doc.text("VAT GB 493336372");
  doc.text("Company number 16215041");
  doc.addPage();

  for (const section of revision.sections) {
    if (section.lineItems.length === 0) continue;
    const sectionTotal = section.lineItems.reduce((sum, line) => sum + line.clientSubtotal, 0);
    if (mode === "internal") {
      doc.save().rotate(-35, { origin: [280, 380] }).fontSize(54).fillColor("#eeeeee").text("INTERNAL", 80, 360).restore().fillColor("#000");
    }
    doc.fontSize(13).fillColor("#111").text(`${section.code}) ${section.name}`, { continued: true });
    doc.text(money(sectionTotal), { align: "right" });
    doc.moveDown(0.4);

    for (const line of section.lineItems) {
      const left = `${line.lineCode}  ${line.description}`;
      if (mode === "client") {
        doc.fontSize(9).text(left, 42, doc.y, { width: 250, continued: false });
        doc.text(`${money(line.clientUnitCost)}  x ${line.quantity} x ${line.daysUnits} ${line.unitLabel}`, 315, doc.y - 11, { width: 130 });
        doc.text(money(line.clientSubtotal), 455, doc.y - 11, { width: 90, align: "right" });
      } else {
        doc.fontSize(8).text(left, 42, doc.y, { width: 160 });
        doc.text(money(line.internalUnitCost), 210, doc.y - 10, { width: 60, align: "right" });
        doc.text(money(line.clientUnitCost), 275, doc.y - 10, { width: 60, align: "right" });
        doc.text(money(line.agencyMarkup), 340, doc.y - 10, { width: 55, align: "right" });
        doc.text(money(line.internalSubtotal), 400, doc.y - 10, { width: 60, align: "right" });
        doc.text(money(line.clientSubtotal), 465, doc.y - 10, { width: 60, align: "right" });
        doc.text(String(line.invoices.length), 530, doc.y - 10, { width: 25, align: "right" });
      }
      if (line.publicMemo && mode === "client") doc.fontSize(8).fillColor("#666").text(line.publicMemo, 64).fillColor("#000");
      doc.moveDown(0.3);
    }
    doc.moveDown();
  }

  doc.addPage();
  doc.fontSize(16).text("Summary");
  doc.moveDown();
  for (const section of totals.sectionTotals.filter((item) => item.clientTotal > 0)) {
    doc.fontSize(10).text(`${section.code}) ${section.name}`, { continued: true });
    doc.text(money(section.clientTotal), { align: "right" });
  }
  doc.moveDown();
  if (mode === "internal") {
    doc.text(`Internal total: ${money(totals.internalTotal)}`);
    doc.text(`Actual total: ${money(totals.actualTotal ?? totals.totalCommitted ?? 0)}`);
    doc.text(`Variance: ${money(totals.variance ?? totals.totalRemaining ?? 0)}`);
  }
  doc.text(`Fees total: ${money(totals.clientTotal)}`);
  doc.text(`Production fee ${revision.productionFeePercent}%: ${money(totals.productionFeeAmount)}`);
  doc.fontSize(14).text(`Subtotal: ${money(totals.clientGrandTotal)}`);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor("#777").text(
      `unlimited.bond | VAT GB 493336372 | ${jobCode} | ${revision.label} | Page ${i + 1} of ${range.count}`,
      42,
      805,
      { align: "center" }
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
  if (!revision.budget.productionId) throw new Error("PDF export requires a production budget");

  const nextVersion = revision.version + 1;
  await prisma.budgetRevision.update({ where: { id: revisionId }, data: { version: nextVersion } });
  const pdfBuffer = await renderPdf({ ...revision, version: nextVersion }, mode);
  const jobCode = revision.budget.production?.jobCode ?? "BID";
  const filename = `${jobCode}_Estimate_R${revision.revisionNumber}_V${nextVersion}_${mode}.pdf`;
  return autoFileDocument(revision.budget.productionId, "Estimates", pdfBuffer, filename, "application/pdf");
}
