import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Folder,
  FolderPlus,
  Grid3X3,
  ImagePlus,
  Kanban,
  Link,
  List,
  Maximize2,
  MessageSquare,
  MousePointer2,
  Pencil,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Square,
  Star,
  Tag,
  Type,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ApiError, api } from "../../lib/api";
import type {
  ProductionSku,
  SelectsPayload,
  StillAnnotation,
  StillFolder,
  StillImage,
  StillShareLink,
  StillSourceAsset,
  StillStatus,
} from "../../lib/types";

const STATUSES: StillStatus[] = [
  "UPLOADED",
  "SHORTLIST",
  "CLIENT_SELECT",
  "TO_RETOUCH",
  "RETOUCHING",
  "CHANGES_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "REJECTED",
];

const STATUS_LABELS: Record<StillStatus, string> = {
  UPLOADED: "Uploaded",
  SHORTLIST: "Shortlist",
  CLIENT_SELECT: "Client Select",
  TO_RETOUCH: "To Retouch",
  RETOUCHING: "Retouching",
  CHANGES_REQUESTED: "Changes Requested",
  APPROVED: "Approved",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
};

type ViewMode = "gallery" | "list" | "kanban" | "ratings";
type UploadItem = { file: File; path: string };
type DrawingPoint = { x: number; y: number };
type MarkupKind = "pin" | "box" | "draw" | "arrow" | "text";
type AnnotationMarkup = { kind: MarkupKind; points: DrawingPoint[]; color?: string; opacity?: number; text?: string };
type AnnotationDraft = { body?: string; x?: number; y?: number; points?: DrawingPoint[]; markup?: AnnotationMarkup };
type ReviewerIdentity = { name: string; email: string };
type ClientFilter = "ALL" | "SELECTED" | "REJECTED" | "UNREVIEWED" | "HAS_DECISION" | "NEEDS_DECISION" | "COMMENTED" | "STARRED";
type ClientRatingFilter = "ALL" | "ZERO" | "ONE_PLUS" | "THREE_PLUS" | "FIVE" | "1" | "2" | "3" | "4" | "5";
type ClientNotesFilter = "ALL" | "HAS" | "OPEN" | "RESOLVED" | "NONE" | "MY";
type ClientRetouchFilter = "ALL" | "HAS_VERSION" | "NO_VERSION" | "TO_RETOUCH" | "CHANGES_REQUESTED" | "APPROVED" | "HAS_SOURCE" | "MISSING_SOURCE";
type UploadResult = {
  images?: StillImage[];
  createdCount?: number;
  skippedCount?: number;
  skippedCaptureOne?: number;
  skippedNonImage?: number;
  totalCount?: number;
};
const UPLOAD_BATCH_MAX_FILES = 30;
const UPLOAD_BATCH_MAX_BYTES = 80 * 1024 * 1024;
const INITIAL_VISIBLE_IMAGES = 180;
const VISIBLE_IMAGE_STEP = 180;
const filenameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const DRAWING_PREFIX = "[[DRAWING:";
const DRAWING_SUFFIX = "]]";
const CLIENT_FILTER_VALUES: ClientFilter[] = ["ALL", "SELECTED", "REJECTED", "UNREVIEWED", "HAS_DECISION", "NEEDS_DECISION", "COMMENTED", "STARRED"];
const CLIENT_RATING_VALUES: ClientRatingFilter[] = ["ALL", "ZERO", "ONE_PLUS", "THREE_PLUS", "FIVE", "1", "2", "3", "4", "5"];
const CLIENT_NOTES_VALUES: ClientNotesFilter[] = ["ALL", "HAS", "OPEN", "RESOLVED", "NONE", "MY"];
const CLIENT_RETOUCH_VALUES: ClientRetouchFilter[] = ["ALL", "HAS_VERSION", "NO_VERSION", "TO_RETOUCH", "CHANGES_REQUESTED", "APPROVED", "HAS_SOURCE", "MISSING_SOURCE"];

type ClientViewParams = {
  folderId: string | null;
  search: string;
  filter: ClientFilter;
  skuIds: string[];
  ratingFilter: ClientRatingFilter;
  notesFilter: ClientNotesFilter;
  retouchFilter: ClientRetouchFilter;
};

function queryValue<T extends string>(params: URLSearchParams, key: string, values: readonly T[], fallback: T): T {
  const value = params.get(key);
  return value && values.includes(value as T) ? value as T : fallback;
}

function readClientViewParams(): ClientViewParams {
  const params = new URLSearchParams(window.location.search);
  const skus = params.get("skus") || params.get("skuIds") || "";
  return {
    folderId: params.get("folder") || params.get("folderId") || null,
    search: params.get("q") || params.get("search") || "",
    filter: queryValue(params, "decision", CLIENT_FILTER_VALUES, queryValue(params, "filter", CLIENT_FILTER_VALUES, "ALL")),
    skuIds: skus.split(",").map((id) => id.trim()).filter(Boolean),
    ratingFilter: queryValue(params, "rating", CLIENT_RATING_VALUES, queryValue(params, "ratingFilter", CLIENT_RATING_VALUES, "ALL")),
    notesFilter: queryValue(params, "notes", CLIENT_NOTES_VALUES, queryValue(params, "notesFilter", CLIENT_NOTES_VALUES, "ALL")),
    retouchFilter: queryValue(params, "retouch", CLIENT_RETOUCH_VALUES, queryValue(params, "retouchFilter", CLIENT_RETOUCH_VALUES, "ALL")),
  };
}

function writeClientViewParams(state: ClientViewParams) {
  const params = new URLSearchParams();
  if (state.folderId) params.set("folder", state.folderId);
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.filter !== "ALL") params.set("decision", state.filter);
  if (state.skuIds.length > 0) params.set("skus", state.skuIds.join(","));
  if (state.ratingFilter !== "ALL") params.set("rating", state.ratingFilter);
  if (state.notesFilter !== "ALL") params.set("notes", state.notesFilter);
  if (state.retouchFilter !== "ALL") params.set("retouch", state.retouchFilter);
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, "", next);
}

function encodeDrawingBody(points: DrawingPoint[], body: string) {
  return `${DRAWING_PREFIX}${JSON.stringify(points)}${DRAWING_SUFFIX} ${body}`;
}

function decodeDrawingBody(body: string): { points: DrawingPoint[]; text: string } {
  if (!body.startsWith(DRAWING_PREFIX)) return { points: [], text: body };
  const end = body.indexOf(DRAWING_SUFFIX);
  if (end === -1) return { points: [], text: body };
  try {
    const raw = body.slice(DRAWING_PREFIX.length, end);
    const parsed = JSON.parse(raw) as DrawingPoint[];
    const points = Array.isArray(parsed)
      ? parsed
          .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      : [];
    return { points, text: body.slice(end + DRAWING_SUFFIX.length).trim() };
  } catch {
    return { points: [], text: body };
  }
}

function rectanglePoints(start: DrawingPoint, end: DrawingPoint): DrawingPoint[] {
  return [
    start,
    { x: end.x, y: start.y },
    end,
    { x: start.x, y: end.y },
    start,
  ];
}

function annotationText(annotation: StillAnnotation) {
  return decodeDrawingBody(annotation.body).text;
}

function isDrawingPoint(value: unknown): value is DrawingPoint {
  return Boolean(value && typeof value === "object" && Number.isFinite(Number((value as DrawingPoint).x)) && Number.isFinite(Number((value as DrawingPoint).y)));
}

function annotationMarkup(annotation: StillAnnotation): AnnotationMarkup | null {
  const stored = annotation.markup as Partial<AnnotationMarkup> | null | undefined;
  if (stored && typeof stored === "object" && Array.isArray(stored.points)) {
    const points = stored.points.filter(isDrawingPoint).map((point) => ({ x: Number(point.x), y: Number(point.y) }));
    if (points.length > 0 || stored.kind === "pin") {
      return {
        kind: stored.kind ?? "pin",
        points,
        color: stored.color || "#fbbf24",
        opacity: typeof stored.opacity === "number" ? stored.opacity : 0.55,
        text: typeof stored.text === "string" ? stored.text : undefined,
      };
    }
  }
  const legacy = decodeDrawingBody(annotation.body);
  if (legacy.points.length > 1) return { kind: legacy.points.length === 5 ? "box" : "draw", points: legacy.points, color: "#fbbf24", opacity: 0.55 };
  return null;
}

function sourceAssetLabel(image: StillImage) {
  const count = image.sourceAssets?.length ?? 0;
  return count > 0 ? `Source linked (${count})` : "Source missing";
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}

interface FileSystemDirectoryReaderLike {
  readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  createReader: () => FileSystemDirectoryReaderLike;
}

interface Props {
  productionId?: string;
  reviewToken?: string;
}

function imageSrc(image: StillImage, reviewToken?: string) {
  return reviewToken
    ? `/api/public/selects/${reviewToken}/images/${image.id}/preview`
    : `/api/files/${image.jobFileId}/preview`;
}

function imageThumbnailSrc(image: StillImage, reviewToken?: string) {
  return reviewToken
    ? `/api/public/selects/${reviewToken}/images/${image.id}/thumbnail`
    : `/api/productions/${image.productionId}/selects/images/${image.id}/thumbnail`;
}

function downloadHref(image: StillImage, reviewToken?: string) {
  return reviewToken
    ? `/api/public/selects/${reviewToken}/images/${image.id}/download`
    : `/api/productions/${image.productionId}/selects/images/${image.id}/download`;
}

function skuThumbnailSrc(sku: ProductionSku, reviewToken?: string) {
  if (!sku.thumbnailJobFileId) return null;
  return reviewToken
    ? `/api/public/selects/${reviewToken}/skus/${sku.id}/thumbnail`
    : `/api/files/${sku.thumbnailJobFileId}/preview`;
}

function skuLabel(sku: ProductionSku) {
  return sku.code?.trim() || [sku.name, sku.colorway].filter(Boolean).join(" · ") || "Untitled SKU";
}

function skuDetail(sku: ProductionSku) {
  return [sku.materialName, sku.hardware, sku.sourceSheet].filter(Boolean).join(" · ") || sku.name || sku.colorway || "No details";
}

function skuInitials(sku: ProductionSku) {
  return skuLabel(sku).slice(0, 2).toUpperCase();
}

function statusTone(status: StillStatus) {
  if (status === "APPROVED" || status === "DELIVERED") return "bg-emerald-100 text-emerald-800";
  if (status === "REJECTED" || status === "CHANGES_REQUESTED") return "bg-rose-100 text-rose-800";
  if (status === "TO_RETOUCH" || status === "RETOUCHING") return "bg-blue-100 text-blue-800";
  if (status === "CLIENT_SELECT" || status === "SHORTLIST") return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

function childFolders(folders: StillFolder[], parentId: string | null) {
  return folders.filter((folder) => (folder.parentId ?? null) === parentId);
}

function isCaptureOnePath(path: string) {
  return path.split(/[\\/]/).some((part) => part.toLowerCase() === "captureone");
}

function isUploadableImage(item: UploadItem) {
  if (item.file.type.startsWith("image/")) return true;
  return /\.(avif|heic|heif|jpeg|jpg|png|tif|tiff|webp)$/i.test(item.path);
}

function fileFromEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  const entries: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function uploadItemsFromEntry(entry: FileSystemEntryLike, parentPath = ""): Promise<UploadItem[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (isCaptureOnePath(path)) return [];
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntryLike);
    return [{ file, path }];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntryLike).createReader();
  const children = await readDirectoryEntries(reader);
  const nested = await Promise.all(children.map((child) => uploadItemsFromEntry(child, path)));
  return nested.flat();
}

async function uploadItemsFromDrop(event: DragEvent<HTMLElement>): Promise<UploadItem[]> {
  const entries = Array.from(event.dataTransfer.items)
    .map((item) => {
      const getEntry = (item as unknown as { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry;
      return getEntry?.call(item) ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => Boolean(entry));

  if (entries.length > 0) {
    const nested = await Promise.all(entries.map((entry) => uploadItemsFromEntry(entry)));
    return nested.flat();
  }

  return Array.from(event.dataTransfer.files).map((file) => ({ file, path: file.name }));
}

function uploadItemsFromFileList(files: FileList | null): UploadItem[] {
  if (!files) return [];
  return Array.from(files)
    .map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }))
    .filter((item) => !isCaptureOnePath(item.path));
}

function uploadBatches(items: UploadItem[]): UploadItem[][] {
  const batches: UploadItem[][] = [];
  let current: UploadItem[] = [];
  let currentBytes = 0;

  for (const item of items) {
    const startsNewBatch =
      current.length > 0 &&
      (current.length >= UPLOAD_BATCH_MAX_FILES || currentBytes + item.file.size > UPLOAD_BATCH_MAX_BYTES);
    if (startsNewBatch) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(item);
    currentBytes += item.file.size;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export default function SelectsPortal({ productionId, reviewToken }: Props) {
  const clientMode = Boolean(reviewToken);
  const initialClientViewRef = useRef<ClientViewParams | null>(null);
  if (initialClientViewRef.current === null) initialClientViewRef.current = readClientViewParams();
  const initialClientView = initialClientViewRef.current;
  const [payload, setPayload] = useState<SelectsPayload | null>(null);
  const [folderId, setFolderId] = useState<string | null>(() => clientMode ? initialClientView.folderId : null);
  const [status, setStatus] = useState<StillStatus | "ALL">("ALL");
  const [skuId, setSkuId] = useState<string>("ALL");
  const [rating, setRating] = useState<string>("ALL");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [heroOnly, setHeroOnly] = useState(false);
  const [openNotesOnly, setOpenNotesOnly] = useState(false);
  const [search, setSearch] = useState(() => clientMode ? initialClientView.search : "");
  const [view, setView] = useState<ViewMode>("gallery");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState<StillImage | null>(null);
  const [lightboxImage, setLightboxImage] = useState<StillImage | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewer, setReviewer] = useState<ReviewerIdentity>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("selectsReviewer") || "null") || { name: "", email: "" };
    } catch {
      return { name: "", email: "" };
    }
  });
  const [clientFilter, setClientFilter] = useState<ClientFilter>(() => initialClientView.filter);
  const [clientSkuIds, setClientSkuIds] = useState<string[]>(() => initialClientView.skuIds);
  const [clientRatingFilter, setClientRatingFilter] = useState<ClientRatingFilter>(() => initialClientView.ratingFilter);
  const [clientNotesFilter, setClientNotesFilter] = useState<ClientNotesFilter>(() => initialClientView.notesFilter);
  const [clientRetouchFilter, setClientRetouchFilter] = useState<ClientRetouchFilter>(() => initialClientView.retouchFilter);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [uploadError, setUploadError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTargetId, setFolderDropTargetId] = useState<string | null>(null);
  const [clientLoadingMore, setClientLoadingMore] = useState(false);
  const [clientLoadMoreError, setClientLoadMoreError] = useState("");
  const [clientPasswordRequired, setClientPasswordRequired] = useState(false);
  const [clientPassword, setClientPassword] = useState("");
  const [clientPasswordError, setClientPasswordError] = useState("");
  const [clientUnlocking, setClientUnlocking] = useState(false);
  const [managerLoadingMore, setManagerLoadingMore] = useState(false);
  const [managerLoadMoreError, setManagerLoadMoreError] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientLoadingMoreRef = useRef(false);
  const managerLoadingMoreRef = useRef(false);
  const realtimeRefreshRef = useRef<number | null>(null);
  const hasClientActiveFilters = Boolean(folderId) || search.trim().length > 0 || clientFilter !== "ALL" || clientSkuIds.length > 0 || clientRatingFilter !== "ALL" || clientNotesFilter !== "ALL" || clientRetouchFilter !== "ALL";
  const hasManagerActiveFilters = Boolean(folderId) || status !== "ALL" || skuId !== "ALL" || rating !== "ALL" || selectedOnly || heroOnly || openNotesOnly || search.trim().length > 0;

  function clientQueryParams(offset = 0, limit = INITIAL_VISIBLE_IMAGES) {
    const params = new URLSearchParams();
    if (folderId) params.set("folderId", folderId);
    if (clientFilter !== "ALL") params.set("filter", clientFilter);
    if (clientSkuIds.length > 0) params.set("skuIds", clientSkuIds.join(","));
    if (clientRatingFilter !== "ALL") params.set("ratingFilter", clientRatingFilter);
    if (clientNotesFilter !== "ALL") params.set("notesFilter", clientNotesFilter);
    if (clientRetouchFilter !== "ALL") params.set("retouchFilter", clientRetouchFilter);
    if (reviewer.name.trim()) params.set("reviewerName", reviewer.name.trim());
    if (reviewer.email.trim()) params.set("reviewerEmail", reviewer.email.trim());
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", offset === 0 && hasClientActiveFilters ? "all" : String(limit));
    params.set("offset", String(offset));
    return params;
  }

  function managerQueryParams(offset = 0, limit = INITIAL_VISIBLE_IMAGES) {
    const params = new URLSearchParams();
    if (folderId) params.set("folderId", folderId);
    if (status !== "ALL") params.set("status", status);
    if (skuId !== "ALL") params.set("skuId", skuId);
    if (rating !== "ALL") params.set("rating", rating);
    if (selectedOnly) params.set("selected", "true");
    if (heroOnly) params.set("hero", "true");
    if (openNotesOnly) params.set("notes", "open");
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", offset === 0 && hasManagerActiveFilters ? "all" : String(limit));
    params.set("offset", String(offset));
    return params;
  }

  const load = useCallback(async () => {
    if (reviewToken) {
      const params = clientQueryParams(0, INITIAL_VISIBLE_IMAGES);
      const data = await api.get<SelectsPayload>(`/api/public/selects/${reviewToken}?${params}`);
      setPayload(data);
      setClientPasswordRequired(false);
      setClientLoadMoreError("");
      return;
    }
    if (!productionId) return;
    const params = managerQueryParams(0, INITIAL_VISIBLE_IMAGES);
    const data = await api.get<SelectsPayload>(`/api/productions/${productionId}/selects?${params}`);
    setPayload(data);
    setManagerLoadMoreError("");
  }, [clientFilter, clientNotesFilter, clientRatingFilter, clientRetouchFilter, clientSkuIds, folderId, heroOnly, openNotesOnly, productionId, rating, reviewToken, reviewer.email, reviewer.name, search, selectedOnly, skuId, status]);

  useEffect(() => {
    load().catch((error) => {
      const body = error instanceof ApiError && typeof error.body === "object" && error.body !== null ? error.body as { requiresPassword?: boolean; error?: string } : null;
      if (clientMode && error instanceof ApiError && error.status === 401 && body?.requiresPassword) {
        setPayload(null);
        setClientPasswordRequired(true);
        setClientPasswordError("");
        return;
      }
      console.error(error);
    });
  }, [clientMode, load]);
  useEffect(() => { folderInputRef.current?.setAttribute("webkitdirectory", "true"); }, []);
  useEffect(() => {
    if (clientMode && (reviewer.name || reviewer.email)) {
      window.localStorage.setItem("selectsReviewer", JSON.stringify(reviewer));
    }
  }, [clientMode, reviewer]);
  useEffect(() => {
    if (!clientMode) return;
    writeClientViewParams({
      folderId,
      search,
      filter: clientFilter,
      skuIds: clientSkuIds,
      ratingFilter: clientRatingFilter,
      notesFilter: clientNotesFilter,
      retouchFilter: clientRetouchFilter,
    });
  }, [clientFilter, clientMode, clientNotesFilter, clientRatingFilter, clientRetouchFilter, clientSkuIds, folderId, search]);
  useEffect(() => {
    if (!clientMode) return;
    function handlePopState() {
      const params = readClientViewParams();
      setFolderId(params.folderId);
      setSearch(params.search);
      setClientFilter(params.filter);
      setClientSkuIds(params.skuIds);
      setClientRatingFilter(params.ratingFilter);
      setClientNotesFilter(params.notesFilter);
      setClientRetouchFilter(params.retouchFilter);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clientMode]);

  useEffect(() => {
    if (clientMode && clientPasswordRequired) return;
    const endpoint = reviewToken
      ? `/api/public/selects/${reviewToken}/events`
      : productionId
        ? `/api/productions/${productionId}/selects/events`
        : null;
    if (!endpoint) return;
    const source = new EventSource(endpoint, { withCredentials: true });
    function refreshSoon() {
      if (realtimeRefreshRef.current !== null) window.clearTimeout(realtimeRefreshRef.current);
      realtimeRefreshRef.current = window.setTimeout(() => {
        realtimeRefreshRef.current = null;
        load().catch(console.error);
      }, 180);
    }
    source.addEventListener("selects-update", refreshSoon);
    return () => {
      source.close();
      if (realtimeRefreshRef.current !== null) {
        window.clearTimeout(realtimeRefreshRef.current);
        realtimeRefreshRef.current = null;
      }
    };
  }, [clientMode, clientPasswordRequired, load, productionId, reviewToken]);

  const images = useMemo(() => payload?.images ?? [], [payload?.images]);
  const totalImageCount = payload?.pagination?.total ?? images.length;
  const allImageCount = payload?.totalImages ?? totalImageCount;
  const sortedImages = useMemo(() => [...images].sort((a, b) => {
    const filename = filenameCollator.compare(a.jobFile.originalFilename, b.jobFile.originalFilename);
    if (filename !== 0) return filename;
    return filenameCollator.compare(a.id, b.id);
  }), [images]);
  const folders = useMemo(() => payload?.folders ?? [], [payload?.folders]);
  const skus = useMemo(() => payload?.skus ?? [], [payload?.skus]);
  const selectedImages = images.filter((image) => selectedIds.includes(image.id));
  const visibleImages = images;
  const allowDownloads = !clientMode || Boolean(payload?.shareLink?.allowDownloads);
  const hasFilters = status !== "ALL" || skuId !== "ALL" || rating !== "ALL" || selectedOnly || heroOnly || openNotesOnly || search.trim().length > 0;
  const visibleClientImages = images;
  const selectedClientCount = payload?.statusCounts?.CLIENT_SELECT ?? visibleClientImages.filter((image) => image.status === "CLIENT_SELECT").length;
  const rejectedClientCount = payload?.statusCounts?.REJECTED ?? visibleClientImages.filter((image) => image.status === "REJECTED").length;
  const shareLinks = payload?.shareLinks ?? [];

  useEffect(() => {
    setActiveImage((current) => current ? images.find((image) => image.id === current.id) ?? current : current);
    setLightboxImage((current) => current ? images.find((image) => image.id === current.id) ?? current : current);
  }, [images]);

  const countsByFolder = useMemo(() => {
    if (payload?.folderCounts) return new Map(Object.entries(payload.folderCounts));
    const counts = new Map<string, number>();
    for (const image of images) {
      if (image.folderId) counts.set(image.folderId, (counts.get(image.folderId) ?? 0) + 1);
    }
    return counts;
  }, [images, payload?.folderCounts]);

  function mergeImage(updated: StillImage) {
    setPayload((current) => current ? { ...current, images: current.images.map((image) => image.id === updated.id ? updated : image) } : current);
    setActiveImage((current) => current?.id === updated.id ? updated : current);
    setLightboxImage((current) => current?.id === updated.id ? updated : current);
  }

  async function loadMoreClientImages() {
    if (!reviewToken || clientLoadingMoreRef.current) return;
    const currentCount = payload?.images.length ?? 0;
    const total = payload?.pagination?.total ?? currentCount;
    if (currentCount >= total) return;

    clientLoadingMoreRef.current = true;
    setClientLoadingMore(true);
    setClientLoadMoreError("");
    try {
      const params = clientQueryParams(currentCount, VISIBLE_IMAGE_STEP);
      const next = await api.get<SelectsPayload>(`/api/public/selects/${reviewToken}?${params}`);
      setPayload((current) => {
        if (!current) return next;
        const existingIds = new Set(current.images.map((image) => image.id));
        const appendedImages = next.images.filter((image) => !existingIds.has(image.id));
        const loadedCount = current.images.length + appendedImages.length;
        const nextTotal = next.pagination?.total ?? total;
        return {
          ...current,
          folders: next.folders,
          skus: next.skus,
          shareLink: next.shareLink,
          totalImages: next.totalImages,
          folderCounts: next.folderCounts,
          pagination: {
            total: nextTotal,
            offset: 0,
            limit: loadedCount,
            hasMore: loadedCount < nextTotal,
          },
          images: [...current.images, ...appendedImages],
        };
      });
    } catch (error) {
      setClientLoadMoreError(error instanceof Error ? error.message : "Could not load more images");
    } finally {
      clientLoadingMoreRef.current = false;
      setClientLoadingMore(false);
    }
  }

  async function loadMoreManagerImages() {
    if (!productionId || managerLoadingMoreRef.current) return;
    const currentCount = payload?.images.length ?? 0;
    const total = payload?.pagination?.total ?? currentCount;
    if (currentCount >= total) return;

    managerLoadingMoreRef.current = true;
    setManagerLoadingMore(true);
    setManagerLoadMoreError("");
    try {
      const params = managerQueryParams(currentCount, VISIBLE_IMAGE_STEP);
      const next = await api.get<SelectsPayload>(`/api/productions/${productionId}/selects?${params}`);
      setPayload((current) => {
        if (!current) return next;
        const existingIds = new Set(current.images.map((image) => image.id));
        const appendedImages = next.images.filter((image) => !existingIds.has(image.id));
        const loadedCount = current.images.length + appendedImages.length;
        const nextTotal = next.pagination?.total ?? total;
        return {
          ...current,
          folders: next.folders,
          skus: next.skus,
          shareLinks: next.shareLinks,
          totalImages: next.totalImages,
          folderCounts: next.folderCounts,
          pagination: {
            total: nextTotal,
            offset: 0,
            limit: loadedCount,
            hasMore: loadedCount < nextTotal,
          },
          images: [...current.images, ...appendedImages],
        };
      });
    } catch (error) {
      setManagerLoadMoreError(error instanceof Error ? error.message : "Could not load more images");
    } finally {
      managerLoadingMoreRef.current = false;
      setManagerLoadingMore(false);
    }
  }

  async function unlockClientLink() {
    if (!reviewToken || clientUnlocking) return;
    setClientUnlocking(true);
    setClientPasswordError("");
    try {
      await api.post(`/api/public/selects/${reviewToken}/unlock`, { password: clientPassword });
      setClientPassword("");
      setClientPasswordRequired(false);
      await load();
    } catch (error) {
      setClientPasswordError(error instanceof Error ? error.message : "Incorrect password");
    } finally {
      setClientUnlocking(false);
    }
  }

  async function uploadFiles(items: UploadItem[]) {
    if (!productionId) return;
    const uploadableItems = items.filter((item) => !isCaptureOnePath(item.path) && isUploadableImage(item));
    const clientSkippedCaptureOne = items.filter((item) => isCaptureOnePath(item.path)).length;
    const clientSkippedNonImage = items.length - uploadableItems.length - clientSkippedCaptureOne;
    if (uploadableItems.length === 0) {
      setUploadStatus("");
      setUploadError("No uploadable images found. CaptureOne folders and non-image files are skipped.");
      return;
    }
    setUploadError("");
    setUploading(true);
    const batches = uploadBatches(uploadableItems);
    let createdCount = 0;
    let skippedCount = clientSkippedCaptureOne + clientSkippedNonImage;
    setUploadStatus(`Uploading ${uploadableItems.length} image${uploadableItems.length === 1 ? "" : "s"} in ${batches.length} batch${batches.length === 1 ? "" : "es"}...`);
    try {
      for (const [index, batch] of batches.entries()) {
        setUploadStatus(`Uploading batch ${index + 1} of ${batches.length} (${batch.length} images)...`);
        const form = new FormData();
        if (folderId) form.append("folderId", folderId);
        batch.forEach((item) => {
          form.append("files", item.file);
          form.append("paths", item.path);
        });
        const res = await fetch(`/api/productions/${productionId}/selects/upload`, { method: "POST", credentials: "include", body: form });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Upload failed: ${res.status}`);
        const result = await res.json().catch(() => null) as UploadResult | StillImage[] | null;
        if (Array.isArray(result)) {
          createdCount += result.length;
        } else {
          createdCount += result?.createdCount ?? result?.images?.length ?? batch.length;
          skippedCount += result?.skippedCount ?? 0;
        }
      }
      await load();
      const skippedLabel = skippedCount > 0 ? ` Skipped ${skippedCount} CaptureOne or non-image file${skippedCount === 1 ? "" : "s"}.` : "";
      setUploadStatus(`Uploaded ${createdCount} image${createdCount === 1 ? "" : "s"}.${skippedLabel}`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
      setUploadStatus("");
    } finally {
      setUploading(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (clientMode) return;
    event.preventDefault();
    if (event.dataTransfer.types.includes("application/x-still-folder")) return;
    setDragging(false);
    setUploadError("");
    setUploadStatus("Preparing dropped folder...");
    const items = await uploadItemsFromDrop(event);
    if (items.length === 0) {
      setUploadStatus("");
      setUploadError("No files were found in that drop. Try dropping onto the Selects panel, or use the folder upload button.");
      return;
    }
    await uploadFiles(items);
  }

  async function createFolder(parentId: string | null) {
    if (!productionId) return;
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    await api.post<StillFolder>(`/api/productions/${productionId}/selects/folders`, { name: name.trim(), parentId });
    await load();
  }

  async function deleteFolder(id: string) {
    const folder = folders.find((item) => item.id === id);
    const message = `Permanently delete "${folder?.name ?? "this folder"}" and every image inside it, including subfolders, original files, thumbnails, and retouch versions? This cannot be undone.`;
    if (!productionId || !window.confirm(message)) return;
    await api.delete(`/api/productions/${productionId}/selects/folders/${id}`);
    if (folderId === id) setFolderId(null);
    await load();
  }

  async function deleteImages(imageIds: string[]) {
    if (!productionId || imageIds.length === 0) return;
    const message = `Permanently delete ${imageIds.length} image${imageIds.length === 1 ? "" : "s"}, including original files, thumbnails, and retouch versions? This cannot be undone.`;
    if (!window.confirm(message)) return;
    await api.post(`/api/productions/${productionId}/selects/images/delete`, { imageIds });
    setSelectedIds((ids) => ids.filter((id) => !imageIds.includes(id)));
    setActiveImage((image) => image && imageIds.includes(image.id) ? null : image);
    setLightboxImage((image) => image && imageIds.includes(image.id) ? null : image);
    await load();
  }

  async function moveFolder(id: string, parentId: string | null) {
    if (!productionId || id === parentId) return;
    await api.patch<StillFolder>(`/api/productions/${productionId}/selects/folders/${id}`, { parentId });
    await load();
  }

  async function patchImage(image: StillImage, patch: Partial<StillImage>) {
    const optimistic = { ...image, ...patch };
    mergeImage(optimistic);
    if (reviewToken) {
      const actor = { reviewerName: reviewer.name, reviewerEmail: reviewer.email };
      if (patch.rating !== undefined) {
        await api.post(`/api/public/selects/${reviewToken}/images/${image.id}/rating`, { rating: patch.rating, ...actor });
      }
      if (patch.status !== undefined) {
        const selected = patch.status === "UPLOADED" ? null : patch.status !== "REJECTED";
        await api.post(`/api/public/selects/${reviewToken}/images/${image.id}/select`, { selected, ...actor });
      }
      return;
    }
    if (!productionId) return;
    const updated = await api.patch<StillImage>(`/api/productions/${productionId}/selects/images/${image.id}`, patch);
    mergeImage(updated);
  }

  async function saveImageSkus(image: StillImage, nextSkuIds: string[]) {
    if (!productionId) return;
    const updated = await api.post<StillImage>(`/api/productions/${productionId}/selects/images/${image.id}/skus`, { skuIds: nextSkuIds });
    setActiveImage(updated);
    await load();
  }

  async function addSku() {
    if (!productionId) return;
    const code = window.prompt("SKU code");
    if (!code?.trim()) return;
    await api.post<ProductionSku>(`/api/productions/${productionId}/selects/skus`, { code: code.trim() });
    await load();
  }

  async function importSkus() {
    if (!productionId) return;
    const csv = window.prompt("Paste CSV rows: code,name,description,colorway,notes");
    if (!csv?.trim()) return;
    await api.post<ProductionSku[]>(`/api/productions/${productionId}/selects/skus/import`, { csv });
    await load();
  }

  async function uploadSkuThumbnail(sku: ProductionSku, file: File) {
    if (!productionId) return;
    const form = new FormData();
    form.append("file", file);
    await fetch(`/api/productions/${productionId}/selects/skus/${sku.id}/thumbnail`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Upload failed");
    });
    await load();
  }

  async function setSelectedImageForSku(sku: ProductionSku) {
    if (!productionId) return;
    const image = selectedImages[0] || activeImage;
    if (!image) {
      window.alert("Select an image first.");
      return;
    }
    await api.post(`/api/productions/${productionId}/selects/skus/${sku.id}/thumbnail-from-image`, { imageId: image.id });
    await load();
  }

  async function batchUpdate(patch: { status?: StillStatus; rating?: number | null; folderId?: string | null; skuIds?: string[]; isHero?: boolean }) {
    if (!productionId || selectedIds.length === 0) return;
    await api.post(`/api/productions/${productionId}/selects/batch`, { imageIds: selectedIds, ...patch });
    setSelectedIds([]);
    await load();
  }

  async function batchCopy(nextFolderId: string | null) {
    if (!productionId || selectedIds.length === 0) return;
    await api.post(`/api/productions/${productionId}/selects/batch-copy`, { imageIds: selectedIds, folderId: nextFolderId });
    setSelectedIds([]);
    await load();
  }

  function toggleSelectVisible() {
    const visibleIds = visibleImages.map((image) => image.id);
    if (visibleIds.length === 0) return;
    setSelectedIds((current) => {
      const selected = new Set(current);
      const allVisibleSelected = visibleIds.every((id) => selected.has(id));
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      for (const id of visibleIds) selected.add(id);
      return Array.from(selected);
    });
  }

  async function downloadOriginalsZip(scope: "selected" | "folder") {
    if (!productionId) return;
    const body = scope === "selected" ? { imageIds: selectedIds } : folderId ? { folderId } : {};
    if (scope === "selected" && selectedIds.length === 0) return;
    const response = await fetch(`/api/productions/${productionId}/selects/download-zip`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      window.alert(error.error ?? "ZIP download failed");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = match?.[1] ?? "selects-originals.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadClientZip(scope: "selected" | "folder" | "view") {
    if (!reviewToken || !allowDownloads) return;
    const body = scope === "selected"
      ? { mode: "selected" }
      : scope === "view"
        ? {
          mode: "view",
          folderId,
          filter: clientFilter,
          skuIds: clientSkuIds,
          ratingFilter: clientRatingFilter,
          notesFilter: clientNotesFilter,
          retouchFilter: clientRetouchFilter,
          search,
          reviewerName: reviewer.name,
          reviewerEmail: reviewer.email,
        }
        : folderId ? { folderId } : {};
    const response = await fetch(`/api/public/selects/${reviewToken}/download-zip`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      window.alert(error.error ?? "ZIP download failed");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = match?.[1] ?? "selects-originals.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadRetouchPackage() {
    if (!reviewToken) return;
    const response = await fetch(`/api/public/selects/${reviewToken}/retouch-package`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      window.alert(error.error ?? "Retouch package download failed");
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = match?.[1] ?? "retouch-package.zip";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function selectVisibleClientImages() {
    if (!reviewToken || visibleClientImages.length === 0) return;
    const targets = visibleClientImages.filter((image) => image.status !== "CLIENT_SELECT");
    if (targets.length === 0) return;
    const imageIds = targets.map((image) => image.id);
    setPayload((current) => {
      if (!current) return current;
      const nextSelectedCount = (current.statusCounts?.CLIENT_SELECT ?? 0) + targets.length;
      const rejectedToSelected = targets.filter((image) => image.status === "REJECTED").length;
      const nextRejectedCount = Math.max(0, (current.statusCounts?.REJECTED ?? 0) - rejectedToSelected);
      return {
        ...current,
        statusCounts: { ...current.statusCounts, CLIENT_SELECT: nextSelectedCount, REJECTED: nextRejectedCount },
        images: current.images.map((image) => imageIds.includes(image.id) ? { ...image, status: "CLIENT_SELECT" } : image),
      };
    });
    await api.post(`/api/public/selects/${reviewToken}/images/batch-select`, {
      imageIds,
      selected: true,
      reviewerName: reviewer.name,
      reviewerEmail: reviewer.email,
    });
  }

  async function addAnnotation(image: StillImage, draft?: AnnotationDraft) {
    const body = draft?.body?.trim() || window.prompt("Retouch note")?.trim();
    if (!body) return;
    const x = draft?.x ?? 0.5;
    const y = draft?.y ?? 0.5;
    const markup = draft?.markup ?? (draft?.points?.length ? { kind: "box" as const, points: draft.points, color: "#fbbf24", opacity: 0.55 } : undefined);
    const encodedBody = markup ? body : draft?.points?.length ? encodeDrawingBody(draft.points, body) : body;
    if (reviewToken) {
      const annotation = await api.post<StillAnnotation>(`/api/public/selects/${reviewToken}/images/${image.id}/annotations`, { body: encodedBody, x, y, markup, reviewerName: reviewer.name, reviewerEmail: reviewer.email });
      mergeImage({ ...image, annotations: [...image.annotations, annotation] });
    } else if (productionId) {
      const annotation = await api.post<StillAnnotation>(`/api/productions/${productionId}/selects/images/${image.id}/annotations`, { body: encodedBody, x, y, markup, visibility: "INTERNAL" });
      mergeImage({ ...image, annotations: [...image.annotations, annotation] });
    }
  }

  async function toggleAnnotation(annotation: StillAnnotation) {
    if (reviewToken) {
      await api.patch(`/api/public/selects/${reviewToken}/annotations/${annotation.id}`, { resolved: !annotation.resolved, reviewerName: reviewer.name, reviewerEmail: reviewer.email });
    } else if (productionId) {
      await api.patch(`/api/productions/${productionId}/selects/annotations/${annotation.id}`, { resolved: !annotation.resolved });
    } else {
      return;
    }
    await load();
  }

  async function editAnnotation(annotation: StillAnnotation) {
    const body = window.prompt("Edit note", annotationText(annotation));
    if (body === null) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    if (reviewToken) {
      await api.patch(`/api/public/selects/${reviewToken}/annotations/${annotation.id}`, { body: trimmed, reviewerName: reviewer.name, reviewerEmail: reviewer.email });
    } else if (productionId) {
      await api.patch(`/api/productions/${productionId}/selects/annotations/${annotation.id}`, { body: trimmed });
    } else {
      return;
    }
    await load();
  }

  async function deleteAnnotation(annotation: StillAnnotation) {
    if (!window.confirm("Delete this note permanently?")) return;
    if (reviewToken) {
      await api.delete(`/api/public/selects/${reviewToken}/annotations/${annotation.id}`);
    } else if (productionId) {
      await api.delete(`/api/productions/${productionId}/selects/annotations/${annotation.id}`);
    } else {
      return;
    }
    await load();
  }

  async function createShareLink(role: "CLIENT" | "RETOUCHER" = "CLIENT") {
    if (!productionId) return;
    const label = window.prompt("Share link label", role === "RETOUCHER" ? "Retoucher upload" : "Client review");
    if (label === null) return;
    const password = window.prompt("Optional password (leave blank for no password)", "");
    const link = await api.post<StillShareLink>(`/api/productions/${productionId}/selects/share-links`, {
      label,
      role,
      folderId,
      allowDownloads: role === "RETOUCHER",
      watermark: true,
      password: password?.trim() || undefined,
    });
    await copyShareUrl(link);
    await load();
  }

  async function updateShareLink(link: StillShareLink, patch: Partial<StillShareLink> & { password?: string | null }) {
    if (!productionId) return;
    await api.patch<StillShareLink>(`/api/productions/${productionId}/selects/share-links/${link.id}`, patch);
    await load();
  }

  async function deleteShareLink(link: StillShareLink) {
    if (!productionId) return;
    if (!window.confirm(`Permanently revoke "${link.label || "this review link"}"? Anyone with this URL will lose access.`)) return;
    await api.delete(`/api/productions/${productionId}/selects/share-links/${link.id}`);
    await load();
  }

  async function copyShareUrl(link: StillShareLink) {
    const path = link.url ?? `/selects/review/${link.token}`;
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard?.writeText(url);
    setCopiedShareId(link.id);
    window.setTimeout(() => setCopiedShareId((current) => current === link.id ? null : current), 2500);
  }

  function toggleSelected(imageId: string) {
    setSelectedIds((current) => current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId]);
  }

  async function submitClientReview() {
    if (!reviewToken) return;
    await api.post(`/api/public/selects/${reviewToken}/submit`, { reviewerName: reviewer.name, reviewerEmail: reviewer.email });
    setReviewSubmitted(true);
  }

  async function uploadRetouchVersion(image: StillImage, file: File) {
    if (!reviewToken && !productionId) return;
    const form = new FormData();
    form.append("file", file);
    form.append("reviewerName", reviewer.name);
    form.append("reviewerEmail", reviewer.email);
    const endpoint = reviewToken
      ? `/api/public/selects/${reviewToken}/images/${image.id}/retouch-versions`
      : `/api/productions/${productionId}/selects/images/${image.id}/retouch-versions`;
    await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (response) => {
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Upload failed");
    });
    await load();
  }

  async function addSourceLink(image: StillImage) {
    if (!productionId) return;
    const externalUrl = window.prompt("Paste RAW / EIP / TIFF / Google Drive source link");
    if (!externalUrl?.trim()) return;
    const label = window.prompt("Label", "Drive source") || "Drive source";
    const sourceAsset = await api.post<StillSourceAsset>(`/api/productions/${productionId}/selects/images/${image.id}/source-assets`, {
      type: externalUrl.toLowerCase().includes("drive.google.com") ? "DRIVE_FOLDER" : "OTHER",
      label,
      externalUrl: externalUrl.trim(),
    });
    mergeImage({ ...image, sourceAssets: [...(image.sourceAssets ?? []), sourceAsset] });
  }

  async function uploadSourceAsset(image: StillImage, file: File) {
    if (!productionId) return;
    if (file.size > 250 * 1024 * 1024) {
      window.alert("This file is over the 250MB local source limit. Use a Google Drive/source link for large RAW/TIFF/EIP sets.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("type", /\.(tif|tiff)$/i.test(file.name) ? "TIFF" : /\.eip$/i.test(file.name) ? "EIP" : /\.psd$/i.test(file.name) ? "PSD" : "RAW");
    form.append("label", file.name);
    const response = await fetch(`/api/productions/${productionId}/selects/images/${image.id}/source-assets/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Source upload failed");
    await load();
  }

  async function deleteSourceAsset(image: StillImage, sourceAssetId: string) {
    if (!productionId) return;
    if (!window.confirm("Remove this source asset from the retouch handoff? Local uploaded files will also be deleted if nothing else uses them.")) return;
    await api.delete(`/api/productions/${productionId}/selects/source-assets/${sourceAssetId}`);
    mergeImage({ ...image, sourceAssets: (image.sourceAssets ?? []).filter((asset) => asset.id !== sourceAssetId) });
  }

  function imageAtOffset(image: StillImage, offset: number) {
    const reviewImages = clientMode ? visibleClientImages : visibleImages;
    const index = reviewImages.findIndex((item) => item.id === image.id);
    if (index === -1) return image;
    return reviewImages[(index + offset + reviewImages.length) % reviewImages.length] ?? image;
  }

  if (clientMode) {
    if (clientPasswordRequired) {
      return (
        <div className="grid min-h-screen place-items-center bg-gray-50 p-4 text-gray-950">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              unlockClientLink().catch(console.error);
            }}
            className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
          >
            <p className="mb-1 text-lg font-semibold">Protected review link</p>
            <p className="mb-4 text-sm text-gray-500">Enter the password supplied with this client review link.</p>
            <input
              value={clientPassword}
              onChange={(event) => setClientPassword(event.target.value)}
              type="password"
              autoFocus
              placeholder="Password"
              className="mb-3 min-h-11 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
            />
            {clientPasswordError && <p className="mb-3 text-sm text-rose-600">{clientPasswordError}</p>}
            <button disabled={clientUnlocking || !clientPassword.trim()} className="min-h-11 w-full rounded-md bg-gray-950 text-sm font-medium text-white disabled:opacity-50">
              {clientUnlocking ? "Unlocking..." : "Unlock review"}
            </button>
          </form>
        </div>
      );
    }

    return (
      <>
        <ClientReviewPortal
          payload={payload}
          folders={folders}
          skus={skus}
          images={visibleClientImages}
          allImages={visibleClientImages}
          totalImageCount={totalImageCount}
          visibleImageCount={visibleClientImages.length}
          reviewToken={reviewToken}
          activeFolderId={folderId}
          search={search}
          filter={clientFilter}
          skuFilters={clientSkuIds}
          ratingFilter={clientRatingFilter}
          notesFilter={clientNotesFilter}
          retouchFilter={clientRetouchFilter}
          reviewer={reviewer}
          reviewSubmitted={reviewSubmitted}
          selectedCount={selectedClientCount}
          rejectedCount={rejectedClientCount}
          allowDownloads={allowDownloads}
          loadingMore={clientLoadingMore}
          loadMoreError={clientLoadMoreError}
          onSearch={setSearch}
          onFilter={setClientFilter}
          onSkuFilters={setClientSkuIds}
          onRatingFilter={setClientRatingFilter}
          onNotesFilter={setClientNotesFilter}
          onRetouchFilter={setClientRetouchFilter}
          onReviewer={setReviewer}
          onFolder={setFolderId}
          onOpen={setLightboxImage}
          onPatch={(image, patch) => patchImage(image, patch)}
          onComment={(image) => addAnnotation(image)}
          onVersionUpload={(image, file) => uploadRetouchVersion(image, file)}
          onSubmit={submitClientReview}
          onLoadMore={loadMoreClientImages}
          onSelectVisible={() => selectVisibleClientImages().catch(console.error)}
          onDownloadZip={(scope) => downloadClientZip(scope).catch(console.error)}
          onDownloadRetouchPackage={() => downloadRetouchPackage().catch(console.error)}
        />
        {lightboxImage && (
          <Lightbox
            image={lightboxImage}
            images={visibleClientImages.length > 0 ? visibleClientImages : sortedImages}
            skus={skus}
            clientMode={clientMode}
            reviewToken={reviewToken}
            allowDownloads={allowDownloads}
            onClose={() => setLightboxImage(null)}
            onNavigate={(offset) => setLightboxImage((current) => current ? imageAtOffset(current, offset) : current)}
            onPatch={(patch) => patchImage(lightboxImage, patch)}
            onAnnotate={(draft) => addAnnotation(lightboxImage, draft)}
            onToggleAnnotation={toggleAnnotation}
            onEditAnnotation={(annotation) => editAnnotation(annotation).catch(console.error)}
            onDeleteAnnotation={(annotation) => deleteAnnotation(annotation).catch(console.error)}
          />
        )}
      </>
    );
  }

  return (
    <div
      className={`relative flex h-full min-h-[640px] overflow-hidden rounded-lg border bg-white ${dragging ? "border-gray-900" : "border-gray-200"}`}
      onDragOver={(event) => {
        if (clientMode) return;
        if (event.dataTransfer.types.includes("application/x-still-folder")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => handleDrop(event).catch(console.error)}
    >
      {dragging && !clientMode && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-gray-950/20 p-6">
          <div className="rounded-lg bg-white px-5 py-4 text-center shadow-lg">
            <FolderPlus size={28} className="mx-auto mb-2 text-gray-900" />
            <p className="text-sm font-semibold text-gray-900">Drop folders or images to upload</p>
            <p className="mt-1 text-xs text-gray-500">Nested subfolders will be preserved in Selects.</p>
          </div>
        </div>
      )}
      {!clientMode && (
        <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-gray-50 md:block">
          <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3">
            <span className="text-sm font-semibold text-gray-900">Folders</span>
            <button onClick={() => createFolder(null)} className="grid h-8 w-8 place-items-center rounded-md text-gray-600 hover:bg-white" title="New folder">
              <FolderPlus size={16} />
            </button>
          </div>
          <div className="space-y-1 p-2">
            <FolderButton
              active={folderId === null}
              name="All Selects"
              count={allImageCount}
              onClick={() => setFolderId(null)}
              dropActive={folderDropTargetId === "ROOT"}
              onFolderDrop={(sourceId) => moveFolder(sourceId, null).catch(console.error)}
              onDropTarget={(active) => setFolderDropTargetId(active ? "ROOT" : null)}
            />
            <FolderTree
              folders={folders}
              parentId={null}
              activeId={folderId}
              counts={countsByFolder}
              draggedId={draggedFolderId}
              dropTargetId={folderDropTargetId}
              onSelect={setFolderId}
              onCreate={createFolder}
              onDelete={deleteFolder}
              onDragFolder={setDraggedFolderId}
              onDropTarget={setFolderDropTargetId}
              onMove={moveFolder}
            />
          </div>
          <SkuListPanel
            skus={skus}
            images={sortedImages}
            activeSkuId={skuId}
            reviewToken={reviewToken}
            onFilter={(id) => setSkuId(id)}
            onUpload={(sku, file) => uploadSkuThumbnail(sku, file).catch(console.error)}
            onUseSelected={(sku) => setSelectedImageForSku(sku).catch(console.error)}
          />
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
          <label className="relative min-w-48 flex-1">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} disabled={clientMode} placeholder="Search filename, note, SKU" className="min-h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value as StillStatus | "ALL")} disabled={clientMode} className="min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="ALL">All status</option>
            {STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
          </select>
          <select value={skuId} onChange={(e) => setSkuId(e.target.value)} disabled={clientMode} className="min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="ALL">All SKUs</option>
            {skus.map((sku) => <option key={sku.id} value={sku.id}>{skuLabel(sku)}</option>)}
          </select>
          <select value={rating} onChange={(e) => setRating(e.target.value)} disabled={clientMode} className="min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
            <option value="ALL">All ratings</option>
            <option value="0">0 star</option>
            <option value="1">1 star</option>
            <option value="2">2 stars</option>
            <option value="3">3 stars</option>
            <option value="4">4 stars</option>
            <option value="5">5 stars</option>
          </select>
          <button
            onClick={() => setSelectedOnly((value) => !value)}
            disabled={clientMode}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium disabled:opacity-40 ${selectedOnly ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
          >
            Selected
          </button>
          <button
            onClick={() => setHeroOnly((value) => !value)}
            disabled={clientMode}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium disabled:opacity-40 ${heroOnly ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
          >
            Hero
          </button>
          <button
            onClick={() => setOpenNotesOnly((value) => !value)}
            disabled={clientMode}
            className={`min-h-10 rounded-md border px-3 text-sm font-medium disabled:opacity-40 ${openNotesOnly ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
          >
            Open notes
          </button>
          {hasFilters && !clientMode && (
            <button
              onClick={() => {
                setStatus("ALL");
                setSkuId("ALL");
                setRating("ALL");
                setSelectedOnly(false);
                setHeroOnly(false);
                setOpenNotesOnly(false);
                setSearch("");
              }}
              className="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
            >
              Reset
            </button>
          )}
          <SegmentedView view={view} onChange={setView} />
          {!clientMode && (
            <>
              <button onClick={() => fileInputRef.current?.click()} className="flex min-h-10 items-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-medium text-white"><Upload size={16} /> Upload</button>
              <button onClick={() => folderInputRef.current?.click()} className="grid min-h-10 min-w-10 place-items-center rounded-md border border-gray-200 text-gray-700" title="Upload folder"><ImagePlus size={16} /></button>
              <button onClick={() => createShareLink("CLIENT")} className="grid min-h-10 min-w-10 place-items-center rounded-md border border-gray-200 text-gray-700" title="Create review link"><Link size={16} /></button>
              <button onClick={() => createShareLink("RETOUCHER")} className="min-h-10 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700">Retoucher link</button>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => uploadFiles(uploadItemsFromFileList(event.target.files)).catch(console.error)} />
          <input ref={folderInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => uploadFiles(uploadItemsFromFileList(event.target.files)).catch(console.error)} />
        </div>

        {!clientMode && (
          <div className="flex min-h-12 items-center gap-2 border-b border-gray-100 px-3 text-sm">
            <span className="text-gray-500">{selectedIds.length} selected</span>
            <button onClick={toggleSelectVisible} disabled={visibleImages.length === 0} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700 disabled:opacity-40"><Check size={14} /> Select visible</button>
            <button disabled={selectedIds.length === 0} onClick={() => batchUpdate({ status: "TO_RETOUCH" }).catch(console.error)} className="min-h-9 rounded-md border border-amber-200 bg-amber-50 px-2 text-amber-800 disabled:opacity-40">Needs retouch</button>
            <button disabled={selectedIds.length === 0} onClick={() => batchUpdate({ status: "CLIENT_SELECT" }).catch(console.error)} className="min-h-9 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-emerald-800 disabled:opacity-40">Client select</button>
            <button disabled={selectedIds.length === 0} onClick={() => batchUpdate({ status: "REJECTED" }).catch(console.error)} className="min-h-9 rounded-md border border-rose-200 bg-rose-50 px-2 text-rose-700 disabled:opacity-40">Reject</button>
            <button disabled={selectedIds.length === 0} onClick={() => batchUpdate({ isHero: true }).catch(console.error)} className="min-h-9 rounded-md border border-blue-200 bg-blue-50 px-2 text-blue-700 disabled:opacity-40">Hero</button>
            <button onClick={addSku} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700"><Plus size={14} /> SKU</button>
            <button onClick={importSkus} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700"><Tag size={14} /> Import SKUs</button>
            <select disabled={selectedIds.length === 0} onChange={(e) => e.target.value && batchUpdate({ status: e.target.value as StillStatus }).catch(console.error)} className="min-h-9 rounded-md border border-gray-200 bg-white px-2 disabled:opacity-40">
              <option value="">Set status</option>
              {STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
            </select>
            <select disabled={selectedIds.length === 0} onChange={(e) => batchUpdate({ rating: e.target.value ? Number(e.target.value) : null }).catch(console.error)} className="min-h-9 rounded-md border border-gray-200 bg-white px-2 disabled:opacity-40">
              <option value="">Set rating</option>
              <option value="0">0 star</option>
              <option value="1">1 star</option>
              <option value="2">2 stars</option>
              <option value="3">3 stars</option>
              <option value="4">4 stars</option>
              <option value="5">5 stars</option>
            </select>
            <select disabled={selectedIds.length === 0} onChange={(e) => e.target.value && batchUpdate({ skuIds: [e.target.value] }).catch(console.error)} className="min-h-9 rounded-md border border-gray-200 bg-white px-2 disabled:opacity-40">
              <option value="">Add SKU</option>
              {skus.map((sku) => <option key={sku.id} value={sku.id}>{skuLabel(sku)}</option>)}
            </select>
            <select disabled={selectedIds.length === 0} onChange={(e) => batchUpdate({ folderId: e.target.value || null }).catch(console.error)} className="min-h-9 rounded-md border border-gray-200 bg-white px-2 disabled:opacity-40">
              <option value="">Move to</option>
              <option value="">Unfiled</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <select disabled={selectedIds.length === 0} onChange={(e) => batchCopy(e.target.value || null).catch(console.error)} className="min-h-9 rounded-md border border-gray-200 bg-white px-2 disabled:opacity-40">
              <option value="">Copy to</option>
              <option value="">Unfiled</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <button disabled={selectedIds.length === 0} onClick={() => downloadOriginalsZip("selected").catch(console.error)} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700 disabled:opacity-40"><Download size={14} /> ZIP selected</button>
            <button onClick={() => downloadOriginalsZip("folder").catch(console.error)} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700"><Download size={14} /> ZIP folder</button>
            <button disabled={selectedImages.length < 2} onClick={() => setCompareOpen(true)} className="flex min-h-9 items-center gap-1 rounded-md border border-gray-200 px-2 text-gray-700 disabled:opacity-40"><Columns3 size={14} /> Compare</button>
            <button disabled={selectedIds.length === 0} onClick={() => deleteImages(selectedIds).catch(console.error)} className="flex min-h-9 items-center gap-1 rounded-md border border-rose-200 px-2 text-rose-600 disabled:opacity-40"><Trash2 size={14} /> Delete</button>
            {(uploading || uploadStatus) && <span className="text-gray-500">{uploadStatus || "Uploading..."}</span>}
            {uploadError && <span className="max-w-sm truncate text-rose-600" title={uploadError}>{uploadError}</span>}
            {selectedImages.length > 0 && <button onClick={() => setSelectedIds([])} className="ml-auto text-xs text-gray-500">Clear</button>}
          </div>
        )}

        {!clientMode && shareLinks.length > 0 && (
          <ShareLinksBar
            links={shareLinks}
            folders={folders}
            copiedId={copiedShareId}
            onCopy={(link) => copyShareUrl(link).catch(console.error)}
            onUpdate={(link, patch) => updateShareLink(link, patch).catch(console.error)}
            onDelete={(link) => deleteShareLink(link).catch(console.error)}
          />
        )}

        {clientMode && (
          <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-gray-100 px-3 text-sm">
            <span className="text-gray-600">{selectedClientCount} selected</span>
            <span className="text-gray-600">{rejectedClientCount} rejected</span>
            {reviewSubmitted && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Review submitted</span>}
            <button onClick={submitClientReview} className="ml-auto flex min-h-9 items-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-medium text-white">
              <Send size={14} /> Submit review
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto bg-gray-50 p-3">
          {sortedImages.length === 0 ? (
            <div className="grid h-full min-h-80 place-items-center text-center">
              <div>
                <Folder size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No stills match these filters</p>
              </div>
            </div>
          ) : view === "kanban" ? (
            <KanbanView images={visibleImages} reviewToken={reviewToken} onOpen={setActiveImage} />
          ) : view === "ratings" ? (
            <RatingsView images={visibleImages} reviewToken={reviewToken} onOpen={setActiveImage} onSetRating={(image, nextRating) => patchImage(image, { rating: nextRating }).catch(console.error)} />
          ) : view === "list" ? (
            <ListView images={visibleImages} selectedIds={selectedIds} clientMode={clientMode} reviewToken={reviewToken} onSelect={toggleSelected} onOpen={setActiveImage} onDelete={(image) => deleteImages([image.id]).catch(console.error)} />
          ) : (
            <Gallery images={visibleImages} selectedIds={selectedIds} clientMode={clientMode} reviewToken={reviewToken} onSelect={toggleSelected} onOpen={setActiveImage} onDelete={(image) => deleteImages([image.id]).catch(console.error)} />
          )}
          {!clientMode && visibleImages.length < totalImageCount && (
            <div className="flex flex-col items-center gap-2 py-6">
              <button
                onClick={loadMoreManagerImages}
                disabled={managerLoadingMore}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
              >
                {managerLoadingMore && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />}
                {managerLoadingMore ? "Loading more images" : "Load more"}
                <span className="text-gray-400">({visibleImages.length} of {totalImageCount})</span>
              </button>
              {managerLoadMoreError && <p className="max-w-md text-center text-xs text-rose-600">{managerLoadMoreError}. Try again.</p>}
            </div>
          )}
        </div>
      </main>

      {activeImage && (
        <Inspector
          image={activeImage}
          skus={skus}
          clientMode={clientMode}
          reviewToken={reviewToken}
          allowDownloads={allowDownloads}
          onClose={() => setActiveImage(null)}
          onOpenFull={() => setLightboxImage(activeImage)}
          onPatch={(patch) => patchImage(activeImage, patch)}
          onSkus={(ids) => saveImageSkus(activeImage, ids)}
          onAnnotate={(draft) => addAnnotation(activeImage, draft)}
          onVersionUpload={(file) => uploadRetouchVersion(activeImage, file)}
          onSourceLink={() => addSourceLink(activeImage)}
          onSourceUpload={(file) => uploadSourceAsset(activeImage, file)}
          onSourceDelete={(sourceAssetId) => deleteSourceAsset(activeImage, sourceAssetId)}
          onToggleAnnotation={toggleAnnotation}
          onEditAnnotation={(annotation) => editAnnotation(annotation).catch(console.error)}
          onDeleteAnnotation={(annotation) => deleteAnnotation(annotation).catch(console.error)}
          onDelete={() => deleteImages([activeImage.id]).catch(console.error)}
        />
      )}
      {lightboxImage && (
        <Lightbox
          image={lightboxImage}
          images={clientMode ? visibleClientImages : visibleImages}
          skus={skus}
          clientMode={clientMode}
          reviewToken={reviewToken}
          allowDownloads={allowDownloads}
          onClose={() => setLightboxImage(null)}
          onNavigate={(offset) => setLightboxImage((current) => current ? imageAtOffset(current, offset) : current)}
          onPatch={(patch) => patchImage(lightboxImage, patch)}
          onAnnotate={(draft) => addAnnotation(lightboxImage, draft)}
          onToggleAnnotation={toggleAnnotation}
          onEditAnnotation={(annotation) => editAnnotation(annotation).catch(console.error)}
          onDeleteAnnotation={(annotation) => deleteAnnotation(annotation).catch(console.error)}
        />
      )}
      {compareOpen && (
        <CompareModal
          images={selectedImages.slice(0, 6)}
          reviewToken={reviewToken}
          onClose={() => setCompareOpen(false)}
          onWinner={(image) => patchImage(image, { status: "CLIENT_SELECT" }).catch(console.error)}
        />
      )}
    </div>
  );
}

function ClientReviewPortal({ payload, folders, skus, images, allImages, totalImageCount, visibleImageCount, reviewToken, activeFolderId, search, filter, skuFilters, ratingFilter, notesFilter, retouchFilter, reviewer, reviewSubmitted, selectedCount, rejectedCount, allowDownloads, loadingMore, loadMoreError, onSearch, onFilter, onSkuFilters, onRatingFilter, onNotesFilter, onRetouchFilter, onReviewer, onFolder, onOpen, onPatch, onComment, onVersionUpload, onSubmit, onLoadMore, onSelectVisible, onDownloadZip, onDownloadRetouchPackage }: {
  payload: SelectsPayload | null;
  folders: StillFolder[];
  skus: ProductionSku[];
  images: StillImage[];
  allImages: StillImage[];
  totalImageCount: number;
  visibleImageCount: number;
  reviewToken?: string;
  activeFolderId: string | null;
  search: string;
  filter: ClientFilter;
  skuFilters: string[];
  ratingFilter: ClientRatingFilter;
  notesFilter: ClientNotesFilter;
  retouchFilter: ClientRetouchFilter;
  reviewer: ReviewerIdentity;
  reviewSubmitted: boolean;
  selectedCount: number;
  rejectedCount: number;
  allowDownloads: boolean;
  loadingMore: boolean;
  loadMoreError: string;
  onSearch: (value: string) => void;
  onFilter: (value: ClientFilter) => void;
  onSkuFilters: (value: string[]) => void;
  onRatingFilter: (value: ClientRatingFilter) => void;
  onNotesFilter: (value: ClientNotesFilter) => void;
  onRetouchFilter: (value: ClientRetouchFilter) => void;
  onReviewer: (value: ReviewerIdentity) => void;
  onFolder: (folderId: string | null) => void;
  onOpen: (image: StillImage) => void;
  onPatch: (image: StillImage, patch: Partial<StillImage>) => void;
  onComment: (image: StillImage) => void;
  onVersionUpload: (image: StillImage, file: File) => void;
  onSubmit: () => void;
  onLoadMore: () => void;
  onSelectVisible: () => void;
  onDownloadZip: (scope: "selected" | "folder" | "view") => void;
  onDownloadRetouchPackage: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [copiedView, setCopiedView] = useState(false);
  const chromeCompact = false;
  const production = payload?.production;
  const folderIds = useMemo(() => new Set(folders.map((folder) => folder.id)), [folders]);
  const rootFolders = useMemo(() => folders.filter((folder) => !folder.parentId || !folderIds.has(folder.parentId)), [folderIds, folders]);
  const folderCounts = useMemo(() => {
    if (payload?.folderCounts) return new Map(Object.entries(payload.folderCounts));
    const counts = new Map<string, number>();
    for (const image of allImages) {
      if (image.folderId) counts.set(image.folderId, (counts.get(image.folderId) ?? 0) + 1);
    }
    return counts;
  }, [allImages, payload?.folderCounts]);
  const mobileFolders = useMemo(() => flattenFoldersForClient(folders, rootFolders), [folders, rootFolders]);
  const activeFolder = activeFolderId ? folders.find((folder) => folder.id === activeFolderId) : null;
  const title = activeFolder?.name || production?.title || "Client Review";
  const initials = (production?.clientName || production?.brand || "C").slice(0, 1).toUpperCase();
  const needsIdentity = !reviewer.name.trim();
  const isRetoucher = payload?.shareLink?.role === "RETOUCHER";
  const filters: Array<{ value: ClientFilter; label: string }> = [
    { value: "ALL", label: "All" },
    { value: "SELECTED", label: "Selected" },
    { value: "REJECTED", label: "Rejected" },
    { value: "UNREVIEWED", label: "Unreviewed" },
    { value: "HAS_DECISION", label: "Reviewed" },
    { value: "NEEDS_DECISION", label: "Needs decision" },
    { value: "COMMENTED", label: "Commented" },
    { value: "STARRED", label: "Starred" },
  ];
  const quickDecisionFilters: Array<{ value: ClientFilter; label: string; icon?: typeof Check }> = [
    { value: "ALL", label: "All" },
    { value: "SELECTED", label: "Selected", icon: Check },
    { value: "REJECTED", label: "Rejected", icon: X },
    { value: "UNREVIEWED", label: "Unreviewed" },
    { value: "COMMENTED", label: "Comments", icon: MessageSquare },
  ];
  const ratingFilters: Array<{ value: ClientRatingFilter; label: string }> = [
    { value: "ALL", label: "Any rating" },
    { value: "ZERO", label: "No stars" },
    { value: "ONE_PLUS", label: "1+ stars" },
    { value: "THREE_PLUS", label: "3+ stars" },
    { value: "FIVE", label: "5 stars" },
    { value: "1", label: "1 only" },
    { value: "2", label: "2 only" },
    { value: "3", label: "3 only" },
    { value: "4", label: "4 only" },
  ];
  const quickRatingFilters: Array<{ value: ClientRatingFilter; label: string; stars?: number }> = [
    { value: "ALL", label: "All" },
    { value: "ZERO", label: "0" },
    { value: "1", label: "1", stars: 1 },
    { value: "2", label: "2", stars: 2 },
    { value: "3", label: "3", stars: 3 },
    { value: "4", label: "4", stars: 4 },
    { value: "5", label: "5", stars: 5 },
    { value: "THREE_PLUS", label: "3+" },
  ];
  const notesFilters: Array<{ value: ClientNotesFilter; label: string }> = [
    { value: "ALL", label: "Any notes" },
    { value: "OPEN", label: "Open notes" },
    { value: "HAS", label: "Has notes" },
    { value: "MY", label: "My notes" },
    { value: "RESOLVED", label: "Resolved notes" },
    { value: "NONE", label: "No notes" },
  ];
  const retouchFilters: Array<{ value: ClientRetouchFilter; label: string }> = [
    { value: "ALL", label: "Any retouch state" },
    { value: "TO_RETOUCH", label: "To retouch" },
    { value: "HAS_VERSION", label: "Version uploaded" },
    { value: "NO_VERSION", label: "No version" },
    { value: "CHANGES_REQUESTED", label: "Changes requested" },
    { value: "APPROVED", label: "Approved" },
    { value: "HAS_SOURCE", label: "Source linked" },
    { value: "MISSING_SOURCE", label: "Source missing" },
  ];
  const activeFilterCount = [
    activeFolderId !== null,
    search.trim().length > 0,
    filter !== "ALL",
    skuFilters.length > 0,
    ratingFilter !== "ALL",
    notesFilter !== "ALL",
    retouchFilter !== "ALL",
  ].filter(Boolean).length;
  const activeFilterChips = [
    activeFolder ? { key: "folder", label: activeFolder.name, clear: () => onFolder(null) } : null,
    search.trim() ? { key: "search", label: `Search: ${search.trim()}`, clear: () => onSearch("") } : null,
    filter !== "ALL" ? { key: "decision", label: filters.find((item) => item.value === filter)?.label ?? filter, clear: () => onFilter("ALL") } : null,
    ratingFilter !== "ALL" ? { key: "rating", label: ratingFilters.find((item) => item.value === ratingFilter)?.label ?? ratingFilter, clear: () => onRatingFilter("ALL") } : null,
    notesFilter !== "ALL" ? { key: "notes", label: notesFilters.find((item) => item.value === notesFilter)?.label ?? notesFilter, clear: () => onNotesFilter("ALL") } : null,
    retouchFilter !== "ALL" ? { key: "retouch", label: retouchFilters.find((item) => item.value === retouchFilter)?.label ?? retouchFilter, clear: () => onRetouchFilter("ALL") } : null,
    ...skuFilters.map((skuId) => {
      const sku = skus.find((item) => item.id === skuId);
      return { key: `sku-${skuId}`, label: sku ? skuLabel(sku) : "SKU", clear: () => onSkuFilters(skuFilters.filter((id) => id !== skuId)) };
    }),
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  function toggleSkuFilter(skuId: string) {
    onSkuFilters(skuFilters.includes(skuId) ? skuFilters.filter((id) => id !== skuId) : [...skuFilters, skuId]);
  }

  function clearFilters() {
    onFolder(null);
    onSearch("");
    onFilter("ALL");
    onSkuFilters([]);
    onRatingFilter("ALL");
    onNotesFilter("ALL");
    onRetouchFilter("ALL");
  }

  async function copyCurrentViewLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopiedView(true);
    window.setTimeout(() => setCopiedView(false), 1600);
  }

  const bodyOffsetClass = "";
  const sidebarOffsetClass = "top-12 h-[calc(100vh-48px)]";
  const filterOffsetClass = "top-12";
  const filterPaddingClass = "py-2";

  return (
    <div className="min-h-screen bg-white text-gray-950">
      {needsIdentity && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white/80 p-4 backdrop-blur">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onReviewer({ name: String(form.get("name") || "").trim(), email: String(form.get("email") || "").trim() });
            }}
            className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
          >
            <p className="mb-1 text-lg font-semibold text-gray-950">{isRetoucher ? "Retoucher access" : "Client review"}</p>
            <p className="mb-4 text-sm text-gray-500">Enter your details so notes and decisions sync back to production.</p>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Name</span>
              <input name="name" required autoFocus className="min-h-11 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400" />
            </label>
            <label className="mb-4 block">
              <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Email</span>
              <input name="email" type="email" className="min-h-11 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400" />
            </label>
            <button className="min-h-11 w-full rounded-md bg-gray-950 text-sm font-medium text-white">Continue</button>
          </form>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="flex min-h-12 items-center gap-3 px-4 md:px-6">
          <button className="hidden text-base font-semibold tracking-normal text-gray-950 sm:block">
            unlimited.bond
          </button>
          <div className="relative mx-auto w-full max-w-xl">
            <Search size={15} className="absolute left-3.5 top-2.5 text-gray-400" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search images"
              className="min-h-9 w-full rounded-full border border-gray-200 bg-white pl-10 pr-4 text-sm shadow-sm outline-none focus:border-gray-300"
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-xs font-medium text-gray-800 md:block">{isRetoucher ? "Retoucher" : "Review"}</span>
            <div className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 bg-teal-500 text-xs font-semibold text-white shadow-sm">{initials}</div>
          </div>
        </div>
      </header>

      <div className={`flex ${bodyOffsetClass}`}>
        <aside className={`sticky hidden w-64 shrink-0 overflow-auto border-r border-gray-100 bg-gray-50/60 px-4 py-6 lg:block ${sidebarOffsetClass}`}>
          <nav className="space-y-1 text-sm">
            <button onClick={() => onFolder(null)} className={`flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left ${activeFolderId === null ? "bg-white font-semibold text-gray-950 shadow-sm" : "text-gray-600 hover:bg-white"}`}>
              <span>All media</span>
              <span className="text-xs text-gray-400">{payload?.totalImages ?? allImages.length}</span>
            </button>
            <div className="pt-4">
              <p className="mb-2 px-2 text-xs font-semibold uppercase text-gray-400">Boards</p>
              <ClientFolderTree folders={folders} parentId={null} activeId={activeFolderId} counts={folderCounts} onFolder={onFolder} />
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 md:px-8 lg:px-12">
          <div className="mx-auto max-w-[1680px]">
            <div className={`sticky z-20 -mx-4 mb-4 border-b border-gray-100 bg-white/95 px-4 backdrop-blur md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 ${filterPaddingClass} ${filterOffsetClass}`}>
              {!chromeCompact && (
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                <h1 className="mr-1 min-w-0 max-w-full truncate text-xl font-semibold tracking-normal text-gray-950 md:text-2xl">{title}</h1>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{totalImageCount}</span>
                <div className="grid h-7 w-7 place-items-center rounded-full bg-teal-500 text-xs font-semibold text-white">{initials}</div>
                <span className="text-gray-400">{selectedCount} selected</span>
                <span className="text-gray-400">{rejectedCount} rejected</span>
                <button onClick={() => onReviewer({ name: "", email: "" })} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-500">{reviewer.name || "Reviewer"}</button>
                {reviewSubmitted && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Submitted</span>}
                <button onClick={() => setFilterOpen(true)} className={`ml-auto flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${activeFilterCount > 0 ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}>
                  <SlidersHorizontal size={16} />
                  Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
                </button>
                <button onClick={() => copyCurrentViewLink().catch(console.error)} className="flex min-h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700">
                  <Link size={14} />
                  {copiedView ? "Copied" : "Copy view"}
                </button>
                <button onClick={onSelectVisible} disabled={images.length === 0} className="flex min-h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 disabled:opacity-40">
                  <Check size={14} />
                  Select visible
                </button>
                {allowDownloads && (
                  <button onClick={() => onDownloadZip("view")} className="flex min-h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700">
                    <Download size={14} />
                    Download view as ZIP
                  </button>
                )}
                {isRetoucher && (
                  <button onClick={onDownloadRetouchPackage} className="flex min-h-8 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-900">
                    <FileUp size={14} />
                    Retouch package
                  </button>
                )}
                <button onClick={onSubmit} className="hidden min-h-8 rounded-full bg-gray-950 px-3 text-xs font-medium text-white md:block">Submit review</button>
              </div>
              )}

              {chromeCompact && (
              <div className="mb-1.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-950">{title}</span>
                  <span className="block truncate text-[11px] text-gray-400">{selectedCount} selected / {rejectedCount} rejected</span>
                </div>
                <button onClick={() => setFilterOpen(true)} className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${activeFilterCount > 0 ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}>
                  <SlidersHorizontal size={14} />
                  Filters{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
                </button>
                <button onClick={() => copyCurrentViewLink().catch(console.error)} className="hidden min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 sm:flex">
                  <Link size={14} />
                  {copiedView ? "Copied" : "Copy view"}
                </button>
                <button onClick={onSubmit} className="hidden min-h-8 shrink-0 rounded-full bg-gray-950 px-3 text-xs font-medium text-white md:block">Submit review</button>
              </div>
              )}

            {!chromeCompact && activeFilterChips.length > 0 && (
              <div className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1">
                {activeFilterChips.map((chip) => (
                  <button key={chip.key} onClick={chip.clear} className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 text-xs font-medium text-gray-700">
                    <span className="max-w-40 truncate">{chip.label}</span>
                    <X size={12} />
                  </button>
                ))}
                <button onClick={clearFilters} className="min-h-7 shrink-0 rounded-full border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-500">Clear all</button>
              </div>
            )}

            <div className={`${chromeCompact ? "mb-0" : "mb-1.5"} grid gap-2 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]`}>
              <div className="min-w-0 rounded-md border border-gray-200 bg-gray-50/70 p-1.5">
                <div className="flex gap-1.5 overflow-x-auto">
                  {quickDecisionFilters.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.value}
                        onClick={() => onFilter(item.value)}
                        className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${filter === item.value ? "border-gray-950 bg-gray-950 text-white shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}
                      >
                        {Icon && <Icon size={14} />}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-0 rounded-md border border-gray-200 bg-gray-50/70 p-1.5">
                <div className="flex gap-1 overflow-x-auto rounded-full bg-white p-0.5 shadow-sm">
                  {quickRatingFilters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onRatingFilter(item.value)}
                      className={`flex min-h-8 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium ${ratingFilter === item.value ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      title={item.stars ? `${item.stars} star` : item.label}
                    >
                      {item.stars ? (
                        <>
                          <Star size={14} fill="currentColor" className={ratingFilter === item.value ? "text-amber-300" : "text-amber-400"} />
                          <span>{item.label}</span>
                        </>
                      ) : item.value === "THREE_PLUS" ? (
                        <>
                          <Star size={14} fill="currentColor" className={ratingFilter === item.value ? "text-amber-300" : "text-amber-400"} />
                          <span>3+</span>
                        </>
                      ) : (
                        item.label
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!chromeCompact && skus.length > 0 && (
              <div className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => onSkuFilters([])}
                  className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs ${skuFilters.length === 0 ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                >
                  All SKUs
                </button>
                {skus.map((sku) => {
                  const thumbnail = skuThumbnailSrc(sku, reviewToken);
                  return (
                    <button
                      key={sku.id}
                      onClick={() => toggleSkuFilter(sku.id)}
                      className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs ${skuFilters.includes(sku.id) ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {thumbnail ? <img src={thumbnail} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-gray-100 text-[9px] text-gray-500">{skuInitials(sku)}</span>}
                      <span>{skuLabel(sku)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {!chromeCompact && rootFolders.length > 0 && (
              <div className="mb-1.5 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
                <button onClick={() => onFolder(null)} className={`min-h-8 shrink-0 rounded-full border px-3 text-xs ${activeFolderId === null ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}>All</button>
                {mobileFolders.map(({ folder, depth }) => (
                  <button key={folder.id} onClick={() => onFolder(folder.id)} className={`min-h-8 shrink-0 rounded-full border pr-3 text-xs ${activeFolderId === folder.id ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`} style={{ paddingLeft: `${12 + depth * 10}px` }}>
                    {depth > 0 ? "↳ " : ""}{folder.name}
                  </button>
                ))}
              </div>
            )}
            </div>

            {images.length === 0 ? (
              <div className="grid min-h-80 place-items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
                <div>
                  <Folder size={34} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">No images match this view</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
                  {images.map((image) => (
                    <ClientImageTile key={image.id} image={image} reviewToken={reviewToken} isRetoucher={isRetoucher} onOpen={() => onOpen(image)} onPatch={(patch) => onPatch(image, patch)} onComment={() => onComment(image)} onVersionUpload={(file) => onVersionUpload(image, file)} />
                  ))}
                </div>
                {visibleImageCount < totalImageCount && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <button
                      onClick={onLoadMore}
                      disabled={loadingMore}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
                    >
                      {loadingMore && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />}
                      {loadingMore ? "Loading more images" : "Load more"}
                      <span className="text-gray-400">({visibleImageCount} of {totalImageCount})</span>
                    </button>
                    {loadMoreError && <p className="max-w-md text-center text-xs text-rose-600">{loadMoreError}. Try again.</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-40 bg-gray-950/30 backdrop-blur-sm" onClick={() => setFilterOpen(false)}>
          <aside
            className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-16 items-center justify-between border-b border-gray-100 px-4">
              <div>
                <p className="text-base font-semibold text-gray-950">Filters</p>
                <p className="text-xs text-gray-500">{activeFilterCount} active</p>
              </div>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && <button onClick={clearFilters} className="min-h-9 rounded-full border border-gray-200 px-3 text-sm text-gray-600">Clear</button>}
                <button onClick={() => setFilterOpen(false)} className="grid h-10 w-10 place-items-center rounded-full text-gray-500 hover:bg-gray-50"><X size={18} /></button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-auto p-4">
              <FilterSection title="Decision">
                <div className="flex flex-wrap gap-2">
                  {filters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onFilter(item.value)}
                      className={`rounded-full border px-3 py-2 text-sm ${filter === item.value ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Rating">
                <div className="grid grid-cols-2 gap-2">
                  {ratingFilters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onRatingFilter(item.value)}
                      className={`min-h-10 rounded-md border px-3 text-left text-sm ${ratingFilter === item.value ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Notes">
                <div className="grid grid-cols-2 gap-2">
                  {notesFilters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onNotesFilter(item.value)}
                      className={`min-h-10 rounded-md border px-3 text-left text-sm ${notesFilter === item.value ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Retouch">
                <div className="grid grid-cols-2 gap-2">
                  {retouchFilters.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => onRetouchFilter(item.value)}
                      className={`min-h-10 rounded-md border px-3 text-left text-sm ${retouchFilter === item.value ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {skus.length > 0 && (
                <FilterSection title="SKUs">
                  <div className="mb-2 flex items-center justify-between">
                    <button onClick={() => onSkuFilters([])} className="text-sm font-medium text-gray-600">All SKUs</button>
                    {skuFilters.length > 0 && <span className="text-xs text-gray-400">{skuFilters.length} selected</span>}
                  </div>
                  <div className="max-h-72 space-y-1 overflow-auto rounded-md border border-gray-100 p-1">
                    {skus.map((sku) => {
                      const thumbnail = skuThumbnailSrc(sku, reviewToken);
                      const active = skuFilters.includes(sku.id);
                      return (
                        <button
                          key={sku.id}
                          onClick={() => toggleSkuFilter(sku.id)}
                          className={`flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-sm ${active ? "bg-gray-950 text-white" : "text-gray-700 hover:bg-gray-50"}`}
                        >
                          {thumbnail ? <img src={thumbnail} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" /> : <span className="grid h-8 w-8 place-items-center rounded bg-gray-100 text-[10px] text-gray-500">{skuInitials(sku)}</span>}
                          <span className="min-w-0 flex-1 truncate">{skuLabel(sku)}</span>
                          {active && <Check size={15} />}
                        </button>
                      );
                    })}
                  </div>
                </FilterSection>
              )}
            </div>
            <div className="border-t border-gray-100 p-4">
              <button onClick={() => setFilterOpen(false)} className="min-h-11 w-full rounded-full bg-gray-950 text-sm font-medium text-white">Show results</button>
            </div>
          </aside>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-gray-900">{selectedCount} selected</p>
            <p className="text-xs text-gray-500">{rejectedCount} rejected</p>
          </div>
          <button onClick={onSubmit} className="min-h-11 rounded-full bg-gray-950 px-5 text-sm font-medium text-white">Submit</button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

function clientChildFolders(folders: StillFolder[], parentId: string | null) {
  if (parentId !== null) return childFolders(folders, parentId);
  const folderIds = new Set(folders.map((folder) => folder.id));
  return folders.filter((folder) => !folder.parentId || !folderIds.has(folder.parentId));
}

function flattenFoldersForClient(folders: StillFolder[], roots: StillFolder[]) {
  const rows: Array<{ folder: StillFolder; depth: number }> = [];
  function walk(items: StillFolder[], depth: number) {
    for (const folder of items) {
      rows.push({ folder, depth });
      walk(childFolders(folders, folder.id), depth + 1);
    }
  }
  walk(roots, 0);
  return rows;
}

function ClientFolderTree({ folders, parentId, activeId, counts, onFolder, depth = 0 }: {
  folders: StillFolder[];
  parentId: string | null;
  activeId: string | null;
  counts: Map<string, number>;
  onFolder: (folderId: string) => void;
  depth?: number;
}) {
  return (
    <>
      {clientChildFolders(folders, parentId).map((folder) => (
        <div key={folder.id}>
          <button
            onClick={() => onFolder(folder.id)}
            className={`flex min-h-9 w-full items-center justify-between rounded-md py-1.5 pr-2 text-left ${activeId === folder.id ? "bg-white font-semibold text-rose-500 shadow-sm" : "text-gray-600 hover:bg-white"}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <span className="truncate">{depth > 0 ? "↳ " : ""}{folder.name}</span>
            <span className="text-xs text-gray-400">{counts.get(folder.id) ?? 0}</span>
          </button>
          <ClientFolderTree folders={folders} parentId={folder.id} activeId={activeId} counts={counts} onFolder={onFolder} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

function ClientImageTile({ image, reviewToken, isRetoucher, onOpen, onPatch, onComment, onVersionUpload }: {
  image: StillImage;
  reviewToken?: string;
  isRetoucher: boolean;
  onOpen: () => void;
  onPatch: (patch: Partial<StillImage>) => void;
  onComment: () => void;
  onVersionUpload: (file: File) => void;
}) {
  const selected = image.status === "CLIENT_SELECT";
  const rejected = image.status === "REJECTED";
  const openNotes = image.annotations.filter((note) => !note.resolved).length;
  const rating = image.rating ?? 0;
  const versions = image.retouchVersions ?? [];
  const versionInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08)]">
      <button onClick={onOpen} className="group relative block w-full overflow-hidden bg-gray-100 text-left">
        <img src={imageThumbnailSrc(image, reviewToken)} alt={image.jobFile.originalFilename} className="h-auto w-full object-cover transition duration-200 group-hover:scale-[1.015]" loading="lazy" />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 text-white">
          <div className="flex max-w-[70%] flex-wrap gap-1">
            {selected && <span className="rounded-full bg-emerald-500/95 px-2 py-1 text-[11px] font-semibold shadow">✓ Selected</span>}
            {rejected && <span className="rounded-full bg-rose-500/95 px-2 py-1 text-[11px] font-semibold shadow">Rejected</span>}
            {rating > 0 && (
              <span className="rounded-full bg-gray-950/65 px-2 py-1 text-[11px] font-semibold shadow">
                {"★".repeat(rating)}
              </span>
            )}
          </div>
          {openNotes > 0 && <span className="rounded-full bg-gray-950/65 px-2 py-1 text-[11px] font-semibold shadow">{openNotes} comments</span>}
        </div>
      </button>
      <div className="space-y-2 p-2.5">
        <p className="truncate text-xs font-medium text-gray-700">{image.jobFile.originalFilename}</p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => onPatch({ status: selected ? "UPLOADED" : "CLIENT_SELECT" })} className={`grid h-9 w-9 place-items-center rounded-full text-sm shadow-sm ${selected ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Select">
            <Check size={16} />
          </button>
          <button onClick={() => onPatch({ status: rejected ? "UPLOADED" : "REJECTED" })} className={`grid h-9 w-9 place-items-center rounded-full text-sm shadow-sm ${rejected ? "bg-rose-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Reject">
            <X size={16} />
          </button>
          <button onClick={onComment} className={`grid h-9 w-9 place-items-center rounded-full text-sm shadow-sm ${openNotes > 0 ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} title="Comment">
            <MessageSquare size={16} />
          </button>
          <div className="ml-auto flex rounded-full bg-gray-100 px-1 py-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} onClick={() => onPatch({ rating: rating === star ? 0 : star })} className={`grid h-7 w-6 place-items-center rounded-full ${rating >= star ? "text-amber-400" : "text-gray-300 hover:text-gray-500"}`} title={`${star} star`}>
                <Star size={15} fill={rating >= star ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        </div>
        {(isRetoucher || versions.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2">
            {versions.slice(0, 4).map((version) => (
              <a
                key={version.id}
                href={reviewToken ? `/api/public/selects/${reviewToken}/images/${image.id}/retouch-versions/${version.id}/preview` : `/api/files/${version.jobFileId}/preview`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700"
              >
                v{version.version}
              </a>
            ))}
            {isRetoucher && (
              <>
                <button onClick={() => versionInputRef.current?.click()} className="ml-auto rounded-full bg-gray-950 px-2.5 py-1 text-[11px] font-medium text-white">Upload version</button>
                <input
                  ref={versionInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onVersionUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ShareLinksBar({ links, folders, copiedId, onCopy, onUpdate, onDelete }: {
  links: StillShareLink[];
  folders: StillFolder[];
  copiedId: string | null;
  onCopy: (link: StillShareLink) => void;
  onUpdate: (link: StillShareLink, patch: Partial<StillShareLink> & { password?: string | null }) => void;
  onDelete: (link: StillShareLink) => void;
}) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder.name]));
  const latestLinks = [...links].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 6);

  function shareUrl(link: StillShareLink) {
    return `${window.location.origin}${link.url ?? `/selects/review/${link.token}`}`;
  }

  function expiryInputValue(link: StillShareLink) {
    if (!link.expiresAt) return "";
    return new Date(link.expiresAt).toISOString().slice(0, 10);
  }

  function editPassword(link: StillShareLink) {
    const password = window.prompt(link.hasPassword ? "New password. Leave blank to remove password." : "Set password for this link.", "");
    if (password === null) return;
    onUpdate(link, { password: password.trim() || null });
  }

  function renameLink(link: StillShareLink) {
    const label = window.prompt("Share link label", link.label || "");
    if (label === null) return;
    onUpdate(link, { label: label.trim() || null });
  }

  return (
    <div className="border-b border-gray-100 bg-white px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-gray-500">Client review links</p>
        <span className="text-xs text-gray-400">{links.length} saved</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {latestLinks.map((link) => {
          const url = shareUrl(link);
          const scope = link.folderId ? folderById.get(link.folderId) ?? "Folder scope" : "All Selects";
          return (
            <div key={link.id} className="min-w-[420px] rounded-md border border-gray-200 bg-gray-50 p-2">
              <div className="mb-1 flex items-center gap-2">
                <button onClick={() => renameLink(link)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-gray-900 hover:underline">{link.label || "Client review"}</button>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${link.role === "RETOUCHER" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>{link.role === "RETOUCHER" ? "Retoucher" : "Client"}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">{scope}</span>
                {link.hasPassword && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">Password</span>}
              </div>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-gray-500">
                <span>{link.allowDownloads ? "Downloads on" : "Downloads off"}</span>
                <span>{link.watermark ? "Watermark on" : "Watermark off"}</span>
                {link.expiresAt && <span>Expires {new Date(link.expiresAt).toLocaleDateString()}</span>}
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <select value={link.role ?? "CLIENT"} onChange={(event) => onUpdate(link, { role: event.target.value as StillShareLink["role"] })} className="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700">
                  <option value="CLIENT">Client review</option>
                  <option value="RETOUCHER">Retoucher upload</option>
                </select>
                <select value={link.folderId ?? ""} onChange={(event) => onUpdate(link, { folderId: event.target.value || null })} className="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700">
                  <option value="">All Selects</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                <label className="flex min-h-8 items-center gap-2 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700">
                  <input type="checkbox" checked={link.allowDownloads} onChange={(event) => onUpdate(link, { allowDownloads: event.target.checked })} />
                  Downloads
                </label>
                <label className="flex min-h-8 items-center gap-2 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700">
                  <input type="checkbox" checked={link.watermark} onChange={(event) => onUpdate(link, { watermark: event.target.checked })} />
                  Watermark
                </label>
                <input type="date" value={expiryInputValue(link)} onChange={(event) => onUpdate(link, { expiresAt: event.target.value ? new Date(`${event.target.value}T23:59:59.000Z`).toISOString() : null })} className="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700" title="Expiry date" />
                <button onClick={() => editPassword(link)} className="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700">{link.hasPassword ? "Change password" : "Add password"}</button>
              </div>
              <div className="flex items-center gap-2">
                <input readOnly value={url} className="min-h-9 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600" onFocus={(event) => event.currentTarget.select()} />
                <button onClick={() => onCopy(link)} className="min-h-9 rounded-md bg-gray-900 px-3 text-xs font-medium text-white">{copiedId === link.id ? "Copied" : "Copy"}</button>
                <a href={url} target="_blank" rel="noreferrer" className="min-h-9 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700">Open</a>
                <button onClick={() => onDelete(link)} className="min-h-9 rounded-md border border-rose-200 bg-white px-3 text-xs font-medium text-rose-600">Revoke</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkuListPanel({ skus, images, activeSkuId, reviewToken, onFilter, onUpload, onUseSelected }: {
  skus: ProductionSku[];
  images: StillImage[];
  activeSkuId: string;
  reviewToken?: string;
  onFilter: (skuId: string) => void;
  onUpload: (sku: ProductionSku, file: File) => void;
  onUseSelected: (sku: ProductionSku) => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const image of images) {
      for (const sku of image.skus) map.set(sku.id, (map.get(sku.id) ?? 0) + 1);
    }
    return map;
  }, [images]);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className="border-t border-gray-200 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase text-gray-500">SKUs</p>
        <button onClick={() => onFilter("ALL")} className="text-xs text-gray-400">All</button>
      </div>
      <div className="space-y-1">
        {skus.length === 0 ? (
          <p className="px-1 text-xs text-gray-400">Import or add SKUs to filter shots.</p>
        ) : skus.map((sku) => {
          const thumbnail = skuThumbnailSrc(sku, reviewToken);
          return (
            <div key={sku.id} className={`group rounded-md border ${activeSkuId === sku.id ? "border-gray-900 bg-white" : "border-transparent hover:bg-white"}`}>
              <button onClick={() => onFilter(sku.id)} className="flex min-h-12 w-full items-center gap-2 px-2 text-left">
                {thumbnail ? <img src={thumbnail} alt="" className="h-9 w-9 rounded-md object-cover" loading="lazy" /> : <span className="grid h-9 w-9 place-items-center rounded-md bg-gray-100 text-[10px] text-gray-500">{skuInitials(sku)}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-gray-800">{skuLabel(sku)}</span>
                  <span className="block truncate text-[11px] text-gray-400">{skuDetail(sku)}</span>
                </span>
                <span className="text-xs text-gray-400">{counts.get(sku.id) ?? 0}</span>
              </button>
              <div className="hidden gap-1 px-2 pb-2 group-hover:flex">
                <button onClick={() => fileInputs.current[sku.id]?.click()} className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600">Upload</button>
                <button onClick={() => onUseSelected(sku)} className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600">Use selected</button>
                <input
                  ref={(node) => { fileInputs.current[sku.id] = node; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(sku, file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FolderButton({ active, name, count, onClick, dropActive = false, onFolderDrop, onDropTarget }: {
  active: boolean;
  name: string;
  count: number;
  onClick: () => void;
  dropActive?: boolean;
  onFolderDrop?: (sourceId: string) => void;
  onDropTarget?: (active: boolean) => void;
}) {
  return (
    <button
      onClick={onClick}
      onDragOver={(event) => {
        if (!onFolderDrop || !event.dataTransfer.types.includes("application/x-still-folder")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        onDropTarget?.(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTarget?.(false);
      }}
      onDrop={(event) => {
        if (!onFolderDrop) return;
        const sourceId = event.dataTransfer.getData("application/x-still-folder");
        if (!sourceId) return;
        event.preventDefault();
        event.stopPropagation();
        onDropTarget?.(false);
        onFolderDrop(sourceId);
      }}
      className={`flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm ring-inset ${dropActive ? "ring-2 ring-teal-400" : ""} ${active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-white"}`}
    >
      <span className="truncate">{name}</span>
      <span className="text-xs opacity-70">{count}</span>
    </button>
  );
}

function isDescendantFolder(folders: StillFolder[], folderId: string, possibleDescendantId: string) {
  let current = folders.find((folder) => folder.id === possibleDescendantId);
  while (current?.parentId) {
    if (current.parentId === folderId) return true;
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function FolderTree({ folders, parentId, activeId, counts, draggedId, dropTargetId, onSelect, onCreate, onDelete, onDragFolder, onDropTarget, onMove }: {
  folders: StillFolder[];
  parentId: string | null;
  activeId: string | null;
  counts: Map<string, number>;
  draggedId: string | null;
  dropTargetId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string) => void;
  onDelete: (id: string) => void;
  onDragFolder: (id: string | null) => void;
  onDropTarget: (id: string | null) => void;
  onMove: (id: string, parentId: string | null) => void;
}) {
  return (
    <>
      {childFolders(folders, parentId).map((folder) => (
        <div key={folder.id} className="pl-2">
          <div
            draggable
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-still-folder", folder.id);
              event.dataTransfer.setData("text/plain", folder.id);
              onDragFolder(folder.id);
            }}
            onDragEnd={() => {
              onDragFolder(null);
              onDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes("application/x-still-folder")) return;
              if (draggedId === folder.id || (draggedId && isDescendantFolder(folders, draggedId, folder.id))) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
              onDropTarget(folder.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTarget(null);
            }}
            onDrop={(event) => {
              const sourceId = event.dataTransfer.getData("application/x-still-folder");
              if (!sourceId || sourceId === folder.id || isDescendantFolder(folders, sourceId, folder.id)) return;
              event.preventDefault();
              event.stopPropagation();
              onDropTarget(null);
              onMove(sourceId, folder.id);
            }}
            className={`group flex min-h-9 items-center rounded-md ring-inset ${dropTargetId === folder.id ? "ring-2 ring-teal-400" : ""} ${draggedId === folder.id ? "opacity-45" : ""} ${activeId === folder.id ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-white"}`}
            title="Drag to move this folder into another folder"
          >
            <button onClick={() => onSelect(folder.id)} className="flex min-w-0 flex-1 items-center gap-1 px-2 text-left text-sm">
              <ChevronRight size={13} className="shrink-0 text-gray-400" />
              <span className="truncate">{folder.name}</span>
              <span className="ml-auto text-xs opacity-70">{counts.get(folder.id) ?? 0}</span>
            </button>
            <button onClick={() => onCreate(folder.id)} className="hidden h-8 w-8 place-items-center group-hover:grid" title="Subfolder"><Plus size={13} /></button>
            <button onClick={() => onDelete(folder.id)} className="hidden h-8 w-8 place-items-center group-hover:grid" title="Delete"><Trash2 size={13} /></button>
          </div>
          <FolderTree
            folders={folders}
            parentId={folder.id}
            activeId={activeId}
            counts={counts}
            draggedId={draggedId}
            dropTargetId={dropTargetId}
            onSelect={onSelect}
            onCreate={onCreate}
            onDelete={onDelete}
            onDragFolder={onDragFolder}
            onDropTarget={onDropTarget}
            onMove={onMove}
          />
        </div>
      ))}
    </>
  );
}

function SegmentedView({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  const items: Array<{ value: ViewMode; icon: typeof Grid3X3; label: string }> = [
    { value: "gallery", icon: Grid3X3, label: "Gallery" },
    { value: "list", icon: List, label: "List" },
    { value: "kanban", icon: Kanban, label: "Kanban" },
    { value: "ratings", icon: Star, label: "Ratings" },
  ];
  return (
    <div className="flex rounded-md border border-gray-200 bg-white p-0.5">
      {items.map(({ value, icon: Icon, label }) => (
        <button key={value} onClick={() => onChange(value)} title={label} className={`grid h-9 w-9 place-items-center rounded ${view === value ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}

function Gallery({ images, selectedIds, clientMode, reviewToken, onSelect, onOpen, onDelete }: {
  images: StillImage[];
  selectedIds: string[];
  clientMode: boolean;
  reviewToken?: string;
  onSelect: (id: string) => void;
  onOpen: (image: StillImage) => void;
  onDelete: (image: StillImage) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
      {images.map((image) => (
        <div key={image.id} className={`overflow-hidden rounded-lg border bg-white ${selectedIds.includes(image.id) ? "border-gray-900" : "border-gray-200"}`}>
          <button onClick={() => onOpen(image)} className="relative block aspect-[4/3] w-full bg-gray-100">
            <img src={imageThumbnailSrc(image, reviewToken)} alt={image.jobFile.originalFilename} className="h-full w-full object-cover" loading="lazy" />
            {image.annotations.some((note) => !note.resolved) && <span className="absolute right-2 top-2 rounded-full bg-white px-1.5 py-1 text-xs text-gray-700"><MessageSquare size={13} /></span>}
          </button>
          <div className="space-y-2 p-2">
            <div className="flex items-center gap-2">
              {!clientMode && <input type="checkbox" checked={selectedIds.includes(image.id)} onChange={() => onSelect(image.id)} />}
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-900">{image.jobFile.originalFilename}</span>
              {!clientMode && (
                <button onClick={() => onDelete(image)} className="grid h-7 w-7 place-items-center rounded text-gray-400 hover:bg-rose-50 hover:text-rose-600" title="Permanently delete image">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusTone(image.status)}`}>{STATUS_LABELS[image.status]}</span>
              <span className="flex items-center gap-0.5 text-xs text-amber-600"><Star size={12} />{image.rating ?? "-"}</span>
            </div>
            {image.skus.length > 0 && <p className="truncate text-[11px] text-gray-500">{image.skus.map(skuLabel).join(", ")}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({ images, selectedIds, clientMode, reviewToken, onSelect, onOpen, onDelete }: {
  images: StillImage[];
  selectedIds: string[];
  clientMode: boolean;
  reviewToken?: string;
  onSelect: (id: string) => void;
  onOpen: (image: StillImage) => void;
  onDelete: (image: StillImage) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {images.map((image) => (
        <div key={image.id} className="grid min-h-16 grid-cols-[auto_64px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-gray-100 px-3 last:border-b-0">
          {!clientMode ? <input type="checkbox" checked={selectedIds.includes(image.id)} onChange={() => onSelect(image.id)} /> : <span />}
          <img src={imageThumbnailSrc(image, reviewToken)} alt="" className="h-12 w-16 rounded-md object-cover" loading="lazy" />
          <button onClick={() => onOpen(image)} className="min-w-0 text-left">
            <p className="truncate text-sm font-medium text-gray-900">{image.jobFile.originalFilename}</p>
            <p className="truncate text-xs text-gray-500">{image.skus.map(skuLabel).join(", ") || "No SKUs"}</p>
          </button>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(image.status)}`}>{STATUS_LABELS[image.status]}</span>
          <span className="text-xs text-gray-500">{image.annotations.filter((note) => !note.resolved).length} notes</span>
          {!clientMode && (
            <button onClick={() => onDelete(image)} className="grid h-9 w-9 place-items-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600" title="Permanently delete image">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function KanbanView({ images, reviewToken, onOpen }: { images: StillImage[]; reviewToken?: string; onOpen: (image: StillImage) => void }) {
  return (
    <div className="grid min-w-[1100px] grid-cols-9 gap-3">
      {STATUSES.map((status) => (
        <div key={status} className="min-h-96 rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-2">
            <p className="text-xs font-semibold text-gray-700">{STATUS_LABELS[status]}</p>
          </div>
          <div className="space-y-2 p-2">
            {images.filter((image) => image.status === status).map((image) => (
              <button key={image.id} onClick={() => onOpen(image)} className="block w-full overflow-hidden rounded-md border border-gray-100 bg-gray-50 text-left">
                <img src={imageThumbnailSrc(image, reviewToken)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="block truncate px-2 py-1 text-[11px] font-medium text-gray-700">{image.jobFile.originalFilename}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RatingsView({ images, reviewToken, onOpen, onSetRating }: {
  images: StillImage[];
  reviewToken?: string;
  onOpen: (image: StillImage) => void;
  onSetRating: (image: StillImage, rating: number) => void;
}) {
  const ratings = [0, 1, 2, 3, 4, 5];
  return (
    <div className="grid min-w-[980px] grid-cols-6 gap-3">
      {ratings.map((rating) => {
        const laneImages = images.filter((image) => (image.rating ?? 0) === rating);
        return (
          <div
            key={rating}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const image = images.find((item) => item.id === event.dataTransfer.getData("text/plain"));
              if (image) onSetRating(image, rating);
            }}
            className="min-h-96 rounded-lg border border-gray-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-2">
              <p className="text-xs font-semibold text-gray-700">{rating} star</p>
              <span className="text-xs text-gray-400">{laneImages.length}</span>
            </div>
            <div className="space-y-2 p-2">
              {laneImages.map((image) => (
                <button
                  key={image.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", image.id)}
                  onClick={() => onOpen(image)}
                  className="block w-full overflow-hidden rounded-md border border-gray-100 bg-gray-50 text-left"
                >
                  <img src={imageThumbnailSrc(image, reviewToken)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <span className="block truncate px-2 py-1 text-[11px] font-medium text-gray-700">{image.jobFile.originalFilename}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Inspector({ image, skus, clientMode, reviewToken, allowDownloads, onClose, onOpenFull, onPatch, onSkus, onAnnotate, onVersionUpload, onSourceLink, onSourceUpload, onSourceDelete, onToggleAnnotation, onEditAnnotation, onDeleteAnnotation, onDelete }: {
  image: StillImage;
  skus: ProductionSku[];
  clientMode: boolean;
  reviewToken?: string;
  allowDownloads: boolean;
  onClose: () => void;
  onOpenFull: () => void;
  onPatch: (patch: Partial<StillImage>) => void;
  onSkus: (ids: string[]) => void;
  onAnnotate: (draft?: AnnotationDraft) => void;
  onVersionUpload: (file: File) => void;
  onSourceLink: () => void;
  onSourceUpload: (file: File) => void;
  onSourceDelete: (sourceAssetId: string) => void;
  onToggleAnnotation: (annotation: StillAnnotation) => void;
  onEditAnnotation: (annotation: StillAnnotation) => void;
  onDeleteAnnotation: (annotation: StillAnnotation) => void;
  onDelete: () => void;
}) {
  const activeSkuIds = new Set(image.skus.map((sku) => sku.id));
  const versionInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  function handleImageClick(event: ReactMouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onAnnotate({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  }

  function toggleSku(skuId: string) {
    const next = activeSkuIds.has(skuId)
      ? image.skus.filter((sku) => sku.id !== skuId).map((sku) => sku.id)
      : [...image.skus.map((sku) => sku.id), skuId];
    onSkus(next);
  }

  return (
    <aside className="flex w-full max-w-xl shrink-0 flex-col border-l border-gray-200 bg-white md:w-[440px]">
      <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3">
        <p className="truncate text-sm font-semibold text-gray-900">{image.jobFile.originalFilename}</p>
        <div className="flex items-center gap-1">
          <button onClick={onOpenFull} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-gray-50" title="Open full screen"><Maximize2 size={17} /></button>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-gray-50"><X size={17} /></button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <button onClick={handleImageClick} className="relative block w-full bg-gray-950">
          <img src={imageSrc(image, reviewToken)} alt={image.jobFile.originalFilename} className="max-h-[56vh] w-full object-contain" />
          {image.annotations.filter((note) => !note.resolved).map((note) => (
            <span key={note.id} className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-gray-950 shadow" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}>
              {image.annotations.indexOf(note) + 1}
            </span>
          ))}
        </button>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {clientMode ? (
              <>
                <button onClick={() => onPatch({ status: image.status === "CLIENT_SELECT" ? "UPLOADED" : "CLIENT_SELECT" })} className="flex min-h-10 items-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-medium text-white"><Check size={16} /> Select</button>
                <button onClick={() => onPatch({ status: image.status === "REJECTED" ? "UPLOADED" : "REJECTED" })} className="min-h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700">Reject</button>
              </>
            ) : (
              <>
                <select value={image.status} onChange={(event) => onPatch({ status: event.target.value as StillStatus })} className="min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
                  {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
                <select value={image.rating ?? ""} onChange={(event) => onPatch({ rating: event.target.value ? Number(event.target.value) : null })} className="min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm">
                  <option value="">No rating</option>
                  {[0, 1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} star</option>)}
                </select>
                <button onClick={() => onPatch({ isHero: !image.isHero })} className={`min-h-10 rounded-md px-3 text-sm ${image.isHero ? "bg-amber-100 text-amber-800" : "border border-gray-200 text-gray-700"}`}>Hero</button>
              </>
            )}
            {allowDownloads && <a href={downloadHref(image, reviewToken)} className="grid min-h-10 min-w-10 place-items-center rounded-md border border-gray-200 text-gray-700" title="Download"><Download size={16} /></a>}
            <button onClick={() => onAnnotate()} className="grid min-h-10 min-w-10 place-items-center rounded-md border border-gray-200 text-gray-700" title="Add note"><MessageSquare size={16} /></button>
            {!clientMode && (
              <>
                <button onClick={() => versionInputRef.current?.click()} className="min-h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700">Upload v{(image.retouchVersions?.length ?? 0) + 1}</button>
                <input
                  ref={versionInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onVersionUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </>
            )}
            {!clientMode && <button onClick={onDelete} className="min-h-10 rounded-md border border-rose-200 px-3 text-sm text-rose-600">Delete</button>}
          </div>

          {!clientMode && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">SKUs in shot</p>
              <div className="flex max-h-36 flex-wrap gap-2 overflow-auto">
                {skus.length === 0 ? <span className="text-sm text-gray-400">No SKUs imported.</span> : skus.map((sku) => (
                  <button key={sku.id} onClick={() => toggleSku(sku.id)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${activeSkuIds.has(sku.id) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-700"}`}>
                    {skuLabel(sku)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!clientMode && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-gray-500">Retouch summary</span>
              <textarea value={image.retouchSummary ?? ""} onChange={(event) => onPatch({ retouchSummary: event.target.value })} className="min-h-24 w-full rounded-md border border-gray-200 p-2 text-sm outline-none focus:border-gray-400" />
            </label>
          )}

          {!clientMode && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase text-gray-500">Source / RAW handoff</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(image.sourceAssets?.length ?? 0) > 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{sourceAssetLabel(image)}</span>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button onClick={onSourceLink} className="flex min-h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-700"><Link size={15} /> Add source link</button>
                <button onClick={() => sourceInputRef.current?.click()} className="flex min-h-9 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-700"><FileUp size={15} /> Upload source</button>
                <input
                  ref={sourceInputRef}
                  type="file"
                  accept=".tif,.tiff,.eip,.dng,.raw,.arw,.cr2,.cr3,.nef,.raf,.psd,image/tiff"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onSourceUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <p className="mb-2 text-xs text-gray-400">Large RAW/TIFF/EIP sets should stay as Drive/source links. Local source uploads are capped at 250MB per file.</p>
              <div className="space-y-2">
                {(image.sourceAssets ?? []).length === 0 ? <p className="rounded-md border border-dashed border-gray-200 p-2 text-sm text-gray-400">No source linked yet.</p> : image.sourceAssets?.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-sm">
                    <span className="rounded bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-600">{asset.type}</span>
                    <div className="min-w-0 flex-1">
                      {asset.externalUrl ? (
                        <a href={asset.externalUrl} target="_blank" rel="noreferrer" className="block truncate font-medium text-gray-900 hover:underline">{asset.label || asset.externalUrl}</a>
                      ) : (
                        <a href={`/api/productions/${image.productionId}/selects/images/${image.id}/source-assets/${asset.id}/download`} className="block truncate font-medium text-gray-900 hover:underline">{asset.label || asset.jobFile?.originalFilename || "Source file"}</a>
                      )}
                      <p className="truncate text-xs text-gray-400">{asset.jobFile?.originalFilename || asset.externalUrl || "Linked source"}</p>
                    </div>
                    <button onClick={() => onSourceDelete(asset.id)} className="grid h-8 w-8 place-items-center rounded-md text-rose-500 hover:bg-rose-50" title="Remove source"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Retouch notes</p>
            <div className="space-y-2">
              {image.annotations.length === 0 ? <p className="text-sm text-gray-400">No notes yet.</p> : image.annotations.map((note) => (
                <div key={note.id} className={`rounded-md border p-2 ${note.resolved ? "border-gray-100 bg-gray-50 text-gray-400" : "border-gray-200 bg-white text-gray-800"}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{note.visibility === "CLIENT" ? "Client" : "Internal"}</span>
                    <span className="truncate text-xs text-gray-500">{note.authorName ?? "Unknown"}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => onEditAnnotation(note)} className="text-xs text-gray-500 hover:text-gray-900">Edit</button>
                      <button onClick={() => onToggleAnnotation(note)} className="text-xs text-gray-500 hover:text-gray-900">{note.resolved ? "Reopen" : "Resolve"}</button>
                      <button onClick={() => onDeleteAnnotation(note)} className="text-xs text-rose-500 hover:text-rose-700">Delete</button>
                    </div>
                  </div>
                  <p className="text-sm">{annotationText(note)}</p>
                </div>
              ))}
            </div>
          </div>

          {!clientMode && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Retouch versions</p>
              <div className="space-y-2">
                {(image.retouchVersions ?? []).length === 0 ? <p className="text-sm text-gray-400">No retouched versions yet.</p> : image.retouchVersions?.map((version) => (
                  <a key={version.id} href={`/api/productions/${image.productionId}/selects/images/${image.id}/retouch-versions/${version.id}/download`} className="flex items-center justify-between rounded-md border border-gray-200 p-2 text-sm text-gray-700">
                    <span>v{version.version} · {version.jobFile.originalFilename}</span>
                    <span className="text-xs text-gray-400">{version.uploadedBy || "Unknown"}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {!clientMode && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Activity</p>
              <div className="space-y-2">
                {(image.activities ?? []).length === 0 ? <p className="text-sm text-gray-400">No activity yet.</p> : image.activities?.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
                    <p><span className="font-medium text-gray-800">{activity.actorName || "Unknown"}</span> {activity.action.replace(/_/g, " ").toLowerCase()}</p>
                    {(activity.fromValue || activity.toValue) && <p className="mt-1 text-gray-400">{activity.fromValue || "-"} → {activity.toValue || "-"}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function Lightbox({ image, images, skus, clientMode, reviewToken, allowDownloads, onClose, onNavigate, onPatch, onAnnotate, onToggleAnnotation, onEditAnnotation, onDeleteAnnotation }: {
  image: StillImage;
  images: StillImage[];
  skus: ProductionSku[];
  clientMode: boolean;
  reviewToken?: string;
  allowDownloads: boolean;
  onClose: () => void;
  onNavigate: (offset: number) => void;
  onPatch: (patch: Partial<StillImage>) => void;
  onAnnotate: (draft?: AnnotationDraft) => void;
  onToggleAnnotation: (annotation: StillAnnotation) => void;
  onEditAnnotation: (annotation: StillAnnotation) => void;
  onDeleteAnnotation: (annotation: StillAnnotation) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<MarkupKind>("pin");
  const [showClient, setShowClient] = useState(true);
  const [showInternal, setShowInternal] = useState(!clientMode);
  const [showResolved, setShowResolved] = useState(false);
  const [showMasks, setShowMasks] = useState(true);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);
  const [boxStart, setBoxStart] = useState<DrawingPoint | null>(null);
  const [boxEnd, setBoxEnd] = useState<DrawingPoint | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<DrawingPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<AnnotationDraft | null>(null);
  const [noteText, setNoteText] = useState("");
  const imageIndex = Math.max(0, images.findIndex((item) => item.id === image.id));
  const visibleAnnotations = image.annotations.filter((note) => {
    if (!showResolved && note.resolved) return false;
    if (note.visibility === "CLIENT") return showClient;
    return showInternal;
  });

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onNavigate(1);
      if (event.key === "ArrowLeft") onNavigate(-1);
      if (/^[0-5]$/.test(event.key)) {
        const nextRating = Number(event.key);
        onPatch({ rating: Number(image.rating ?? 0) === nextRating ? 0 : nextRating });
      }
      if (event.key.toLowerCase() === "s") onPatch({ status: image.status === "CLIENT_SELECT" ? "UPLOADED" : "CLIENT_SELECT" });
      if (!clientMode && event.key.toLowerCase() === "a") onPatch({ status: "APPROVED" });
      if (event.key.toLowerCase() === "r") onPatch({ status: image.status === "REJECTED" ? "UPLOADED" : "REJECTED" });
      if (event.key.toLowerCase() === "c") {
        setPendingDraft({ x: 0.5, y: 0.5 });
        setNoteText("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [clientMode, image.rating, image.status, onClose, onNavigate, onPatch]);

  useEffect(() => {
    setBoxStart(null);
    setBoxEnd(null);
    setDrawingPoints([]);
    setIsDrawing(false);
    setPendingDraft(null);
    setNoteText("");
  }, [image.id]);

  function pointFromEvent(event: ReactMouseEvent<HTMLDivElement>): DrawingPoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function drawingPath(points: DrawingPoint[]) {
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 100} ${point.y * 100}`).join(" ");
  }

  function startPin(point: DrawingPoint, kind: MarkupKind = "pin") {
    setPendingDraft({ x: point.x, y: point.y, markup: { kind, points: [point], color: "#fbbf24", opacity: 0.6 } });
    setNoteText("");
  }

  function finishBox(start: DrawingPoint, end: DrawingPoint) {
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 0.01 && height < 0.01) {
      startPin(end);
      return;
    }
    setPendingDraft({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      markup: { kind: "box", points: rectanglePoints(start, end), color: "#fbbf24", opacity: 0.55 },
    });
    setNoteText("");
  }

  function finishArrow(start: DrawingPoint, end: DrawingPoint) {
    setPendingDraft({
      x: end.x,
      y: end.y,
      markup: { kind: "arrow", points: [start, end], color: "#fbbf24", opacity: 0.75 },
    });
    setNoteText("");
  }

  function finishDraw(points: DrawingPoint[]) {
    if (points.length < 2) {
      if (points[0]) startPin(points[0]);
      return;
    }
    const anchor = points[Math.floor(points.length / 2)] ?? points[0];
    setPendingDraft({
      x: anchor.x,
      y: anchor.y,
      markup: { kind: "draw", points, color: "#fbbf24", opacity: 0.75 },
    });
    setNoteText("");
  }

  function submitPendingDraft() {
    const body = noteText.trim();
    if (!body || !pendingDraft) return;
    onAnnotate({ ...pendingDraft, body });
    setPendingDraft(null);
    setNoteText("");
  }

  const boxPreview = boxStart && boxEnd && tool === "box" ? rectanglePoints(boxStart, boxEnd) : [];
  const arrowPreview = boxStart && boxEnd && tool === "arrow" ? [boxStart, boxEnd] : [];

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-950 text-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-14 items-center gap-2 border-b border-white/10 px-3">
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md text-white/80 hover:bg-white/10"><X size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{image.jobFile.originalFilename}</p>
            <p className="text-xs text-white/50">{imageIndex + 1} of {images.length}</p>
          </div>
          <button onClick={() => onNavigate(-1)} className="min-h-10 rounded-md border border-white/15 px-3 text-sm">Prev</button>
          <button onClick={() => onNavigate(1)} className="min-h-10 rounded-md border border-white/15 px-3 text-sm">Next</button>
          <button onClick={() => setZoom((value) => value === 1 ? 1.7 : 1)} className="min-h-10 rounded-md border border-white/15 px-3 text-sm">{zoom === 1 ? "Zoom" : "Fit"}</button>
          {allowDownloads && <a href={downloadHref(image, reviewToken)} className="grid h-10 w-10 place-items-center rounded-md border border-white/15" title="Download"><Download size={16} /></a>}
        </div>

        <div className="relative min-h-0 flex-1 overflow-auto">
          <div
            className="relative mx-auto my-4 max-h-[calc(100vh-96px)] w-fit cursor-crosshair"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            onMouseDown={(event) => {
              if (!["box", "arrow", "draw"].includes(tool)) return;
              event.preventDefault();
              const point = pointFromEvent(event);
              setIsDrawing(true);
              setBoxStart(point);
              setBoxEnd(point);
              setDrawingPoints([point]);
            }}
            onMouseMove={(event) => {
              if (!isDrawing || !["box", "arrow", "draw"].includes(tool)) return;
              const point = pointFromEvent(event);
              setBoxEnd(point);
              if (tool === "draw") setDrawingPoints((points) => [...points, point]);
            }}
            onMouseUp={(event) => {
              if (!isDrawing) return;
              const start = boxStart;
              const end = pointFromEvent(event);
              setIsDrawing(false);
              setBoxStart(null);
              setBoxEnd(null);
              const freehand = drawingPoints;
              setDrawingPoints([]);
              if (!start) return;
              if (tool === "box") finishBox(start, end);
              if (tool === "arrow") finishArrow(start, end);
              if (tool === "draw") finishDraw([...freehand, end]);
            }}
            onClick={(event) => {
              if (tool !== "pin" && tool !== "text") return;
              startPin(pointFromEvent(event), tool);
            }}
          >
            <img src={imageSrc(image, reviewToken)} alt={image.jobFile.originalFilename} className="max-h-[calc(100vh-96px)] max-w-full object-contain" draggable={false} />
            {showMasks && <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {visibleAnnotations.map((note) => {
                const markup = annotationMarkup(note);
                if (!markup || markup.points.length < 2) return null;
                const isBox = markup.kind === "box";
                const isHot = hoveredAnnotationId === note.id;
                return (
                  <path
                    key={note.id}
                    d={drawingPath(markup.points)}
                    fill={isBox ? `${markup.color || "#fbbf24"}33` : "none"}
                    stroke={markup.color || "#fbbf24"}
                    strokeWidth={isHot ? "0.75" : "0.38"}
                    strokeOpacity={isHot ? 1 : markup.opacity ?? 0.75}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-auto cursor-pointer"
                    onMouseEnter={() => setHoveredAnnotationId(note.id)}
                    onMouseLeave={() => setHoveredAnnotationId(null)}
                  />
                );
              })}
              {boxPreview.length > 1 && <path d={drawingPath(boxPreview)} fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth="0.35" strokeLinecap="round" strokeLinejoin="round" />}
              {arrowPreview.length > 1 && <path d={drawingPath(arrowPreview)} fill="none" stroke="#fbbf24" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" />}
              {drawingPoints.length > 1 && <path d={drawingPath(drawingPoints)} fill="none" stroke="#fbbf24" strokeWidth="0.38" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>}
            {visibleAnnotations.map((note, index) => (
              <span
                key={note.id}
                onMouseEnter={() => setHoveredAnnotationId(note.id)}
                onMouseLeave={() => setHoveredAnnotationId(null)}
                className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-xs font-bold text-gray-950 shadow transition ${hoveredAnnotationId === note.id ? "scale-125 bg-white" : "bg-amber-400"}`}
                style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
              >
                {index + 1}
              </span>
            ))}
          </div>
          {pendingDraft && (
            <div className="absolute bottom-4 left-1/2 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-amber-300/60 bg-gray-950/95 p-3 shadow-2xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Retouch note</p>
                <button
                  onClick={() => {
                    setPendingDraft(null);
                    setNoteText("");
                  }}
                  className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/10"
                  title="Cancel note"
                >
                  <X size={16} />
                </button>
              </div>
              <textarea
                autoFocus
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitPendingDraft();
                }}
                placeholder="Describe the retouch change"
                className="min-h-24 w-full resize-none rounded-md border border-white/10 bg-white px-3 py-2 text-sm text-gray-950 outline-none focus:border-amber-300"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setPendingDraft(null);
                    setNoteText("");
                  }}
                  className="min-h-10 rounded-md border border-white/15 px-3 text-sm text-white/80"
                >
                  Cancel
                </button>
                <button onClick={submitPendingDraft} disabled={!noteText.trim()} className="min-h-10 rounded-md bg-amber-300 px-3 text-sm font-medium text-gray-950 disabled:cursor-not-allowed disabled:opacity-40">
                  Add note
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <aside className="hidden w-80 shrink-0 border-l border-white/10 bg-gray-900 md:flex md:flex-col">
        <div className="space-y-3 border-b border-white/10 p-3">
          <div className="flex gap-2">
            <button onClick={() => setTool("pin")} className={`grid h-10 w-10 place-items-center rounded-md border ${tool === "pin" ? "border-white bg-white text-gray-950" : "border-white/15 text-white/80"}`} title="Pin note"><MousePointer2 size={16} /></button>
            <button onClick={() => setTool("box")} className={`grid h-10 w-10 place-items-center rounded-md border ${tool === "box" ? "border-white bg-white text-gray-950" : "border-white/15 text-white/80"}`} title="Box note"><Square size={16} /></button>
            <button onClick={() => setTool("draw")} className={`grid h-10 w-10 place-items-center rounded-md border ${tool === "draw" ? "border-white bg-white text-gray-950" : "border-white/15 text-white/80"}`} title="Freehand note"><Pencil size={16} /></button>
            <button onClick={() => setTool("arrow")} className={`grid h-10 w-10 place-items-center rounded-md border ${tool === "arrow" ? "border-white bg-white text-gray-950" : "border-white/15 text-white/80"}`} title="Arrow note"><ChevronRight size={16} /></button>
            <button onClick={() => setTool("text")} className={`grid h-10 w-10 place-items-center rounded-md border ${tool === "text" ? "border-white bg-white text-gray-950" : "border-white/15 text-white/80"}`} title="Text label"><Type size={16} /></button>
            <button onClick={() => setShowMasks((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-md border ${showMasks ? "border-white/15 text-white/80" : "border-white bg-white text-gray-950"}`} title={showMasks ? "Hide masks" : "Show masks"}>{showMasks ? <Eye size={16} /> : <EyeOff size={16} />}</button>
            <button onClick={() => startPin({ x: 0.5, y: 0.5 })} className="grid h-10 w-10 place-items-center rounded-md border border-white/15 text-white/80" title="Add note"><MessageSquare size={16} /></button>
          </div>
          {clientMode ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button onClick={() => onPatch({ status: image.status === "CLIENT_SELECT" ? "UPLOADED" : "CLIENT_SELECT" })} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-white text-sm font-medium text-gray-950"><Check size={16} /> Select</button>
                <button onClick={() => onPatch({ status: image.status === "REJECTED" ? "UPLOADED" : "REJECTED" })} className="min-h-10 flex-1 rounded-md border border-white/15 text-sm">Reject</button>
              </div>
              <div className="flex justify-center rounded-md bg-white/10 p-1">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button key={rating} onClick={() => onPatch({ rating: image.rating === rating ? 0 : rating })} className={`grid h-9 flex-1 place-items-center rounded ${Number(image.rating ?? 0) >= rating ? "text-amber-300" : "text-white/30"}`} title={`${rating} star`}>
                    <Star size={18} fill={Number(image.rating ?? 0) >= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <select value={image.status} onChange={(event) => onPatch({ status: event.target.value as StillStatus })} className="min-h-10 w-full rounded-md border border-white/15 bg-gray-950 px-2 text-sm">
                {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
              </select>
              <div className="grid grid-cols-6 gap-1">
                {[0, 1, 2, 3, 4, 5].map((rating) => (
                  <button key={rating} onClick={() => onPatch({ rating: Number(image.rating ?? 0) === rating ? 0 : rating })} className={`min-h-9 rounded-md border text-sm ${image.rating === rating ? "border-amber-300 bg-amber-300 text-gray-950" : "border-white/15 text-white/80"}`}>{rating}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1 text-xs">
            <button onClick={() => setShowClient((value) => !value)} className={`rounded-md px-2 py-2 ${showClient ? "bg-white text-gray-950" : "bg-white/10 text-white/70"}`}>Client</button>
            {!clientMode && <button onClick={() => setShowInternal((value) => !value)} className={`rounded-md px-2 py-2 ${showInternal ? "bg-white text-gray-950" : "bg-white/10 text-white/70"}`}>Internal</button>}
            <button onClick={() => setShowResolved((value) => !value)} className={`rounded-md px-2 py-2 ${showResolved ? "bg-white text-gray-950" : "bg-white/10 text-white/70"}`}>Resolved</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {!clientMode && skus.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-white/40">SKUs</p>
              <p className="text-sm text-white/80">{image.skus.map(skuLabel).join(", ") || "No SKUs"}</p>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-white/40">Notes</p>
            <div className="space-y-2">
              {visibleAnnotations.length === 0 ? <p className="text-sm text-white/40">No visible notes.</p> : visibleAnnotations.map((note) => (
                <div
                  key={note.id}
                  onMouseEnter={() => setHoveredAnnotationId(note.id)}
                  onMouseLeave={() => setHoveredAnnotationId(null)}
                  className={`rounded-md border p-2 transition ${hoveredAnnotationId === note.id ? "border-amber-300 bg-amber-300/10" : note.resolved ? "border-white/10 text-white/40" : "border-white/15 text-white/85"}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{note.visibility === "CLIENT" ? "Client" : "Internal"}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => onEditAnnotation(note)} className="text-xs text-white/55 hover:text-white">Edit</button>
                      <button onClick={() => onToggleAnnotation(note)} className="text-xs text-white/55 hover:text-white">{note.resolved ? "Reopen" : "Resolve"}</button>
                      <button onClick={() => onDeleteAnnotation(note)} className="text-xs text-rose-300 hover:text-rose-100">Delete</button>
                    </div>
                  </div>
                  <p className="text-sm">{annotationText(note)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
      {clientMode && (
        <div className="fixed inset-x-0 bottom-0 z-10 space-y-2 border-t border-white/10 bg-gray-950/95 p-3 md:hidden">
          <div className="flex justify-center rounded-md bg-white/10 p-1">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button key={rating} onClick={() => onPatch({ rating: image.rating === rating ? 0 : rating })} className={`grid h-8 flex-1 place-items-center rounded ${Number(image.rating ?? 0) >= rating ? "text-amber-300" : "text-white/30"}`} title={`${rating} star`}>
                <Star size={17} fill={Number(image.rating ?? 0) >= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => onPatch({ status: image.status === "CLIENT_SELECT" ? "UPLOADED" : "CLIENT_SELECT" })} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-white text-sm font-medium text-gray-950"><Check size={16} /> Select</button>
            <button onClick={() => onPatch({ status: image.status === "REJECTED" ? "UPLOADED" : "REJECTED" })} className="min-h-11 flex-1 rounded-md border border-white/15 text-sm">Reject</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareModal({ images, reviewToken, onClose, onWinner }: {
  images: StillImage[];
  reviewToken?: string;
  onClose: () => void;
  onWinner: (image: StillImage) => void;
}) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      <div className="flex min-h-14 items-center gap-2 border-b border-white/10 px-3">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-md text-white/80 hover:bg-white/10"><X size={18} /></button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">Compare {images.length} images</p>
        <button onClick={() => setZoom((value) => !value)} className="min-h-10 rounded-md border border-white/15 px-3 text-sm">{zoom ? "Fit" : "Zoom"}</button>
      </div>
      <div className={`grid min-h-0 flex-1 gap-2 overflow-auto p-2 ${images.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {images.map((image) => (
          <div key={image.id} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-gray-900">
            <div className="min-h-0 flex-1 overflow-auto bg-black">
              <img src={imageSrc(image, reviewToken)} alt={image.jobFile.originalFilename} className={`${zoom ? "max-w-none" : "h-full w-full object-contain"} mx-auto`} />
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{image.jobFile.originalFilename}</p>
                <p className="text-xs text-white/50">{STATUS_LABELS[image.status]} · {image.rating ?? "-"} star</p>
              </div>
              <button onClick={() => onWinner(image)} className="min-h-9 rounded-md bg-white px-3 text-xs font-medium text-gray-950">Winner</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
