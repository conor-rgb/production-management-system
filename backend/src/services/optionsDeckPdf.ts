import fs from "node:fs";
import PDFDocument from "pdfkit";
import { CandidateDateHoldStatus, Prisma } from "@prisma/client";

export type OptionsDeckGroup = Prisma.OptionGroupGetPayload<{
  include: {
    production: true;
    candidates: {
      include: {
        blackbookEntry: true;
        photos: true;
        dateStatuses: {
          include: {
            date: true;
          };
        };
      };
    };
  };
}>;

type DeckCandidate = OptionsDeckGroup["candidates"][number];
type DeckPhoto = DeckCandidate["photos"][number];
type DeckDateStatus = DeckCandidate["dateStatuses"][number];

type ImageSlot = {
  x: number;
  y: number;
  size: number;
};

type LinkItem = {
  label: string;
  url: string;
};

const PAGE_WIDTH = 1920;
const PAGE_HEIGHT = 1080;
const LEFT = 44;
const RIGHT = 44;
const TEXT = "#1a1a1f";
const MUTED = "#7c7c78";
const LIGHT_BORDER = "#deded8";

const HOLD_STYLES: Record<CandidateDateHoldStatus, { label: string; fill: string; text: string; stroke: string }> = {
  REQUESTED: { label: "REQUESTED", fill: "#f5f3ff", text: "#6d28d9", stroke: "#ddd6fe" },
  FIRST_OPTION: { label: "FIRST OPTION", fill: "#dcfce7", text: "#166534", stroke: "#86efac" },
  SECOND_OPTION: { label: "SECOND OPTION", fill: "#eff6ff", text: "#1d4ed8", stroke: "#bfdbfe" },
  CONFIRMED: { label: "CONFIRMED", fill: "#16a34a", text: "#ffffff", stroke: "#15803d" },
  RELEASED: { label: "RELEASED", fill: "#f4f4f2", text: "#73736f", stroke: "#deded8" },
  UNAVAILABLE: { label: "NOT AVAILABLE", fill: "#fff1e7", text: "#9a3412", stroke: "#fed7aa" },
  NA: { label: "N/A", fill: "#fafafa", text: "#a3a3a0", stroke: "#e5e5e0" },
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(date);
}

function exportDate(): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

function cleanFilePart(value: string): string {
  return value.replace(/[\\/:\*\?"<>\|]/g, " ").replace(/\s+/g, " ").trim() || "Options";
}

export function optionsDeckFilename(group: OptionsDeckGroup): string {
  const jobCode = group.production.jobCode ?? "JOB";
  const date = new Date().toISOString().slice(0, 10);
  return `${jobCode}_${cleanFilePart(group.name)}_Options_${date}.pdf`;
}

function candidateDisplayName(candidate: DeckCandidate): string {
  return candidate.name || candidate.blackbookEntry?.displayName || "Untitled option";
}

function projectTitle(group: OptionsDeckGroup): string {
  const client = group.production.clientName?.replace(/^disney$/i, "Disney");
  const brand = group.production.brand?.replace(/^ganni$/i, "GANNI");
  const parts = [brand, client].filter(Boolean);
  return parts.length ? parts.join(" x ") : group.production.title;
}

function urlWithProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function addLink(items: LinkItem[], label: string, url?: string | null): void {
  const cleaned = url?.trim();
  if (!cleaned) return;
  if (items.some((item) => item.url === cleaned)) return;
  items.push({ label, url: urlWithProtocol(cleaned) });
}

function candidateLinks(candidate: DeckCandidate): LinkItem[] {
  const links: LinkItem[] = [];
  const entry = candidate.blackbookEntry;
  addLink(links, "Book", entry?.bookUrl);
  addLink(links, "social", entry?.socialUrl);
  addLink(links, "models.com", entry?.modelsComUrl);
  addLink(links, "website", candidate.website ?? entry?.website);
  addLink(links, "pdf", entry?.polasUrl ?? entry?.selfTapeUrl);
  return links;
}

function selectedPhotos(candidate: DeckCandidate): DeckPhoto[] {
  return candidate.photos
    .filter((photo) => photo.exportSelected)
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 10);
}

function orderedStatuses(candidate: DeckCandidate): DeckDateStatus[] {
  return candidate.dateStatuses
    .filter((status) => status.status !== "NA")
    .slice()
    .sort((a, b) => a.date.date.getTime() - b.date.date.getTime());
}

function slotsForCount(count: number): ImageSlot[] {
  if (count <= 1) return [{ x: 628, y: 232, size: 664 }];
  if (count === 2) return rowSlots(2, 520, 286);
  if (count === 3) return rowSlots(3, 430, 320);
  if (count === 4) return rowSlots(4, 382, 330);
  if (count === 5) return rowSlots(5, 326, 340);
  if (count === 6) return rowSlots(6, 286, 376);
  if (count === 7) return [...rowSlots(3, 284, 246), ...rowSlots(4, 284, 548)];
  if (count === 8) return [...rowSlots(3, 284, 246), ...rowSlots(5, 284, 548)];
  if (count === 9) return [...rowSlots(4, 284, 246), ...rowSlots(5, 284, 548)];
  return [...rowSlots(5, 284, 246), ...rowSlots(5, 284, 548)];
}

function rowSlots(count: number, size: number, y: number): ImageSlot[] {
  const gap = count >= 5 ? 24 : 28;
  const width = count * size + (count - 1) * gap;
  const startX = (PAGE_WIDTH - width) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * (size + gap),
    y,
    size,
  }));
}

function drawHeader(doc: PDFKit.PDFDocument, group: OptionsDeckGroup, candidate: DeckCandidate): void {
  const title = candidateDisplayName(candidate).toUpperCase();
  doc.font("Helvetica-Bold").fontSize(54).fillColor(TEXT).text(title, LEFT, 48, {
    width: 1120,
    height: 66,
    ellipsis: true,
    characterSpacing: 0,
  });

  let linkX = LEFT;
  const links = candidateLinks(candidate);
  for (const link of links) {
    const width = doc.widthOfString(link.label) + 2;
    doc
      .font("Helvetica")
      .fontSize(16)
      .fillColor(TEXT)
      .text(link.label, linkX, 120, { width, link: link.url, underline: true });
    linkX += width + 20;
  }

  doc.font("Helvetica").fontSize(16).fillColor("#8c8c88").text(`${group.name.toLowerCase()} options — ${exportDate()}`, 1250, 54, {
    width: PAGE_WIDTH - 1250 - RIGHT,
    align: "right",
  });
}

function drawStatusTable(doc: PDFKit.PDFDocument, candidate: DeckCandidate): void {
  const statuses = orderedStatuses(candidate).slice(0, 7);
  if (statuses.length === 0) return;

  const x = 1300;
  const y = 96;
  const dateWidth = 152;
  const statusWidth = 246;
  const gap = 10;
  const rowHeight = 24;
  const rowGap = 7;

  statuses.forEach((item, index) => {
    const style = HOLD_STYLES[item.status];
    const rowY = y + index * (rowHeight + rowGap);
    doc.font("Helvetica").fontSize(13).fillColor("#555550").text(formatDate(item.date.date), x, rowY + 6, {
      width: dateWidth,
      align: "right",
    });
    doc.roundedRect(x + dateWidth + gap, rowY, statusWidth, rowHeight, 2).fillAndStroke(style.fill, style.stroke);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(style.text)
      .text(style.label, x + dateWidth + gap + 12, rowY + 7, { width: statusWidth - 24, align: "center", characterSpacing: 0 });
  });
}

function drawPlaceholder(doc: PDFKit.PDFDocument, slot: ImageSlot): void {
  doc.rect(slot.x, slot.y, slot.size, slot.size).fill("#f0f0ee").stroke("#e1e1dc");
  doc.font("Helvetica").fontSize(24).fillColor("#b8b8b2").text("No image", slot.x, slot.y + slot.size - 52, {
    width: slot.size,
    align: "center",
  });
}

function drawImageInSquare(doc: PDFKit.PDFDocument, photo: DeckPhoto | undefined, slot: ImageSlot): void {
  if (!photo || !fs.existsSync(photo.storedPath)) {
    drawPlaceholder(doc, slot);
    return;
  }

  const width = photo.width ?? slot.size;
  const height = photo.height ?? slot.size;
  const scale = Math.min(slot.size / width, slot.size / height);
  const imageWidth = width * scale;
  const imageHeight = height * scale;
  const x = slot.x + (slot.size - imageWidth) / 2;
  const y = slot.y + slot.size - imageHeight;

  try {
    doc.image(photo.storedPath, x, y, { width: imageWidth, height: imageHeight });
  } catch {
    drawPlaceholder(doc, slot);
  }
}

function drawImages(doc: PDFKit.PDFDocument, candidate: DeckCandidate): void {
  const photos = selectedPhotos(candidate);
  const slots = slotsForCount(Math.max(photos.length, 1));
  slots.forEach((slot, index) => {
    if (index < photos.length) drawImageInSquare(doc, photos[index], slot);
  });
}

function drawNotes(doc: PDFKit.PDFDocument, candidate: DeckCandidate): void {
  const notes = candidate.clientNotes?.trim();
  if (!notes) return;
  doc.font("Helvetica").fontSize(18).fillColor(TEXT).text(notes, LEFT, 870, {
    width: 820,
    height: 132,
    lineGap: 5,
    ellipsis: true,
  });
}

function drawFooter(doc: PDFKit.PDFDocument, group: OptionsDeckGroup, pageNumber: number, pageCount: number): void {
  const x = 1280;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT).text(projectTitle(group), x, 962, {
    width: PAGE_WIDTH - x - RIGHT,
    align: "right",
  });
  doc.font("Helvetica").fontSize(15).fillColor(MUTED).text("unlimited.bond", x, 994, {
    width: PAGE_WIDTH - x - RIGHT,
    align: "right",
  });
  doc.font("Helvetica").fontSize(10).fillColor("#b5b5af").text(`${pageNumber} / ${pageCount}`, LEFT, 1018, { width: 120 });
}

function drawableCandidates(group: OptionsDeckGroup): DeckCandidate[] {
  return group.candidates
    .filter((candidate) => candidate.activeState !== "RELEASED")
    .slice()
    .sort((a, b) => a.order - b.order || candidateDisplayName(a).localeCompare(candidateDisplayName(b)));
}

export async function renderOptionsDeckPdf(group: OptionsDeckGroup): Promise<Buffer> {
  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: 0, bufferPages: true, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const candidates = drawableCandidates(group);
  if (candidates.length === 0) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(36).fillColor(TEXT).text(`${group.name} options`, LEFT, 64);
    doc.font("Helvetica").fontSize(20).fillColor(MUTED).text("No active candidates are available for export.", LEFT, 130);
    drawFooter(doc, group, 1, 1);
  } else {
    candidates.forEach((candidate, index) => {
      doc.addPage();
      drawHeader(doc, group, candidate);
      drawStatusTable(doc, candidate);
      drawImages(doc, candidate);
      drawNotes(doc, candidate);
      drawFooter(doc, group, index + 1, candidates.length);
    });
  }

  doc.end();

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
