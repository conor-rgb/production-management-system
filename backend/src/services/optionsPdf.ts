import fs from "node:fs";
import PDFDocument from "pdfkit";
import { OptionStatus, Prisma } from "@prisma/client";

export type OptionsPdfBoard = Prisma.OptionsBoardGetPayload<{
  include: {
    production: true;
    categories: {
      include: {
        options: {
          include: {
            photos: true;
          };
        };
      };
    };
  };
}>;

const STATUS_LABELS: Record<Exclude<OptionStatus, "NOT_AVAILABLE">, string> = {
  RECOMMENDED: "RECOMMENDED",
  OPTION: "OPTION",
  SHORTLISTED: "SHORTLISTED",
};

const STATUS_COLORS: Record<Exclude<OptionStatus, "NOT_AVAILABLE">, string> = {
  RECOMMENDED: "#16a34a",
  OPTION: "#2563eb",
  SHORTLISTED: "#d97706",
};

function pageDate(): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date());
}

function optionOrder(status: OptionStatus): number {
  if (status === "RECOMMENDED") return 0;
  if (status === "OPTION") return 1;
  if (status === "SHORTLISTED") return 2;
  return 3;
}

function addFooter(doc: PDFKit.PDFDocument, pageNumber: number, pageCount: number): void {
  const bottom = doc.page.height - 38;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#777")
    .text(`unlimited.bond · conor@unlimited.bond · unlimited.bond   Page ${pageNumber} of ${pageCount}`, 50, bottom, {
      width: doc.page.width - 100,
      align: "center",
    });
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, height: number): number {
  if (y + height < doc.page.height - 70) return y;
  doc.addPage();
  return 58;
}

function drawPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.roundedRect(x, y, 120, 80, 4).fillAndStroke("#f0f0ee", "#e0e0dc");
  doc.font("Helvetica").fontSize(18).fillColor("#aaa").text("□", x, y + 28, { width: 120, align: "center" });
}

function drawPhoto(doc: PDFKit.PDFDocument, path: string | undefined, x: number, y: number): void {
  if (!path || !fs.existsSync(path)) {
    drawPlaceholder(doc, x, y);
    return;
  }
  try {
    doc.image(path, x, y, { width: 120, height: 80, fit: [120, 80], align: "center", valign: "center" });
  } catch {
    drawPlaceholder(doc, x, y);
  }
}

function drawStatusBadge(doc: PDFKit.PDFDocument, status: Exclude<OptionStatus, "NOT_AVAILABLE">, x: number, y: number): void {
  const label = STATUS_LABELS[status];
  const width = doc.widthOfString(label) + 14;
  doc.roundedRect(x, y, width, 16, 4).fill(STATUS_COLORS[status]);
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#fff").text(label, x + 7, y + 4, { width: width - 14 });
}

function drawOption(doc: PDFKit.PDFDocument, option: OptionsPdfBoard["categories"][number]["options"][number], y: number): number {
  const blockHeight = 108;
  const rowY = ensureSpace(doc, y, blockHeight);
  const x = 50;
  const width = doc.page.width - 100;

  doc.roundedRect(x, rowY, width, 96, 5).stroke("#e5e5e0");
  drawPhoto(doc, option.photos[0]?.storedPath, x + 10, rowY + 8);

  const textX = x + 144;
  const textWidth = width - 158;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1f").text(option.name, textX, rowY + 12, { width: textWidth - 96 });
  drawStatusBadge(doc, option.status as Exclude<OptionStatus, "NOT_AVAILABLE">, x + width - 112, rowY + 12);

  if (option.subtitle) {
    doc.font("Helvetica").fontSize(9).fillColor("#666").text(option.subtitle, textX, rowY + 30, { width: textWidth });
  }
  if (option.clientNotes) {
    doc.font("Helvetica").fontSize(9).fillColor("#333").text(option.clientNotes, textX, rowY + 48, {
      width: textWidth,
      height: 36,
      ellipsis: true,
      lineGap: 2,
    });
  }

  return rowY + blockHeight;
}

export async function renderOptionsPdf(board: OptionsPdfBoard): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const production = board.production;
  const visibleCategories = board.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((category) => ({
      ...category,
      options: category.options
        .filter((option) => option.status !== "NOT_AVAILABLE")
        .slice()
        .sort((a, b) => optionOrder(a.status) - optionOrder(b.status) || a.order - b.order),
    }))
    .filter((category) => category.options.length > 0);
  const optionCount = visibleCategories.reduce((sum, category) => sum + category.options.length, 0);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1f").text("unlimited.bond", 50, 52);
  doc.font("Helvetica").fontSize(9).fillColor("#777").text(pageDate(), 50, 52, { align: "right" });
  doc.moveDown(6);
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#1a1a1f").text(`${board.title} — ${[production.clientName, production.brand].filter(Boolean).join(" ") || production.title}`);
  doc.moveDown(0.7);
  doc.font("Helvetica").fontSize(12).fillColor("#444").text(`Job: ${production.jobCode ?? "Uncoded"}`);
  doc.text("Prepared by: Conor Bond / unlimited.bond");
  doc.moveDown(2);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#1a1a1f").text(`${visibleCategories.length} categories · ${optionCount} options`);

  for (const category of visibleCategories) {
    doc.addPage();
    let y = 50;
    doc.rect(50, y, doc.page.width - 100, 30).fill("#1a1a1f");
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#fff")
      .text(`${category.emoji ? `${category.emoji}  ` : ""}${category.name.toUpperCase()}`, 62, y + 9);
    y += 48;

    for (const status of ["RECOMMENDED", "OPTION", "SHORTLISTED"] as const) {
      const group = category.options.filter((option) => option.status === status);
      if (group.length === 0) continue;
      y = ensureSpace(doc, y, 28);
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#777").text(STATUS_LABELS[status], 50, y);
      y += 16;
      for (const option of group) {
        y = drawOption(doc, option, y);
      }
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    addFooter(doc, i + 1, range.count);
  }

  doc.end();

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
