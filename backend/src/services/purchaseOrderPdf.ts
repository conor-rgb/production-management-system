import PDFDocument from "pdfkit";
import prisma from "../prisma";
import { autoFileDocument } from "./fileStorage";
import { createDraftWithJobFile, createPlainDraft } from "./emailDraftService";
import { drawBrandLogo } from "./pdfBrand";

const PAGE = { left: 52, right: 543, top: 58, bottom: 780 };
const TEXT = "#111111";
const MUTED = "#5f5f5f";
const SOFT = "#f6f5f1";
const LINE = "#111111";
const HAIRLINE = "#d9d9d4";

type PurchaseOrderDocument = NonNullable<Awaited<ReturnType<typeof loadPurchaseOrder>>>;

function money(value: number): string {
  return `£${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateString(value?: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB");
}

function cleanFilenamePart(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\\/:\*\?"<>\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Supplier";
}

function drawRule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).lineWidth(0.65).strokeColor(LINE).stroke();
}

function detailPair(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 210) {
  doc.font("Helvetica-Bold").fontSize(7.4).fillColor(TEXT).text(label, x, y, { width: 72 });
  doc.font("Helvetica").fontSize(8).fillColor(TEXT).text(value || "-", x + 78, y, { width: width - 78, lineGap: 1.5 });
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number) {
  if (y + needed <= 715) return y;
  doc.addPage();
  return PAGE.top;
}

function cleanLines(value?: string | null): string[] {
  return (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  drawRule(doc, y);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text(title.toUpperCase(), PAGE.left, y + 14);
}

function confirmationNote(po: PurchaseOrderDocument): string {
  return `Please quote ${po.poNumber} on invoices and correspondence. This purchase order confirms the agreed supplier scope and cost only; any changes must be confirmed in writing before additional work is undertaken.`;
}

function loadPurchaseOrder(purchaseOrderId: string) {
  return prisma.purchaseOrderGroup.findUnique({
    where: { id: purchaseOrderId },
    include: {
      production: true,
      budget: true,
      allocations: {
        orderBy: { createdAt: "asc" },
        include: {
          lineItem: {
            select: {
              lineCode: true,
              description: true,
              section: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  });
}

async function renderPurchaseOrderPdf(po: PurchaseOrderDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const total = po.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  const jobCode = po.production.jobCode ?? "JOB";
  const projectName = po.budget?.jobName || po.production.title || [po.production.clientName, po.production.brand].filter(Boolean).join(" ");
  const generated = dateString(new Date());
  const shootDetails = [
    po.budget?.shootDates ? `Shoot dates: ${po.budget.shootDates}` : null,
    po.budget?.prepTravelDate ? `Prep / travel: ${po.budget.prepTravelDate}` : null,
  ].filter(Boolean).join("\n");
  const bookingNotes = [
    ...cleanLines(po.notes),
    ...cleanLines(po.production.notes),
  ].slice(0, 12);

  drawBrandLogo(doc, PAGE.left, 76, 285);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXT).text("PURCHASE ORDER", 420, 88, { width: 120, align: "right", characterSpacing: 1.6 });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Supplier confirmation", 420, 105, { width: 120, align: "right" });

  let y = 154;
  const colA = PAGE.left;
  const colB = 220;
  const colC = 410;
  detailPair(doc, "To", po.supplierName, colA, y, 170);
  detailPair(doc, "Supplier Email", po.supplierEmail ?? "", colA, y + 15, 170);
  detailPair(doc, "Supplier Phone", po.supplierPhone ?? "", colA, y + 30, 170);
  detailPair(doc, "From", "Conor Bond", colB, y, 190);
  detailPair(doc, "Company", "unlimited.bond", colB, y + 15, 190);
  doc.font("Helvetica-Bold").fontSize(7.4).fillColor(TEXT).text("Billing Email", colB, y + 30, { width: 72 });
  doc.font("Helvetica").fontSize(7.2).fillColor(TEXT).text("invoices@unlimited.bond", colB + 78, y + 30, { width: 122 });
  detailPair(doc, "PO Number", po.poNumber, colC, y, 140);
  detailPair(doc, "Date", generated, colC, y + 15, 140);
  detailPair(doc, "Job Number", jobCode, colC, y + 30, 140);
  detailPair(doc, "Status", po.status.replace(/_/g, " "), colC, y + 45, 140);

  sectionTitle(doc, "Confirmation details", 244);
  y = 276;
  detailPair(doc, "Client", po.production.clientName ?? "", PAGE.left, y, 220);
  detailPair(doc, "Brand", po.production.brand ?? "", PAGE.left, y + 15, 220);
  detailPair(doc, "Shoot Name", projectName, PAGE.left, y + 30, 410);
  detailPair(doc, "Shoot Member", po.budget?.photographerDirector ?? "", PAGE.left, y + 45, 410);
  detailPair(doc, "Session Details", shootDetails, PAGE.left, y + 60, 410);
  detailPair(doc, "Location(s)", po.budget?.jobLocation ?? "", PAGE.left, y + 90, 410);
  detailPair(doc, "Usage", po.budget?.usages ?? "", PAGE.left, y + 105, 410);

  y = 410;
  doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 48).fill(SOFT);
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(MUTED).text("OUR REFERENCE", PAGE.left + 12, y + 11, { width: 120 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text(po.poNumber, PAGE.left + 12, y + 25, { width: 160 });
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(MUTED).text("CURRENCY", 220, y + 11, { width: 80 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text("GBP Sterling", 220, y + 25, { width: 120 });
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(MUTED).text("TOTAL AGREED", 395, y + 11, { width: 120, align: "right" });
  doc.font("Helvetica-Bold").fontSize(13).fillColor(TEXT).text(money(total), 395, y + 24, { width: 120, align: "right" });

  y = 490;
  sectionTitle(doc, "Agreed line item breakdown", y);
  y += 42;
  doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 17).fill(TEXT);
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor("#ffffff");
  doc.text("AGREED LINE ITEM", PAGE.left + 7, y + 5, { width: 258 });
  doc.text("BUDGET SECTION", 318, y + 5, { width: 110 });
  doc.text("AMOUNT", 438, y + 5, { width: 95, align: "right" });
  y += 25;

  for (const allocation of po.allocations) {
    const lineTitle = `${allocation.lineItem.lineCode} ${allocation.lineItem.description}`;
    const description = allocation.description && allocation.description !== `${po.supplierName} PO allocation`
      ? allocation.description
      : lineTitle;
    const section = `${allocation.lineItem.section.code} ${allocation.lineItem.section.name}`;
    const rowHeight = Math.max(
      22,
      doc.heightOfString(description, { width: 258 }) + 13,
      doc.heightOfString(section, { width: 110 }) + 13
    );
    y = ensureSpace(doc, y, rowHeight + 8);
    doc.rect(PAGE.left, y - 3, PAGE.right - PAGE.left, 0.35).fill(HAIRLINE);
    doc.font("Helvetica").fontSize(7.8).fillColor(TEXT).text(description, PAGE.left + 7, y, { width: 258, lineGap: 1 });
    doc.font("Helvetica").fontSize(7.4).fillColor(MUTED).text(section, 318, y, { width: 110, lineGap: 1 });
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text(money(Number(allocation.amount ?? 0)), 438, y, { width: 95, align: "right" });
    y += rowHeight;
  }

  y += 8;
  doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 0.65).fill(TEXT);
  y += 12;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT).text("TOTAL", 340, y, { width: 90, align: "right" });
  doc.font("Helvetica-Bold").fontSize(10).text(money(total), 438, y - 1, { width: 95, align: "right" });
  y += 34;

  y = ensureSpace(doc, y, 104);
  doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 94).strokeColor(TEXT).lineWidth(0.45).stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("INVOICING INSTRUCTIONS", PAGE.left + 10, y + 10, { width: 120 });
  doc.font("Helvetica").fontSize(8).fillColor(TEXT).text(
    [
      "Please send invoices to invoices@unlimited.bond.",
      `Include ${po.poNumber} as the invoice reference.`,
      "Billing address: BOND UN LIMITED, 128 City Road, London EC1V 2NX, England, United Kingdom.",
      "Invoices should match the agreed line item breakdown above unless a revised PO is issued.",
    ].join("\n"),
    PAGE.left + 150,
    y + 10,
    { width: PAGE.right - PAGE.left - 165, lineGap: 2.2 }
  );
  y += 110;

  y = ensureSpace(doc, y, 88);
  doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 74).strokeColor(TEXT).lineWidth(0.45).stroke();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("NOTES / ACCEPTANCE", PAGE.left + 10, y + 10, { width: 120 });
  doc.font("Helvetica").fontSize(7.8).fillColor(TEXT).text(
    [...bookingNotes, confirmationNote(po)].join("\n") || confirmationNote(po),
    PAGE.left + 150,
    y + 10,
    { width: PAGE.right - PAGE.left - 165, lineGap: 2 }
  );
  y += 88;

  if (po.budget?.comments?.trim() || po.budget?.caveats?.trim()) {
    y = ensureSpace(doc, y, 78);
    doc.rect(PAGE.left, y, PAGE.right - PAGE.left, 68).strokeColor(HAIRLINE).lineWidth(0.45).stroke();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(TEXT).text("PRODUCTION COMMENTS", PAGE.left + 10, y + 10, { width: 120 });
    doc.font("Helvetica").fontSize(7.5).fillColor(TEXT).text(
      cleanLines([po.budget.comments, po.budget.caveats].filter(Boolean).join("\n")).slice(0, 8).join("\n"),
      PAGE.left + 150,
      y + 10,
      { width: PAGE.right - PAGE.left - 165, lineGap: 2 }
    );
  }

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    drawRule(doc, 742);
    doc.font("Helvetica").fontSize(7).fillColor(TEXT).text(
      "BOND UN LIMITED | 128 City Road | London EC1V 2NX, England, United Kingdom | Tel: +44 (0) 7711 825 340 | VAT Number: GB 493336372 | Company Number: 16215041",
      PAGE.left,
      758,
      { width: PAGE.right - PAGE.left }
    );
    doc.fontSize(7).fillColor(MUTED).text(`${po.poNumber} · Page ${index + 1} of ${range.count}`, PAGE.left, 806, { width: PAGE.right - PAGE.left, align: "center" });
  }

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function exportPurchaseOrderPdf(purchaseOrderId: string) {
  const po = await loadPurchaseOrder(purchaseOrderId);
  if (!po) throw new Error("PO not found");
  if (!po.allocations.length) throw new Error("PO has no agreed line items");

  const pdfBuffer = await renderPurchaseOrderPdf(po);
  const filename = `${po.poNumber}_${cleanFilenamePart(po.supplierName)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return autoFileDocument(po.productionId, "Budgets", pdfBuffer, filename, "application/pdf", {
    notes: `Purchase order document for ${po.poNumber}`,
    linkedBudgetLineId: po.allocations[0]?.lineItemId,
  });
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_URL ?? "https://agent.unlimited.bond").replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[char] ?? char));
}

export async function createPurchaseOrderEmailDraft(purchaseOrderId: string) {
  const po = await prisma.purchaseOrderGroup.findUnique({
    where: { id: purchaseOrderId },
    include: {
      production: true,
      blackbookEntry: true,
      allocations: { include: { lineItem: { select: { lineCode: true, description: true } } } },
    },
  });
  if (!po) throw new Error("PO not found");
  const email = (po.supplierEmail ?? po.blackbookEntry?.email ?? "").trim();
  if (!email) throw new Error("Supplier email is required");

  const file = await exportPurchaseOrderPdf(po.id);
  const total = po.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  const lines = po.allocations
    .map((allocation) => `<li>${escapeHtml(allocation.lineItem.lineCode)} ${escapeHtml(allocation.lineItem.description)}: ${money(Number(allocation.amount ?? 0))}</li>`)
    .join("");
  const project = po.production.title || [po.production.clientName, po.production.brand].filter(Boolean).join(" ");
  const bodyHtml = `
    <p>Hi ${escapeHtml(po.supplierName)},</p>
    <p>Please find attached purchase order <strong>${escapeHtml(po.poNumber)}</strong> for <strong>${escapeHtml(project)}</strong>.</p>
    <p>Total agreed amount: <strong>${money(total)}</strong>.</p>
    <ul>${lines}</ul>
    ${po.notes?.trim() ? `<p><strong>Notes:</strong><br>${escapeHtml(po.notes).replace(/\n/g, "<br>")}</p>` : ""}
    <p><strong>Billing instructions:</strong><br>
    Please send invoices to <a href="mailto:invoices@unlimited.bond">invoices@unlimited.bond</a> and include <strong>${escapeHtml(po.poNumber)}</strong> as the invoice reference.</p>
    <p>Please confirm receipt and let me know if anything needs adjusting.</p>
    <p>Best,<br>Conor</p>
  `;

  return createDraftWithJobFile({
    to: [email.toLowerCase()],
    subject: `${po.poNumber} purchase order · ${project}`,
    bodyHtml,
    linkedProductionId: po.productionId,
    jobFileId: file.id,
  });
}

export async function createSupplierOnboardingDraft(purchaseOrderId: string, onboardingUrl: string) {
  const po = await prisma.purchaseOrderGroup.findUnique({
    where: { id: purchaseOrderId },
    include: { production: true, allocations: true },
  });
  if (!po) throw new Error("PO not found");
  const email = (po.supplierEmail ?? "").trim();
  if (!email) throw new Error("Supplier email is required");
  const total = po.allocations.reduce((sum, allocation) => sum + Number(allocation.amount ?? 0), 0);
  const project = po.production.title || [po.production.clientName, po.production.brand].filter(Boolean).join(" ");
  const bodyHtml = `
    <p>Hi ${escapeHtml(po.supplierName)},</p>
    <p>We have a purchase order ready for <strong>${escapeHtml(project)}</strong>.</p>
    <p>Before we issue it, please complete your supplier details here:</p>
    <p><a href="${escapeHtml(onboardingUrl)}">${escapeHtml(onboardingUrl)}</a></p>
    <p>PO reference: <strong>${escapeHtml(po.poNumber)}</strong><br>Total agreed amount: <strong>${money(total)}</strong></p>
    <p><strong>Billing instructions:</strong><br>
    Please send invoices to <a href="mailto:invoices@unlimited.bond">invoices@unlimited.bond</a> and include <strong>${escapeHtml(po.poNumber)}</strong> as the invoice reference.</p>
    <p>Once submitted, we will send the PO document through.</p>
    <p>Best,<br>Conor</p>
  `;
  return createPlainDraft({
    to: [email.toLowerCase()],
    subject: `${po.poNumber} supplier onboarding · ${project}`,
    bodyHtml,
    linkedProductionId: po.productionId,
  });
}

// Explicit supplier-facing snapshot. Never includes estimate rates, margin or project/internal notes.
export type FinancePoDocument = {
  poNumber:string; currency:string; supplierName:string; supplierEmail:string|null;
  projectTitle:string; jobCode:string|null; issuedAt:string; draft:boolean;
  scope:string|null; terms:string|null; lines:{description:string;netMinor:number}[];
};
export async function renderFinancePurchaseOrderPdf(data:FinancePoDocument):Promise<Buffer> {
  const doc=new PDFDocument({size:"A4",margins:{top:55,bottom:65,left:52,right:52},bufferPages:true});
  const chunks:Buffer[]=[];doc.on("data",chunk=>chunks.push(chunk));
  const complete=new Promise<Buffer>((resolve,reject)=>{doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject);});
  const format=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:data.currency}).format(minor/100);
  drawBrandLogo(doc,52,55,235);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text(data.draft?"DRAFT PURCHASE ORDER":"PURCHASE ORDER",315,63,{width:225,align:"right"});
  doc.font("Helvetica").fontSize(9).text(data.poNumber,315,85,{width:225,align:"right"});
  doc.y=130;
  const paragraph=(label:string,value:string)=>{doc.x=52;if(doc.y>690)doc.addPage();doc.font("Helvetica-Bold").fontSize(9).text(label,{width:490});doc.moveDown(.3);doc.font("Helvetica").fontSize(10).text(value,{width:490,lineGap:3});doc.moveDown(.8);};
  paragraph("Supplier",[data.supplierName,data.supplierEmail].filter(Boolean).join("\n"));
  paragraph("Project",`${data.jobCode||""} · ${data.projectTitle}`);
  paragraph(data.draft?"Preview date":"Issued on",dateString(data.issuedAt));
  paragraph("Currency",`${data.currency} · All agreed amounts below are net, excluding tax.`);
  if(data.draft)paragraph("Draft only","For review. This draft does not confirm a supplier commitment.");
  for(const line of data.lines) {
    if(doc.y>660)doc.addPage();
    doc.font("Helvetica").fontSize(10);
    const height=Math.max(28,doc.heightOfString(line.description,{width:350})+14);
    if(doc.y+height>715)doc.addPage();
    const top=doc.y;doc.text(line.description,52,top,{width:350,lineGap:2});
    doc.font("Helvetica-Bold").text(format(line.netMinor),412,top,{width:130,align:"right"});
    doc.y=top+height;doc.x=52;
  }
  paragraph("Total agreed net",format(data.lines.reduce((sum,l)=>sum+l.netMinor,0)));
  if(data.scope)paragraph("Supplier scope",data.scope);
  if(data.terms)paragraph("Supplier terms",data.terms);
  paragraph("Invoice instructions",`Quote ${data.poNumber} on invoices. Send invoices to invoices@unlimited.bond. Any scope or price change requires a written agreement.`);
  const range=doc.bufferedPageRange();
  for(let i=0;i<range.count;i++) {
    doc.switchToPage(i);
    const bottom=doc.page.margins.bottom; doc.page.margins.bottom=0;
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text("BOND UN LIMITED · 128 City Road, London EC1V 2NX · Company 16215041 · VAT GB 493336372",52,786,{width:490,lineBreak:false});
    doc.text(`${data.poNumber} · ${i+1}/${range.count}`,52,800,{width:490,lineBreak:false});
    doc.page.margins.bottom=bottom;
  }
  doc.end();return complete;
}
