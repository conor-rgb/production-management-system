import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
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

type LinkItem = {
  label: string;
  url: string;
};

export type DeckBlockType = "field" | "links" | "dateStatus" | "imageGrid" | "notes" | "map" | "footer";
export type DeckField = "name" | "subtitle" | "location" | "address" | "clientNotes" | "internalNotes" | "project";
export type DeckImageLayout = "grid" | "justify";
export type DeckImageFit = "contain" | "cover" | "natural";
export type DeckVerticalAlign = "top" | "middle" | "bottom";
export type DeckImagePosition = "top" | "center" | "bottom";

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
  verticalAlign?: DeckVerticalAlign;
  lineHeight?: number;
  letterSpacing?: number;
  textColor?: string;
  textPadding?: number;
  textMaxLines?: number;
  uppercase?: boolean;
  hideIfEmpty?: boolean;
  imageCount?: number;
  imagePadding?: number;
  imageGap?: number;
  imageLayout?: DeckImageLayout;
  imageFit?: DeckImageFit;
  imagePosition?: DeckImagePosition;
  imageBackground?: string;
  imageBorder?: boolean;
  imageRadius?: number;
  imageAllowRows?: boolean;
  imageHideEmptySlots?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

const PAGE_WIDTH = 1920;
const PAGE_HEIGHT = 1080;
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

function cleanFilePart(value: string): string {
  return value.replace(/[\\/:\*\?"<>\|]/g, " ").replace(/\s+/g, " ").trim() || "Options";
}

export function optionsDeckFilename(group: OptionsDeckGroup): string {
  const jobCode = group.production.jobCode ?? "JOB";
  const date = new Date().toISOString().slice(0, 10);
  return `${jobCode}_${cleanFilePart(group.name)}_Options_${date}.pdf`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
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

function imageDataUrl(pathname: string | null | undefined): string | null {
  if (!pathname || !fs.existsSync(pathname)) return null;
  const ext = path.extname(pathname).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(pathname).toString("base64")}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(date);
}

function exportDate(): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

function orderedStatuses(candidate: DeckCandidate): DeckDateStatus[] {
  return candidate.dateStatuses
    .filter((status) => status.status !== "NA")
    .slice()
    .sort((a, b) => a.date.date.getTime() - b.date.date.getTime());
}

function drawableCandidates(group: OptionsDeckGroup): DeckCandidate[] {
  return group.candidates
    .filter((candidate) => candidate.activeState !== "RELEASED")
    .slice()
    .sort((a, b) => a.order - b.order || candidateDisplayName(a).localeCompare(candidateDisplayName(b)));
}

function baseTalentTemplate(group: OptionsDeckGroup): DeckTemplateBlock[] {
  return [
    { id: "name", type: "field", field: "name", label: "Name", x: 2, y: 4, w: 56, h: 8, fontSize: 52, fontWeight: 900, uppercase: true },
    { id: "project", type: "field", field: "project", label: "Project", x: 66, y: 5, w: 32, h: 4, fontSize: 16, align: "right" },
    { id: "links", type: "links", label: "Links", x: 2, y: 13, w: 42, h: 4, fontSize: 18, fontWeight: 800 },
    { id: "date-status", type: "dateStatus", label: "Date status", x: 67, y: 12, w: 31, h: 16, fontSize: 12, fontWeight: 800 },
    { id: "images", type: "imageGrid", label: "Images", x: 2, y: 22, w: 96, h: 56, imageCount: group.type === "LOCATION" ? 4 : 6, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain" },
    { id: "notes", type: "notes", field: "clientNotes", label: "Deck notes", x: 2, y: 81, w: 52, h: 10, fontSize: 18 },
    { id: "footer", type: "footer", label: "Footer", x: 2, y: 94, w: 96, h: 3, fontSize: 12 },
  ];
}

function baseLocationTemplate(): DeckTemplateBlock[] {
  return [
    { id: "name", type: "field", field: "name", label: "Location name", x: 2, y: 4, w: 70, h: 8, fontSize: 46, fontWeight: 900, uppercase: true },
    { id: "location", type: "field", field: "location", label: "City / country", x: 80, y: 5, w: 17, h: 4, fontSize: 14, align: "right" },
    { id: "links", type: "links", label: "Links", x: 2, y: 13, w: 36, h: 4, fontSize: 18, fontWeight: 800 },
    { id: "date-status", type: "dateStatus", label: "Date status", x: 2, y: 17, w: 34, h: 5, fontSize: 16, fontWeight: 800 },
    { id: "images", type: "imageGrid", label: "Images", x: 2, y: 24, w: 96, h: 31, imageCount: 4, imagePadding: 12, imageGap: 12, imageLayout: "grid", imageFit: "contain" },
    { id: "map", type: "map", label: "Map", x: 2, y: 57, w: 46, h: 33 },
    { id: "notes", type: "notes", field: "clientNotes", label: "Notes", x: 50, y: 59, w: 34, h: 18, fontSize: 15 },
    { id: "footer", type: "footer", label: "Footer", x: 2, y: 93, w: 96, h: 4, fontSize: 12 },
  ];
}

function defaultTemplateBlocks(group: OptionsDeckGroup): DeckTemplateBlock[] {
  return group.type === "LOCATION" ? baseLocationTemplate() : baseTalentTemplate(group);
}

function blockStyle(block: DeckTemplateBlock): string {
  return [
    `left:${block.x}%`,
    `top:${block.y}%`,
    `width:${block.w}%`,
    `height:${block.h}%`,
    `font-size:${block.fontSize ?? 16}px`,
    `font-weight:${block.fontWeight ?? 400}`,
    `text-align:${block.align ?? "left"}`,
    `text-transform:${block.uppercase ? "uppercase" : "none"}`,
  ].join(";");
}

function safeColor(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function textBlockStyle(block: DeckTemplateBlock): string {
  const alignItems = block.verticalAlign === "bottom" ? "flex-end" : block.verticalAlign === "middle" ? "center" : "flex-start";
  return [
    blockStyle(block),
    `color:${safeColor(block.textColor, TEXT)}`,
    `line-height:${block.lineHeight ?? 1.2}`,
    `letter-spacing:${block.letterSpacing ?? 0}px`,
    `padding:${block.textPadding ?? 0}px`,
    `display:flex`,
    `align-items:${alignItems}`,
  ].join(";");
}

function textInnerStyle(block: DeckTemplateBlock): string {
  if (!block.textMaxLines || block.textMaxLines <= 0) return "";
  return [
    `display:-webkit-box`,
    `-webkit-line-clamp:${block.textMaxLines}`,
    `-webkit-box-orient:vertical`,
    `overflow:hidden`,
  ].join(";");
}

function renderTextBlock(group: OptionsDeckGroup, candidate: DeckCandidate, block: DeckTemplateBlock): string {
  const value = fieldValue(group, candidate, block.field ?? "name") || block.label;
  if (block.hideIfEmpty && !fieldValue(group, candidate, block.field ?? "name").trim()) return "";
  return `<div class="block text-block" style="${textBlockStyle(block)}"><span style="${textInnerStyle(block)}">${escapeHtml(value).replace(/\n/g, "<br>")}</span></div>`;
}

function renderLinksBlock(candidate: DeckCandidate, block: DeckTemplateBlock): string {
  const links = candidateLinks(candidate);
  if (block.hideIfEmpty && links.length === 0) return "";
  const content = links.length
    ? links.map((link) => `<a href="${escapeAttr(link.url)}">${escapeHtml(link.label)}</a>`).join("")
    : `<span>Book</span><span>social</span><span>website</span><span>pdf</span>`;
  return `<div class="block links-block" style="${textBlockStyle(block)}">${content}</div>`;
}

function renderDateStatusBlock(candidate: DeckCandidate, block: DeckTemplateBlock): string {
  const statuses = orderedStatuses(candidate).slice(0, 8);
  const content = statuses.length
    ? statuses.map((item) => {
      const style = HOLD_STYLES[item.status];
      return `<div class="date-status-row" style="background:${style.fill};color:${style.text};border-color:${style.stroke};">${escapeHtml(formatDate(item.date.date))} — ${escapeHtml(style.label)}</div>`;
    }).join("")
    : `<div class="empty-block">Date status</div>`;
  return `<div class="block date-status-block" style="${blockStyle(block)}">${content}</div>`;
}

function renderImageGridBlock(candidate: DeckCandidate, block: DeckTemplateBlock): string {
  const selected = selectedPhotos(candidate);
  const count = Math.max(1, Math.min(12, block.imageCount ?? 4));
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const padding = Math.max(0, Math.min(80, block.imagePadding ?? 8));
  const gap = Math.max(0, Math.min(80, block.imageGap ?? block.imagePadding ?? 8));
  const fit = block.imageFit ?? (block.imageLayout === "justify" ? "natural" : "contain");
  const position = block.imagePosition ?? "bottom";
  const objectPosition = `center ${position === "center" ? "center" : position}`;
  const alignItems = position === "top" ? "flex-start" : position === "center" ? "center" : "flex-end";
  const cellStyle = [
    `align-items:${alignItems}`,
    `background:${safeColor(block.imageBackground, "#ffffff")}`,
    block.imageBorder ? `border:1px solid #e1e1dc` : "",
    `border-radius:${Math.max(0, Math.min(120, block.imageRadius ?? 0))}px`,
  ].filter(Boolean).join(";");
  const slots: Array<DeckPhoto | undefined> = block.imageHideEmptySlots ? selected.slice(0, count) : Array.from({ length: count }).map((_, index) => selected[index]);
  const cells = slots.map((photo, index) => {
    const src = imageDataUrl(photo?.storedPath);
    const ratio = photo?.width && photo.height ? Math.max(0.2, Math.min(8, photo.width / photo.height)) : 1.4;
    const style = block.imageLayout === "justify" ? ` style="--image-ratio:${ratio};${cellStyle}"` : ` style="${cellStyle}"`;
    return `<div class="image-cell"${style}>${src ? `<img class="image-fit-${fit}" style="object-position:${objectPosition};" src="${src}" alt="">` : `<div class="image-placeholder">No image</div>`}</div>`;
  }).join("");
  if (block.imageLayout === "justify") {
    return `<div class="block image-grid-block image-grid-block--justify ${block.imageAllowRows ? "image-grid-block--wrap" : ""}" style="${blockStyle(block)};--image-padding:${padding}px;--image-gap:${gap}px;">${cells}</div>`;
  }
  return `<div class="block image-grid-block" style="${blockStyle(block)};--image-padding:${padding}px;--image-gap:${gap}px;grid-template-columns:repeat(${columns},minmax(0,1fr));">${cells}</div>`;
}

function renderMapBlock(candidate: DeckCandidate, block: DeckTemplateBlock): string {
  const src = imageDataUrl(candidate.mapImagePath);
  const address = addressLines(candidate).join("<br>") || "Address / coordinates";
  const content = src ? `<img src="${src}" alt="">` : `<div class="map-placeholder"><strong>MAP</strong><span>${address}</span></div>`;
  return `<div class="block map-block" style="${blockStyle(block)}">${content}</div>`;
}

function renderFooterBlock(group: OptionsDeckGroup, block: DeckTemplateBlock, pageNumber: number): string {
  return `<div class="block footer-block" style="${blockStyle(block)}"><span>unlimited.bond</span><span>${escapeHtml(projectTitle(group))}</span><span>${pageNumber}</span></div>`;
}

function renderBlock(group: OptionsDeckGroup, candidate: DeckCandidate, block: DeckTemplateBlock, pageNumber: number): string {
  if (block.hidden) return "";
  if (block.type === "field" || block.type === "notes") return renderTextBlock(group, candidate, block);
  if (block.type === "links") return renderLinksBlock(candidate, block);
  if (block.type === "dateStatus") return renderDateStatusBlock(candidate, block);
  if (block.type === "imageGrid") return renderImageGridBlock(candidate, block);
  if (block.type === "map") return renderMapBlock(candidate, block);
  return renderFooterBlock(group, block, pageNumber);
}

export function renderOptionsDeckHtml(group: OptionsDeckGroup, templateBlocks?: DeckTemplateBlock[] | null): string {
  const blocks = templateBlocks?.length ? templateBlocks.filter((block) => !block.hidden) : defaultTemplateBlocks(group);
  const candidates = drawableCandidates(group);
  const body = candidates.length
    ? candidates.map((candidate, index) => (
      `<section class="page">${blocks.map((block) => renderBlock(group, candidate, block, index + 1)).join("")}</section>`
    )).join("")
    : `<section class="page empty-page"><h1>${escapeHtml(group.name)} options</h1><p>No active candidates are available for export.</p></section>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${PAGE_WIDTH}, initial-scale=1">
  <title>${escapeHtml(projectTitle(group))} — ${escapeHtml(group.name)} options</title>
  <style>
    @page { size: ${PAGE_WIDTH}px ${PAGE_HEIGHT}px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e8e8e4; color: ${TEXT}; font-family: Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { position: relative; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px; overflow: hidden; background: #fff; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .block { position: absolute; overflow: hidden; line-height: 1.2; }
    .text-block { white-space: pre-line; overflow-wrap: break-word; }
    .links-block { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
    .links-block a, .links-block span { color: ${TEXT}; text-decoration: underline; text-underline-offset: 3px; }
    .date-status-block { display: flex; flex-direction: column; gap: 7px; border: 0; }
    .date-status-row { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; border: 1px solid; border-radius: 2px; padding: 0 10px; font-weight: 700; letter-spacing: 0; white-space: nowrap; }
    .image-grid-block { display: grid; gap: var(--image-gap, 18px); padding: var(--image-padding, 8px); }
    .image-grid-block--justify { display: flex; align-items: flex-end; align-content: flex-end; flex-wrap: nowrap; overflow: hidden; }
    .image-grid-block--justify.image-grid-block--wrap { flex-wrap: wrap; }
    .image-grid-block--justify .image-cell { flex: 0 0 auto; height: 100%; aspect-ratio: var(--image-ratio, 1.4); }
    .image-grid-block--justify.image-grid-block--wrap .image-cell { height: calc((100% - var(--image-gap, 18px)) / 2); }
    .image-cell { min-width: 0; min-height: 0; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; background: #fff; }
    .image-cell img { display: block; object-position: center bottom; }
    .image-fit-contain { max-width: 100%; max-height: 100%; object-fit: contain; }
    .image-fit-cover { width: 100%; height: 100%; object-fit: cover; }
    .image-fit-natural { width: auto; height: 100%; max-width: none; object-fit: contain; }
    .image-placeholder { width: 100%; height: 100%; display: grid; place-items: end center; padding-bottom: 24px; color: #b8b8b2; background: #f0f0ee; border: 1px solid #e1e1dc; font-size: 24px; }
    .map-block { background: #eef3ee; border: 1px solid ${LIGHT_BORDER}; }
    .map-block img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .map-placeholder { height: 100%; padding: 18px; color: #6b6b66; font-size: 14px; line-height: 1.45; }
    .map-placeholder strong { display: block; margin-bottom: 12px; font-size: 18px; }
    .footer-block { display: grid; grid-template-columns: repeat(3, 1fr); align-items: start; color: ${TEXT}; }
    .footer-block span:nth-child(2) { color: ${MUTED}; text-align: center; }
    .footer-block span:nth-child(3) { text-align: right; }
    .empty-block { height: 100%; display: grid; place-items: center; color: #9a9a94; border: 1px solid ${LIGHT_BORDER}; }
    .empty-page { padding: 64px; }
    .empty-page h1 { margin: 0 0 24px; font-size: 42px; }
    .empty-page p { margin: 0; color: ${MUTED}; font-size: 22px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function renderOptionsDeckPdf(group: OptionsDeckGroup, templateBlocks?: DeckTemplateBlock[] | null): Promise<Buffer> {
  const html = renderOptionsDeckHtml(group, templateBlocks);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
