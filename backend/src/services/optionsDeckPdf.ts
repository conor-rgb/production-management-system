import fs from "node:fs";
import PDFDocument from "pdfkit";
import { CandidateDateHoldStatus, Prisma } from "@prisma/client";

export type OptionsDeckGroup = Prisma.OptionGroupGetPayload<{
  include: {
    production: true;
    candidates: {
      include: {
        blackbookEntry: true;
        selectedAddress: true;
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

export type DeckBlockType = "field" | "links" | "dateStatus" | "imageGrid" | "notes" | "map" | "footer";
export type DeckField = "name" | "subtitle" | "location" | "address" | "clientNotes" | "internalNotes" | "project";

export interface DeckTemplateBlock {
  id: string;
  type: DeckBlockType;
  label: string;
  field?: DeckField;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  uppercase?: boolean;
  imageCount?: number;
}

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
  addLink(links, "Book", candidate.bookUrl ?? entry?.bookUrl);
  addLink(links, "social", candidate.socialUrl ?? entry?.socialUrl);
  addLink(links, "models.com", candidate.modelsComUrl ?? entry?.modelsComUrl);
  addLink(links, "website", candidate.website ?? entry?.website);
  addLink(links, "pdf", candidate.pdfUrl ?? entry?.polasUrl ?? entry?.selfTapeUrl);
  return links;
}

function selectedPhotos(candidate: DeckCandidate): DeckPhoto[] {
  return candidate.photos
    .filter((photo) => photo.exportSelected)
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 10);
}

function countryName(code: string | null): string | null {
  if (!code) return null;
  if (code === "GB") return "United Kingdom";
  if (code === "FR") return "France";
  if (code === "IT") return "Italy";
  if (code === "US") return "United States";
  return code;
}

function addressLines(candidate: DeckCandidate): string[] {
  const address = candidate.selectedAddress ?? candidate;
  const cityLine = [address.city, address.postcode].filter(Boolean).join(", ");
  const regionLine = [address.region, countryName(address.country)].filter(Boolean).join(", ");
  return [address.addressLine1, address.addressLine2, cityLine, regionLine].filter((line): line is string => Boolean(line));
}

function candidateLocation(candidate: DeckCandidate): string {
  const address = candidate.selectedAddress ?? candidate;
  return [address.city, countryName(address.country)].filter(Boolean).join(", ");
}

function fieldValue(group: OptionsDeckGroup, candidate: DeckCandidate, field: DeckField): string {
  if (field === "name") return candidateDisplayName(candidate);
  if (field === "subtitle") return candidate.subtitle ?? "";
  if (field === "location") return candidateLocation(candidate);
  if (field === "address") return addressLines(candidate).join("\n");
  if (field === "clientNotes") return candidate.clientNotes ?? "";
  if (field === "internalNotes") return candidate.internalNotes ?? "";
  return projectTitle(group);
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

  const tableRight = PAGE_WIDTH - RIGHT;
  const y = 96;
  const dateWidth = 150;
  const statusWidth = 214;
  const gap = 12;
  const statusX = tableRight - statusWidth;
  const dateX = statusX - gap - dateWidth;
  const rowHeight = 24;
  const rowGap = 7;

  statuses.forEach((item, index) => {
    const style = HOLD_STYLES[item.status];
    const rowY = y + index * (rowHeight + rowGap);
    doc.font("Helvetica").fontSize(13).fillColor("#555550").text(formatDate(item.date.date), dateX, rowY + 6, {
      width: dateWidth,
      align: "right",
    });
    doc.roundedRect(statusX, rowY, statusWidth, rowHeight, 2).fillAndStroke(style.fill, style.stroke);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(style.text)
      .text(style.label, statusX + 10, rowY + 7, { width: statusWidth - 20, align: "right", characterSpacing: 0 });
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
  doc.font("Helvetica").fontSize(20).fillColor(TEXT).text(notes, LEFT, 842, {
    width: 880,
    height: 168,
    lineGap: 6,
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

function rect(block: DeckTemplateBlock) {
  return {
    x: (block.x / 100) * PAGE_WIDTH,
    y: (block.y / 100) * PAGE_HEIGHT,
    w: (block.w / 100) * PAGE_WIDTH,
    h: (block.h / 100) * PAGE_HEIGHT,
  };
}

function drawTemplateText(doc: PDFKit.PDFDocument, text: string, block: DeckTemplateBlock): void {
  const box = rect(block);
  const font = (block.fontWeight ?? 400) >= 700 ? "Helvetica-Bold" : "Helvetica";
  const value = block.uppercase ? text.toUpperCase() : text;
  doc
    .font(font)
    .fontSize(block.fontSize ?? 16)
    .fillColor(TEXT)
    .text(value, box.x, box.y, {
      width: box.w,
      height: box.h,
      align: block.align ?? "left",
      ellipsis: true,
      lineGap: 4,
    });
}

function drawTemplateLinks(doc: PDFKit.PDFDocument, candidate: DeckCandidate, block: DeckTemplateBlock): void {
  const box = rect(block);
  let x = box.x;
  const links = candidateLinks(candidate);
  for (const link of links) {
    const width = doc.font("Helvetica").fontSize(block.fontSize ?? 16).widthOfString(link.label) + 4;
    if (x + width > box.x + box.w) break;
    doc.fillColor(TEXT).text(link.label, x, box.y, { width, height: box.h, link: link.url, underline: true });
    x += width + 18;
  }
}

function drawTemplateDateStatus(doc: PDFKit.PDFDocument, candidate: DeckCandidate, block: DeckTemplateBlock): void {
  const statuses = orderedStatuses(candidate).slice(0, 8);
  const box = rect(block);
  if (!statuses.length) return;
  const rowHeight = box.h / statuses.length;
  statuses.forEach((item, index) => {
    const style = HOLD_STYLES[item.status];
    const y = box.y + index * rowHeight;
    doc.rect(box.x, y, box.w, rowHeight).fillAndStroke(style.fill, style.stroke);
    doc.font("Helvetica-Bold").fontSize(block.fontSize ?? 13).fillColor(style.text).text(`${formatDate(item.date.date)} — ${style.label}`, box.x + 8, y + Math.max(2, (rowHeight - (block.fontSize ?? 13)) / 2), {
      width: box.w - 16,
      height: rowHeight,
      align: block.align ?? "center",
      ellipsis: true,
    });
  });
}

function drawTemplateImageGrid(doc: PDFKit.PDFDocument, candidate: DeckCandidate, block: DeckTemplateBlock): void {
  const photos = selectedPhotos(candidate);
  const count = Math.max(1, block.imageCount ?? 4);
  const box = rect(block);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const gap = 18;
  const cellW = (box.w - gap * (columns - 1)) / columns;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const size = Math.min(cellW, cellH);

  Array.from({ length: count }).forEach((_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = box.x + col * (cellW + gap) + (cellW - size) / 2;
    const y = box.y + row * (cellH + gap) + (cellH - size);
    drawImageInSquare(doc, photos[index], { x, y, size });
  });
}

function drawTemplateMap(doc: PDFKit.PDFDocument, candidate: DeckCandidate, block: DeckTemplateBlock): void {
  const box = rect(block);
  if (candidate.mapImagePath && fs.existsSync(candidate.mapImagePath)) {
    doc.rect(box.x, box.y, box.w, box.h).fill("#f0f0ee");
    try {
      doc.image(candidate.mapImagePath, box.x, box.y, { fit: [box.w, box.h], align: "center", valign: "center" });
      return;
    } catch {
      // Fall through to the text placeholder if PDFKit cannot decode the cached map.
    }
  }

  doc.rect(box.x, box.y, box.w, box.h).fillAndStroke("#eef3ee", LIGHT_BORDER);
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#6b6b66").text("MAP", box.x + 18, box.y + 18, { width: box.w - 36 });
  doc.font("Helvetica").fontSize(14).fillColor("#6b6b66").text(addressLines(candidate).join("\n") || "Address / coordinates", box.x + 18, box.y + 52, {
    width: box.w - 36,
    height: box.h - 70,
    lineGap: 5,
  });
}

function drawTemplateFooter(doc: PDFKit.PDFDocument, group: OptionsDeckGroup, block: DeckTemplateBlock, pageNumber: number): void {
  const box = rect(block);
  doc.font("Helvetica").fontSize(block.fontSize ?? 12).fillColor(TEXT).text("unlimited.bond", box.x, box.y, { width: box.w / 3 });
  doc.font("Helvetica").fontSize(block.fontSize ?? 12).fillColor(MUTED).text(projectTitle(group), box.x + box.w / 3, box.y, { width: box.w / 3, align: "center" });
  doc.font("Helvetica").fontSize(block.fontSize ?? 12).fillColor(TEXT).text(String(pageNumber), box.x + (box.w * 2) / 3, box.y, { width: box.w / 3, align: "right" });
}

function drawTemplateBlock(doc: PDFKit.PDFDocument, group: OptionsDeckGroup, candidate: DeckCandidate, block: DeckTemplateBlock, pageNumber: number): void {
  if (block.type === "field" || block.type === "notes") drawTemplateText(doc, fieldValue(group, candidate, block.field ?? "name"), block);
  else if (block.type === "links") drawTemplateLinks(doc, candidate, block);
  else if (block.type === "dateStatus") drawTemplateDateStatus(doc, candidate, block);
  else if (block.type === "imageGrid") drawTemplateImageGrid(doc, candidate, block);
  else if (block.type === "map") drawTemplateMap(doc, candidate, block);
  else if (block.type === "footer") drawTemplateFooter(doc, group, block, pageNumber);
}

function drawableCandidates(group: OptionsDeckGroup): DeckCandidate[] {
  return group.candidates
    .filter((candidate) => candidate.activeState !== "RELEASED")
    .slice()
    .sort((a, b) => a.order - b.order || candidateDisplayName(a).localeCompare(candidateDisplayName(b)));
}

export async function renderOptionsDeckPdf(group: OptionsDeckGroup, templateBlocks?: DeckTemplateBlock[] | null): Promise<Buffer> {
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
      if (templateBlocks?.length) {
        templateBlocks.forEach((block) => drawTemplateBlock(doc, group, candidate, block, index + 1));
      } else {
        drawHeader(doc, group, candidate);
        drawStatusTable(doc, candidate);
        drawImages(doc, candidate);
        drawNotes(doc, candidate);
        drawFooter(doc, group, index + 1, candidates.length);
      }
    });
  }

  doc.end();

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
