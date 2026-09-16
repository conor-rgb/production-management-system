import fs from "node:fs/promises";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import prisma from "../prisma";
import { autoFileDocument, resolveJobFilePath } from "./fileStorage";
import { drawBrandLogo } from "./pdfBrand";

const PAGE = { left: 48, right: 545, top: 58, bottom: 790 };
const TEXT = "#111111";
const MUTED = "#666666";
const HAIRLINE = "#d9d9d4";
const SOFT = "#f6f5f1";
const DAY_BAND = "#f1f0ea";
const ROUTE_ARROW = " -> ";

type CrewItineraryDocument = NonNullable<Awaited<ReturnType<typeof loadCrewItinerary>>>;
type ItineraryItem = CrewItineraryDocument["items"][number];
type ItineraryAttachment = ItineraryItem["files"][number];

function cleanFilenamePart(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\\/:\*\?"<>\|]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Itinerary";
}

function displayItineraryTitle(title: string, crewName: string): string {
  const cleaned = title.replace(/\s+travel itinerary\s*$/i, "").trim();
  return cleaned || crewName;
}

function dateString(value?: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function shortDate(value?: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function stripHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function htmlAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? null;
}

function imageWidthPercent(tag: string): number {
  const rawWidth = htmlAttr(tag, "data-width") || htmlAttr(tag, "width") || htmlAttr(tag, "style")?.match(/width:\s*([^;]+)/i)?.[1] || "100%";
  const parsed = Number(String(rawWidth).replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.max(15, Math.min(100, parsed)) : 100;
}

function htmlTokens(value: string | null | undefined): Array<{ type: "html"; value: string } | { type: "image"; src: string; widthPercent: number }> {
  const html = value ?? "";
  const tokens: Array<{ type: "html"; value: string } | { type: "image"; src: string; widthPercent: number }> = [];
  const imagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(html))) {
    const before = html.slice(lastIndex, match.index).trim();
    if (before) tokens.push({ type: "html", value: before });
    tokens.push({ type: "image", src: match[1], widthPercent: imageWidthPercent(match[0]) });
    lastIndex = match.index + match[0].length;
  }
  const after = html.slice(lastIndex).trim();
  if (after) tokens.push({ type: "html", value: after });
  return tokens;
}

function appendixPageTitle(page: { title: string; bodyHtml: string }): string {
  const title = page.title.trim();
  if (title && !/^info page$/i.test(title)) return title;
  const heading = page.bodyHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]
    ?? page.bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const derived = stripHtml(heading ?? "");
  return derived || title || "Appendix";
}

function htmlBlocks(html: string): Array<{ tag: string; html: string }> {
  const blocks: Array<{ tag: string; html: string }> = [];
  const blockPattern = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html))) {
    blocks.push({ tag: match[1].toLowerCase(), html: match[2] });
  }
  if (blocks.length === 0) {
    const text = stripHtml(html);
    if (text) blocks.push({ tag: "p", html });
  }
  return blocks;
}

function inlineSegments(html: string): Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }> {
  const segments: Array<{ text: string; bold: boolean; italic: boolean; underline: boolean }> = [];
  const tagPattern = /<\/?(strong|b|em|i|u)\b[^>]*>/gi;
  const state = { bold: false, italic: false, underline: false };
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const raw = html.slice(lastIndex, match.index).replace(/<[^>]*>/g, "");
    const text = decodeHtml(raw);
    if (text) segments.push({ text, ...state });
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    if (tag === "strong" || tag === "b") state.bold = !closing;
    if (tag === "em" || tag === "i") state.italic = !closing;
    if (tag === "u") state.underline = !closing;
    lastIndex = match.index + match[0].length;
  }
  const tail = html.slice(lastIndex).replace(/<[^>]*>/g, "");
  const tailText = decodeHtml(tail);
  if (tailText) segments.push({ text: tailText, ...state });
  return segments;
}

function fileIdFromImageSrc(src: string): string | null {
  const match = src.match(/\/api\/files\/([^/]+)\/download/);
  return match?.[1] ?? null;
}

function segmentFont(segment: { bold: boolean; italic: boolean }): string {
  if (segment.bold && segment.italic) return "Helvetica-BoldOblique";
  if (segment.bold) return "Helvetica-Bold";
  if (segment.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function renderRichBlock(doc: PDFKit.PDFDocument, y: number, block: { tag: string; html: string }): number {
  const isHeading = block.tag.startsWith("h");
  const isList = block.tag === "li";
  const fontSize = block.tag === "h1" ? 13 : block.tag === "h2" ? 11 : isHeading ? 10 : 9;
  const width = PAGE.right - PAGE.left - (isList ? 18 : 0);
  const x = PAGE.left + (isList ? 18 : 0);
  const prefix = isList ? "•  " : "";
  const segments = inlineSegments(block.html);
  const plain = `${prefix}${segments.map((segment) => segment.text).join("")}`.trim();
  if (!plain) return y + 7;

  const estimatedHeight = doc.font(isHeading ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).heightOfString(plain, { width, lineGap: 3 });
  y = ensureSpace(doc, y, estimatedHeight + 14);

  if (isList) {
    doc.font("Helvetica").fontSize(fontSize).fillColor(TEXT).text("•", PAGE.left + 4, y, { width: 12 });
  }

  let first = true;
  segments.forEach((segment, index) => {
    const text = first && !isList ? segment.text : segment.text;
    const continued = index < segments.length - 1;
    doc
      .font(isHeading ? "Helvetica-Bold" : segmentFont(segment))
      .fontSize(fontSize)
      .fillColor(TEXT)
      .text(text, first ? x : undefined, first ? y : undefined, {
        width,
        lineGap: 3,
        continued,
        underline: segment.underline,
      });
    first = false;
  });

  return y + estimatedHeight + (isHeading ? 13 : 7);
}

function renderRichHtml(doc: PDFKit.PDFDocument, y: number, html: string): number {
  const blocks = htmlBlocks(html);
  for (const block of blocks) {
    y = renderRichBlock(doc, y, block);
  }
  return y;
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number) {
  if (y + needed <= PAGE.bottom) return y;
  doc.addPage();
  return PAGE.top;
}

function rule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).lineWidth(0.65).strokeColor(HAIRLINE).stroke();
}

async function attachmentPreviewBuffer(file: ItineraryAttachment["file"]): Promise<Buffer | null> {
  const filePath = await resolveJobFilePath(file);
  if (file.mimeType.startsWith("image/")) {
    return fs.readFile(filePath).catch(() => null);
  }
  if (file.mimeType === "application/pdf") {
    try {
      return await sharp(filePath, { density: 150, page: 0 }).png().toBuffer();
    } catch {
      return null;
    }
  }
  return null;
}

async function renderAttachmentPage(doc: PDFKit.PDFDocument, item: ItineraryItem, file: ItineraryAttachment["file"]) {
  doc.addPage();
  let y = PAGE.top;
  rule(doc, y);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text("ATTACHED CONFIRMATION", PAGE.left, y + 16, { characterSpacing: 1.1 });
  y += 48;

  doc.font("Helvetica-Bold").fontSize(11).fillColor(TEXT).text(itemTitle(item), PAGE.left, y, { width: PAGE.right - PAGE.left, lineGap: 1 });
  y += Math.max(20, doc.heightOfString(itemTitle(item), { width: PAGE.right - PAGE.left }) + 8);
  doc.font("Helvetica-Bold").fontSize(7.2).fillColor(itemTypeStyle(item.type).accent).text(itemTypeLabel(item.type).toUpperCase(), PAGE.left, y, { width: 70, characterSpacing: 0.6 });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(file.originalFilename, PAGE.left + 78, y, { width: PAGE.right - PAGE.left - 78 });
  y += 24;

  const preview = await attachmentPreviewBuffer(file);
  if (!preview) {
    doc.roundedRect(PAGE.left, y, PAGE.right - PAGE.left, 70, 4).fillColor(SOFT).fill();
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT).text("Confirmation file", PAGE.left + 14, y + 18, { width: PAGE.right - PAGE.left - 28 });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`${file.originalFilename} is linked to this itinerary item. Preview is not available for this file type.`, PAGE.left + 14, y + 34, { width: PAGE.right - PAGE.left - 28, lineGap: 2 });
    return;
  }

  doc.roundedRect(PAGE.left, y, PAGE.right - PAGE.left, PAGE.bottom - y, 4).strokeColor(HAIRLINE).lineWidth(0.45).stroke();
  doc.image(preview, PAGE.left + 10, y + 10, { fit: [PAGE.right - PAGE.left - 20, PAGE.bottom - y - 20], align: "center", valign: "center" });
}

function detailPair(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width = 220) {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(TEXT).text(label, x, y, { width: 76 });
  doc.font("Helvetica").fontSize(8).fillColor(TEXT).text(value || "-", x + 82, y, { width: width - 82, lineGap: 1.4 });
}

function fullName(contact: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!contact) return "";
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.email || "";
}

function itemTypeLabel(type: string) {
  if (type === "CAR") return "Car";
  if (type === "TRAIN") return "Train";
  if (type === "FLIGHT") return "Flight";
  if (type === "HOTEL") return "Hotel";
  return "Event";
}

function itemTypeStyle(type: string) {
  if (type === "HOTEL") return { label: "HOTEL", accent: "#0f766e", tint: "#eefaf7" };
  if (type === "FLIGHT") return { label: "FLIGHT", accent: "#2563eb", tint: "#eff6ff" };
  if (type === "TRAIN") return { label: "TRAIN", accent: "#15803d", tint: "#f0fdf4" };
  if (type === "CAR") return { label: "CAR", accent: "#b45309", tint: "#fffbeb" };
  return { label: "EVENT", accent: "#7c3aed", tint: "#f5f3ff" };
}

function itemTitle(item: ItineraryItem) {
  if (item.type === "HOTEL") return item.destination || item.provider || item.address || "Hotel stay";
  return [item.origin, item.destination].filter(Boolean).join(ROUTE_ARROW) || item.address || item.provider || itemTypeLabel(item.type);
}

function itemTime(item: ItineraryItem): string {
  const start = item.startTime ? `${item.startTime}${item.startTimezone ? ` ${item.startTimezone}` : ""}` : "";
  const end = item.endTime ? `${item.endTime}${item.endTimezone ? ` ${item.endTimezone}` : ""}` : "";
  if (start && end) return `${start} - ${end}`;
  return start || end || "TBC";
}

function compactItemTime(item: ItineraryItem): string {
  if (item.startTime && item.endTime) return `${item.startTime} - ${item.endTime}`;
  return item.startTime || item.endTime || "TBC";
}

function hasUsefulTime(item: ItineraryItem): boolean {
  return Boolean(item.startTime || item.endTime);
}

function itemStartsAfterNoon(item: ItineraryItem): boolean {
  if (!item.startTime) return false;
  const hour = Number(item.startTime.slice(0, 2));
  return Number.isFinite(hour) && hour >= 12;
}

function itemDetails(item: ItineraryItem): Array<[string, string]> {
  const rows: Array<[string, string | null | undefined]> = [];
  if (item.type === "HOTEL") {
    rows.push(["Check-in", [shortDate(item.date), item.startTime].filter(Boolean).join(" ")]);
    rows.push(["Check-out", [shortDate(item.endDate), item.endTime].filter(Boolean).join(" ")]);
    rows.push(["Address", item.address]);
    rows.push(["Guest", item.passengerName]);
    rows.push(["Room", [item.roomType, item.roomNumber ? `No. ${item.roomNumber}` : null].filter(Boolean).join(" · ")]);
    rows.push(["Booking", item.bookingReference]);
    rows.push(["Check-in notes", item.checkInDetails]);
    rows.push(["Check-out notes", item.checkOutDetails]);
  } else if (item.type === "FLIGHT") {
    rows.push(["Route", [item.origin, item.destination].filter(Boolean).join(ROUTE_ARROW)]);
    rows.push(["Flight", item.flightNumber]);
    rows.push(["Times", itemTime(item)]);
    rows.push(["Terminal / gate", [item.terminal ? `Terminal ${item.terminal}` : null, item.gate ? `Gate ${item.gate}` : null].filter(Boolean).join(" · ")]);
    rows.push(["Passenger", item.passengerName]);
    rows.push(["Seat / class", [item.seat, item.coach].filter(Boolean).join(" · ")]);
    rows.push(["Baggage", item.baggage]);
    rows.push(["Booking", item.bookingReference]);
  } else if (item.type === "TRAIN") {
    rows.push(["Route", [item.origin, item.destination].filter(Boolean).join(ROUTE_ARROW)]);
    rows.push(["Service", item.trainNumber]);
    rows.push(["Times", itemTime(item)]);
    rows.push(["Platform / coach", [item.platform ? `Platform ${item.platform}` : null, item.coach].filter(Boolean).join(" · ")]);
    rows.push(["Passenger", item.passengerName]);
    rows.push(["Seat", item.seat]);
    rows.push(["Booking", item.bookingReference]);
  } else if (item.type === "CAR") {
    rows.push(["Route", [item.origin || item.address, item.destination].filter(Boolean).join(ROUTE_ARROW)]);
    rows.push(["Details", [item.provider, item.bookingReference ? `Booking ${item.bookingReference}` : null].filter(Boolean).join(" · ")]);
    rows.push(["Contact", [item.contactName, item.contactPhone, item.contactEmail].filter(Boolean).join(" · ")]);
  } else {
    rows.push(["Location", item.destination || item.address]);
    rows.push(["Address", item.address]);
    rows.push(["Times", itemTime(item)]);
    rows.push(["Contact", [item.contactName, item.contactPhone, item.contactEmail].filter(Boolean).join(" · ")]);
    rows.push(["Booking", item.bookingReference]);
  }
  rows.push(["Notes", item.notes]);
  return rows.filter(([, value]) => Boolean(value)).map(([label, value]) => [label, String(value)]);
}

function detailRowsHeight(doc: PDFKit.PDFDocument, rows: Array<[string, string]>, width: number): number {
  return rows.reduce((height, [, value]) => {
    return height + Math.max(9.5, doc.heightOfString(value, { width, lineGap: 0.5 }) + 1);
  }, 0);
}

function glanceHotel(item: ItineraryItem): string[] {
  return [
    [shortDate(item.date), item.startTime].filter(Boolean).join(" "),
    [item.endDate ? `to ${shortDate(item.endDate)}` : null, item.endTime].filter(Boolean).join(" "),
    itemTitle(item),
    item.address,
    item.bookingReference ? `Booking ${item.bookingReference}` : null,
  ].filter(Boolean) as string[];
}

function glanceEvent(item: ItineraryItem): string[] {
  return [
    [shortDate(item.date), compactItemTime(item)].filter(Boolean).join(" "),
    itemTitle(item),
    item.address,
  ].filter(Boolean) as string[];
}

function glanceTravel(item: ItineraryItem): string[] {
  const service = item.type === "FLIGHT" ? item.flightNumber : item.trainNumber;
  const terminal = item.type === "FLIGHT"
    ? [item.terminal ? `Terminal ${item.terminal}` : null, item.gate ? `Gate ${item.gate}` : null].filter(Boolean).join(" · ")
    : [item.platform ? `Platform ${item.platform}` : null, item.coach].filter(Boolean).join(" · ");
  return [
    [shortDate(item.date), compactItemTime(item)].filter(Boolean).join(" "),
    [itemTypeLabel(item.type), service, itemTitle(item)].filter(Boolean).join(" · "),
    [terminal, item.seat ? `Seat ${item.seat}` : null].filter(Boolean).join(" · "),
    item.bookingReference ? `Booking ${item.bookingReference}` : null,
  ].filter(Boolean) as string[];
}

function drawGlanceColumn(
  doc: PDFKit.PDFDocument,
  label: string,
  items: ItineraryItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  formatter: (item: ItineraryItem) => string[],
) {
  doc.roundedRect(x, y, width, height, 4).fillColor(SOFT).fill();
  doc.font("Helvetica-Bold").fontSize(6.8).fillColor(MUTED).text(label, x + 8, y + 8, { width: width - 16, characterSpacing: 0.6 });
  if (items.length === 0) {
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("None listed", x + 8, y + 26, { width: width - 16 });
    return;
  }

  let rowY = y + 23;
  items.forEach((item) => {
    const lines = formatter(item);
    const first = lines[0] ?? "TBC";
    const second = lines[1] ?? itemTitle(item);
    const rest = lines.slice(2).join(" · ");
    doc.font("Helvetica-Bold").fontSize(7.4).fillColor(TEXT).text(first, x + 8, rowY, { width: width - 16, lineGap: 0.2 });
    rowY += Math.max(8.5, doc.heightOfString(first, { width: width - 16, lineGap: 0.2 }));
    doc.font("Helvetica-Bold").fontSize(7.2).fillColor(TEXT).text(second, x + 8, rowY, { width: width - 16, lineGap: 0.2 });
    rowY += Math.max(8.5, doc.heightOfString(second, { width: width - 16, lineGap: 0.2 }));
    if (rest) {
      doc.font("Helvetica").fontSize(6.7).fillColor(MUTED).text(rest, x + 8, rowY, { width: width - 16, lineGap: 0.2 });
      rowY += Math.max(8, doc.heightOfString(rest, { width: width - 16, lineGap: 0.2 }));
    }
    rowY += 5;
  });
}

function glanceColumnHeight(
  doc: PDFKit.PDFDocument,
  items: ItineraryItem[],
  width: number,
  formatter: (item: ItineraryItem) => string[],
): number {
  const textWidth = width - 16;
  if (items.length === 0) return 52;

  const contentHeight = items.reduce((height, item) => {
    const lines = formatter(item);
    const first = lines[0] ?? "TBC";
    const second = lines[1] ?? itemTitle(item);
    const rest = lines.slice(2).join(" · ");
    let rowHeight = 0;
    rowHeight += Math.max(8.5, doc.font("Helvetica-Bold").fontSize(7.4).heightOfString(first, { width: textWidth, lineGap: 0.2 }));
    rowHeight += Math.max(8.5, doc.font("Helvetica-Bold").fontSize(7.2).heightOfString(second, { width: textWidth, lineGap: 0.2 }));
    if (rest) {
      rowHeight += Math.max(8, doc.font("Helvetica").fontSize(6.7).heightOfString(rest, { width: textWidth, lineGap: 0.2 }));
    }
    return height + rowHeight + 5;
  }, 23);

  return Math.max(94, contentHeight + 10);
}

function loadCrewItinerary(itineraryId: string) {
  return prisma.crewItinerary.findUnique({
    where: { id: itineraryId },
    include: {
      production: true,
      crewMember: { include: { role: true, roleRequirement: true, blackbookEntry: true, contact: true } },
      items: {
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { order: "asc" }],
        include: { files: { include: { file: true }, orderBy: { createdAt: "asc" } } },
      },
      appendixPages: { where: { exportVisible: true }, orderBy: { order: "asc" } },
    },
  });
}

async function renderCrewItineraryPdf(itinerary: CrewItineraryDocument): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ margin: 0, size: "A4", bufferPages: true });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const production = itinerary.production;
  const crew = itinerary.crewMember;
  const role = crew.roleRequirement?.displayLabel ?? crew.role?.name ?? "Crew";
  const projectName = [production.clientName, production.brand].filter(Boolean).join(" · ") || production.title;
  const generated = new Date().toLocaleDateString("en-GB");
  const productionContact = production.contactId
    ? await prisma.contact.findUnique({ where: { id: production.contactId }, select: { firstName: true, lastName: true, email: true, phone: true } })
    : null;
  const visibleItems = itinerary.items.filter((item) => item.exportVisible);
  const title = displayItineraryTitle(itinerary.title, crew.name);

  drawBrandLogo(doc, PAGE.left, 62, 150);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(TEXT).text("TRAVEL ITINERARY", 398, 65, { width: 145, align: "right", characterSpacing: 1.4 });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Updated ${generated}`, 398, 82, { width: 145, align: "right" });

  let y = 122;
  doc.font("Helvetica-Bold").fontSize(19).fillColor(TEXT).text(title, PAGE.left, y, { width: PAGE.right - PAGE.left, lineGap: 1 });
  y += Math.max(34, doc.heightOfString(title, { width: PAGE.right - PAGE.left }) + 12);
  detailPair(doc, "Crew", crew.name, PAGE.left, y, 250);
  detailPair(doc, "Role", role, PAGE.left, y + 14, 250);
  detailPair(doc, "Email", crew.email ?? crew.blackbookEntry?.email ?? crew.contact?.email ?? "", PAGE.left, y + 28, 250);
  detailPair(doc, "Phone", crew.phone ?? crew.blackbookEntry?.phone ?? crew.contact?.phone ?? "", PAGE.left, y + 42, 250);
  detailPair(doc, "Project", projectName, 330, y, 210);
  detailPair(doc, "Job", production.jobCode ?? "", 330, y + 14, 210);
  detailPair(doc, "Production contact", [fullName(productionContact), productionContact?.phone, productionContact?.email].filter(Boolean).join(" · "), 330, y + 28, 210);
  if (itinerary.introNotes) {
    y += 62;
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(itinerary.introNotes, PAGE.left, y, { width: PAGE.right - PAGE.left, lineGap: 2 });
  }

  y = Math.max(y + 42, 250);
  rule(doc, y);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT).text("AT A GLANCE", PAGE.left, y + 14, { characterSpacing: 1.1 });
  y += 34;
  const glanceWidth = (PAGE.right - PAGE.left - 16) / 3;
  const hotelItems = visibleItems.filter((item) => item.type === "HOTEL");
  const eventItems = visibleItems.filter((item) => item.type === "EVENT");
  const travelItems = visibleItems.filter((item) => item.type === "FLIGHT" || item.type === "TRAIN");
  const glanceHeight = Math.max(
    glanceColumnHeight(doc, hotelItems, glanceWidth, glanceHotel),
    glanceColumnHeight(doc, eventItems, glanceWidth, glanceEvent),
    glanceColumnHeight(doc, travelItems, glanceWidth, glanceTravel),
  );
  if (y + glanceHeight + 52 > PAGE.bottom) {
    doc.addPage();
    y = PAGE.top;
    rule(doc, y);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT).text("AT A GLANCE", PAGE.left, y + 14, { characterSpacing: 1.1 });
    y += 34;
  }
  drawGlanceColumn(doc, "HOTELS", hotelItems, PAGE.left, y, glanceWidth, glanceHeight, glanceHotel);
  drawGlanceColumn(doc, "EVENTS", eventItems, PAGE.left + glanceWidth + 8, y, glanceWidth, glanceHeight, glanceEvent);
  drawGlanceColumn(
    doc,
    "TRAVEL",
    travelItems,
    PAGE.left + (glanceWidth + 8) * 2,
    y,
    glanceWidth,
    glanceHeight,
    glanceTravel,
  );

  y += glanceHeight + 22;
  rule(doc, y);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXT).text("SCHEDULE", PAGE.left, y + 14, { characterSpacing: 1.1 });
  y += 36;

  if (visibleItems.length === 0) {
    doc.roundedRect(PAGE.left, y, PAGE.right - PAGE.left, 58, 6).fillColor(SOFT).fill();
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text("No itinerary items have been added yet.", PAGE.left + 16, y + 22);
    y += 82;
  } else {
    let currentDate = "";
    for (const item of visibleItems) {
      const date = dateString(item.date);
      if (date && date !== currentDate) {
        y += currentDate ? 14 : 0;
        y = ensureSpace(doc, y, 104);
        currentDate = date;
        doc.roundedRect(PAGE.left, y, PAGE.right - PAGE.left, 24, 3).fillColor(DAY_BAND).fill();
        doc.font("Helvetica-Bold").fontSize(9.4).fillColor(TEXT).text(date.toUpperCase(), PAGE.left + 10, y + 8, {
          width: PAGE.right - PAGE.left - 20,
          characterSpacing: 0.9,
        });
        y += 34;
      }

      const details = itemDetails(item);
      const style = itemTypeStyle(item.type);
      const valueWidth = 292;
      const detailsHeight = detailRowsHeight(doc, details, valueWidth);
      const itemHeight = Math.max(48, 30 + detailsHeight);
      y = ensureSpace(doc, y, itemHeight + 12);

      doc.roundedRect(PAGE.left, y, PAGE.right - PAGE.left, itemHeight, 4).strokeColor(HAIRLINE).lineWidth(0.45).stroke();
      doc.roundedRect(PAGE.left, y, 4, itemHeight, 2).fillColor(style.accent).fill();
      doc.roundedRect(PAGE.left + 12, y + 9, 58, 16, 3).fillColor(style.tint).fill();
      doc.font("Helvetica-Bold").fontSize(6.8).fillColor(style.accent).text(style.label, PAGE.left + 16, y + 14, {
        width: 50,
        align: "center",
        characterSpacing: 0.45,
      });
      doc.font("Helvetica-Bold").fontSize(10.4).fillColor(TEXT).text(compactItemTime(item), PAGE.left + 12, y + 33, { width: 72, lineGap: 0.5 });
      doc.font("Helvetica-Bold").fontSize(9.2).fillColor(TEXT).text(itemTitle(item), PAGE.left + 94, y + 9, { width: 344 });
      let lineY = y + 25;
      details.forEach(([label, value]) => {
        const rowHeight = Math.max(9.5, doc.heightOfString(value, { width: valueWidth, lineGap: 0.5 }) + 1);
        doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED).text(`${label}:`, PAGE.left + 94, lineY, { width: 70 });
        doc.font("Helvetica").fontSize(7.4).fillColor(TEXT).text(value, PAGE.left + 168, lineY, { width: valueWidth, lineGap: 0.5 });
        lineY += rowHeight;
      });
      y += itemHeight + 8;
    }
  }

  for (const page of itinerary.appendixPages) {
    const tokens = htmlTokens(page.bodyHtml);
    if (tokens.length === 0) continue;
    doc.addPage();
    y = PAGE.top;
    rule(doc, y);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text(appendixPageTitle(page).toUpperCase(), PAGE.left, y + 16, { characterSpacing: 1.1 });
    y += 48;
    for (const token of tokens) {
      if (token.type === "html") {
        y = renderRichHtml(doc, y, token.value);
        continue;
      }

      const fileId = fileIdFromImageSrc(token.src);
      if (!fileId) continue;
      const file = await prisma.jobFile.findUnique({ where: { id: fileId }, select: { id: true, productionId: true, folder: true, storedFilename: true, mimeType: true } });
      if (!file || !file.mimeType.startsWith("image/")) continue;
      const imagePath = await resolveJobFilePath(file);
      const image = await fs.readFile(imagePath).catch(() => null);
      if (!image) continue;
      const printableWidth = PAGE.right - PAGE.left;
      const imageWidth = printableWidth * (token.widthPercent / 100);
      const imageX = PAGE.left + (printableWidth - imageWidth) / 2;
      y = ensureSpace(doc, y, 290);
      doc.image(image, imageX, y, { fit: [imageWidth, 280], align: "center" });
      y += 294;
    }
  }

  const attachmentRows = visibleItems.flatMap((item) => item.files.filter((link) => link.exportVisible).map((link) => ({ item, file: link.file })));
  for (const row of attachmentRows) {
    await renderAttachmentPage(doc, row.item, row.file);
  }

  const finished = new Promise<void>((resolve) => doc.on("end", resolve));
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7).fillColor(MUTED).text(`${production.jobCode ?? production.title} · ${crew.name}`, PAGE.left, 812, { width: 300 });
    doc.text(`Page ${i + 1} of ${range.count}`, 430, 812, { width: 115, align: "right" });
  }
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

export async function exportCrewItineraryPdf(itineraryId: string) {
  const itinerary = await loadCrewItinerary(itineraryId);
  if (!itinerary) throw new Error("Itinerary not found");
  const pdf = await renderCrewItineraryPdf(itinerary);
  const production = itinerary.production;
  const filename = `${cleanFilenamePart(production.jobCode ?? production.title)} - ${cleanFilenamePart(itinerary.crewMember.name)} Travel Itinerary.pdf`;
  const file = await autoFileDocument(production.id, "Crew Deals", pdf, filename, "application/pdf", {
    notes: `Travel itinerary for ${itinerary.crewMember.name}`,
  });
  await prisma.crewItinerary.update({
    where: { id: itinerary.id },
    data: { exportedAt: new Date(), status: "READY" },
  });
  return file;
}
