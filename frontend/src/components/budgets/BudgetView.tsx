import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Columns3, Download, GripVertical, History, MoreHorizontal, Paperclip, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import { useDrafts, type Draft } from "../../store/draftStore";
import type {
  AdvanceCalcType,
  AdvanceInvoice,
  Budget,
  BudgetLineItem,
  PurchaseOrderContext,
  PurchaseOrderGroup,
  BudgetRevision,
  BudgetRevisionSummary,
  BudgetSection,
  SectionTemplate,
  SubCost,
  SubCostLineType,
} from "../../lib/types";
import { COST_LINE_BACKGROUNDS, DOT_COLORS, getDotState, type DotState } from "./budgetStatus";

type Entity = { type: "production" | "opportunity"; id: string; label?: string; data?: unknown };
type ViewMode = "internal" | "client";
type Panel = "cover" | "advances" | "templates" | null;
type LineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };
type LineReorderResponse = { revision: BudgetRevision | null };
type SubCostMutationResponse = { subCost: SubCost; revision: BudgetRevision | null };
type PurchaseOrderSendFlowResponse =
  | { mode: "onboarding"; purchaseOrder: PurchaseOrderGroup; onboardingUrl: string; draft?: Draft | null }
  | { mode: "draft"; purchaseOrder: PurchaseOrderGroup; draft: Draft | null };
type PurchaseOrderCreateResponse = PurchaseOrderGroup & {
  revision?: BudgetRevision | null;
  sendFlow?: { mode: "onboarding"; onboardingUrl: string; draft: Draft | null } | { mode: "draft"; draft: Draft | null } | null;
  sendFlowError?: string | null;
};
type EditableKind = "text" | "number" | "money" | "percent";
type AddingCostLine = { lineId: string; lineType: SubCostLineType };
type ParentContextMenu = { lineId: string; x: number; y: number } | null;
type DraggedBudgetLine = { sectionId: string; lineId: string } | null;
type DragOverBudgetLine = { lineId: string; placement: "before" | "after" } | null;
type BudgetColumnKey = "dot" | "code" | "description" | "clientNotes" | "internalNotes" | "qty" | "unit" | "rate" | "agency" | "estimated" | "actuals" | "remaining" | "clo";
type ActiveBudgetCell = { rowId: string; field: string } | null;
type BudgetCompareResult = {
  baseRevision: { id: string; label: string; revisionNumber: number; majorVersion: number; minorVersion: number } | null;
  currentRevision: { id: string; label: string; revisionNumber: number; majorVersion: number; minorVersion: number };
  totalDelta: number;
  changes: Array<{
    type: "added" | "removed" | "changed";
    sectionCode: string;
    lineCode: string;
    description: string;
    beforeEstimated: number | null;
    afterEstimated: number | null;
    deltaEstimated: number;
  }>;
};
type BudgetPdfExportResponse = {
  id: string;
  originalFilename: string;
  storedFilename?: string;
  mimeType: string;
  sizeBytes: number;
  contentBase64?: string;
};

type BudgetColumn = {
  key: BudgetColumnKey;
  label: string;
  width: string;
  align?: "left" | "right" | "center";
  hideable?: boolean;
  client?: boolean;
};
type BudgetCellHandle = {
  cellId?: { rowId: string; field: string };
  active?: boolean;
  onActivate?: (cell: ActiveBudgetCell) => void;
};

const UNITS = ["Days", "Pcs", "Cars", "Drives", "Weeks", "Hours", "Flat Fee"];
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  WRAPPED: "Wrapped",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

const SHEET_BORDER = "border-[#e6e6e1]";
const SHEET_HEADER_BG = "bg-[#f7f7f3]";
const SHEET_LINE = "border-[#ededeb]";
const SHEET_HOVER = "hover:bg-[#fbfbf8]";
const EDIT_FOCUS = "focus:ring-[#13a18d]/25";
const BUDGET_HIDDEN_COLUMNS_KEY = "budget.hiddenColumns.v1";
const FROZEN_COLUMN_KEYS: BudgetColumnKey[] = ["dot", "code", "description"];

const INTERNAL_COLUMNS: BudgetColumn[] = [
  { key: "dot", label: "", width: "24px", align: "center" },
  { key: "code", label: "Code", width: "64px" },
  { key: "description", label: "Description", width: "minmax(360px, 1.4fr)" },
  { key: "clientNotes", label: "Client notes", width: "150px", hideable: true },
  { key: "internalNotes", label: "Int. notes", width: "130px", hideable: true },
  { key: "qty", label: "Qty", width: "56px", align: "right", hideable: true },
  { key: "unit", label: "Unit", width: "86px", hideable: true },
  { key: "rate", label: "Rate", width: "96px", align: "right", hideable: true },
  { key: "agency", label: "Agy%", width: "64px", align: "right", hideable: true },
  { key: "estimated", label: "Estimated", width: "110px", align: "right" },
  { key: "actuals", label: "Actuals", width: "96px", align: "right", hideable: true },
  { key: "remaining", label: "Balance", width: "110px", align: "right", hideable: true },
  { key: "clo", label: "CLO", width: "44px", align: "center", hideable: true },
];

const CLIENT_COLUMNS: BudgetColumn[] = [
  { key: "code", label: "Code", width: "64px" },
  { key: "description", label: "Description", width: "minmax(360px, 1.4fr)" },
  { key: "clientNotes", label: "Client notes", width: "150px", hideable: true, client: true },
  { key: "qty", label: "Qty", width: "56px", align: "right", hideable: true, client: true },
  { key: "unit", label: "Unit", width: "86px", hideable: true, client: true },
  { key: "rate", label: "Rate", width: "96px", align: "right", hideable: true, client: true },
  { key: "estimated", label: "Estimated", width: "110px", align: "right" },
];

function money(value: number | null | undefined) {
  return `£${Number(value ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numeric(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return "";
  return Number(value).toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function percentLabel(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

function moneyClass(value: number | null | undefined) {
  return Number(value ?? 0) === 0 ? "text-[#c8c8c4]" : "text-[#1a1a1f]";
}

function remainingClass(value: number | null | undefined, estimated?: number | null) {
  const remaining = Number(value ?? 0);
  const estimate = Number(estimated ?? 0);
  if (remaining < 0) return "text-[#dc2626]";
  if (remaining === 0) return "text-[#c8c8c4]";
  if (estimate > 0 && remaining / estimate < 0.2) return "text-[#d97706]";
  return "text-[#16a34a]";
}

function remainingPillClass(remaining: number, estimated: number) {
  if (remaining < 0) return "bg-[#dc2626] text-white";
  if (remaining === 0) return "bg-[#c8c8c4] text-white";
  if (estimated > 0 && remaining / estimated < 0.2) return "bg-[#d97706] text-white";
  return "bg-[#16a34a] text-white";
}

function balanceLabel(line: Pick<BudgetLineItem, "isClosed" | "variance">, adjustedBalance?: number) {
  const balance = adjustedBalance ?? Number(line.variance ?? 0);
  if (balance < 0) return "Over";
  return line.isClosed ? "Released" : "Available";
}

function balanceClass(line: Pick<BudgetLineItem, "isClosed" | "variance" | "estimatedTotal">, adjustedBalance?: number) {
  const balance = adjustedBalance ?? Number(line.variance ?? 0);
  if (balance < 0) return "text-[#dc2626]";
  if (balance === 0) return "text-[#c8c8c4]";
  return line.isClosed ? "text-[#16a34a]" : remainingClass(balance, line.estimatedTotal);
}

function budgetColumns(mode: ViewMode, hiddenColumns: Set<BudgetColumnKey>) {
  const columns = mode === "internal" ? INTERNAL_COLUMNS : CLIENT_COLUMNS;
  return columns.filter((column) => !hiddenColumns.has(column.key));
}

function gridStyleForColumns(columns: BudgetColumn[]): CSSProperties {
  return { gridTemplateColumns: columns.map((column) => column.width).join(" ") };
}

function cellAlignClass(column: BudgetColumn) {
  if (column.align === "right") return "justify-end text-right";
  if (column.align === "center") return "justify-center text-center";
  return "";
}

function frozenLeft(column: BudgetColumn, columns: BudgetColumn[]) {
  if (!FROZEN_COLUMN_KEYS.includes(column.key)) return null;
  let left = 0;
  for (const current of columns) {
    if (current.key === column.key) return left;
    if (current.key === "dot") left += 24;
    if (current.key === "code") left += 64;
  }
  return left;
}

function frozenCellStyle(column: BudgetColumn, columns: BudgetColumn[], zIndex = 12): CSSProperties {
  const left = frozenLeft(column, columns);
  return left === null ? {} : { position: "sticky", left, zIndex, background: "inherit" };
}

function statusSymbol(active: boolean) {
  return active ? <span className="font-semibold text-[#16a34a]">✓</span> : <span className="text-[#d4d4d0]">○</span>;
}

function lineTypeClass(lineType: SubCostLineType) {
  if (lineType === "BILL") return "border-[#cfe0fb] bg-[#f5f9ff] text-[#2563eb]";
  if (lineType === "PENDING_RECEIPT") return "border-[#fde68a] bg-[#fffbeb] text-[#d97706]";
  if (lineType === "RECEIPT") return "border-[#ccefd6] bg-[#f5fcf7] text-[#15803d]";
  if (lineType === "IN_HOUSE") return "border-[#b9e8e1] bg-[#eefbf8] text-[#0f766e]";
  return "border-[#e1d7ff] bg-[#fbf8ff] text-[#7c3aed]";
}

function lineTypeLabel(lineType: SubCostLineType) {
  if (lineType === "PENDING_RECEIPT") return "QUICK";
  if (lineType === "IN_HOUSE") return "HOUSE";
  return lineType;
}

function lineTypeName(lineType: SubCostLineType) {
  if (lineType === "PENDING_RECEIPT") return "Quick cost";
  if (lineType === "BILL") return "Bill";
  if (lineType === "RECEIPT") return "Receipt";
  if (lineType === "IN_HOUSE") return "In-house";
  return "PO";
}

function budgetVersionLabel(revision: Pick<BudgetRevision, "revisionNumber" | "majorVersion" | "minorVersion" | "label"> | BudgetRevisionSummary) {
  const major = revision.majorVersion ?? revision.revisionNumber;
  const minor = revision.minorVersion ?? 0;
  return `V${major}${minor > 0 ? `.${minor}` : ""}`;
}

function revisionLocked(revision: Pick<BudgetRevision, "status" | "isLocked"> | BudgetRevisionSummary) {
  return Boolean(revision.isLocked) || revision.status === "SENT" || revision.status === "APPROVED" || revision.status === "SUPERSEDED";
}

function revisionTone(revision: Pick<BudgetRevision, "status" | "isLocked"> | BudgetRevisionSummary) {
  if (revision.status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (revision.status === "SENT") return "border-blue-200 bg-blue-50 text-blue-800";
  if (revision.status === "SUPERSEDED") return "border-gray-200 bg-gray-100 text-gray-500";
  if (revisionLocked(revision)) return "border-gray-200 bg-gray-50 text-gray-700";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function stateCounts(revision: BudgetRevision) {
  const counts: Record<DotState, number> = { YELLOW: 0, PURPLE: 0, BLUE: 0, LIGHT_GREEN: 0, DARK_GREEN: 0, GRAY: 0 };
  for (const section of revision.sections) {
    for (const line of section.lineItems) {
      if (line.parentId) continue;
      const state = getDotState(line);
      if (state === "YELLOW" || state === "GRAY" || state === "LIGHT_GREEN" || state === "DARK_GREEN") {
        counts[state] += 1;
      }
      counts.PURPLE += line.subCosts.filter((subCost) => subCost.lineType === "PO").length;
      counts.BLUE += line.subCosts.filter((subCost) => subCost.lineType === "BILL" && !subCost.isPaid).length;
    }
  }
  return counts;
}

function lineStateLabel(state: DotState) {
  if (state === "YELLOW") return "No cost lines";
  if (state === "PURPLE") return "PO raised";
  if (state === "BLUE") return "Invoice/payment in progress";
  if (state === "LIGHT_GREEN") return "Paid, unreconciled";
  if (state === "DARK_GREEN") return "Reconciled";
  return "Closed";
}

function financeSummary(revision: BudgetRevision) {
  const lines = revision.sections.flatMap((section) => section.lineItems).filter((line) => !line.parentId);
  const openBalance = lines.reduce((sum, line) => {
    const balance = adjustedBalanceForLine(revision, line);
    return !line.isClosed && balance > 0 ? sum + balance : sum;
  }, 0);
  const releasedMargin = lines.reduce((sum, line) => {
    const balance = adjustedBalanceForLine(revision, line);
    return line.isClosed && balance > 0 ? sum + balance : sum;
  }, 0);
  const overages = lines.reduce((sum, line) => {
    const balance = adjustedBalanceForLine(revision, line);
    return balance < 0 ? sum + Math.abs(balance) : sum;
  }, 0);
  const committed = lines.reduce((sum, line) => sum + Number(line.actualTotal ?? 0), 0);
  const inHouseCosts = lines.reduce((sum, line) => sum + line.subCosts.filter((subCost) => subCost.lineType === "IN_HOUSE").reduce((lineSum, subCost) => lineSum + Number(subCost.amount ?? 0), 0), 0);
  const paid = lines.reduce((sum, line) => sum + line.subCosts.filter((subCost) => subCost.isPaid).reduce((lineSum, subCost) => lineSum + Number(subCost.amount ?? 0), 0), 0);
  const projectedProfit = Number(revision.totals.productionFee ?? 0) + inHouseCosts + releasedMargin - overages;
  return { openBalance, releasedMargin, overages, committed, inHouseCosts, paid, projectedProfit };
}

function transferSummaryForLine(revision: BudgetRevision, lineId: string) {
  const transfers = revision.transfers ?? [];
  const transferIn = transfers.filter((transfer) => transfer.toLineItemId === lineId).reduce((sum, transfer) => sum + Number(transfer.amount ?? 0), 0);
  const transferOut = transfers.filter((transfer) => transfer.fromLineItemId === lineId).reduce((sum, transfer) => sum + Number(transfer.amount ?? 0), 0);
  return { transferIn, transferOut, adjustedBalance: transferIn - transferOut };
}

function adjustedBalanceForLine(revision: BudgetRevision, line: BudgetLineItem) {
  return Number(line.variance ?? 0) + transferSummaryForLine(revision, line.id).adjustedBalance;
}

function displayActualForLine(line: BudgetLineItem) {
  return line.subCosts.length > 0 ? Number(line.actualTotal ?? 0) : Number(line.estimatedTotal ?? 0);
}

function displayRemainingForLine(revision: BudgetRevision, line: BudgetLineItem) {
  return line.subCosts.length > 0 ? adjustedBalanceForLine(revision, line) : 0;
}

function displaySectionTotals(revision: BudgetRevision, section: BudgetSection) {
  const lines = section.lineItems.filter((line) => !line.parentId);
  const estimated = lines.reduce((sum, line) => sum + Number(line.estimatedTotal ?? 0), 0);
  const actual = lines.reduce((sum, line) => sum + displayActualForLine(line), 0);
  const transfers = lines.reduce((sum, line) => sum + transferSummaryForLine(revision, line.id).adjustedBalance, 0);
  return {
    estimated,
    actual,
    remaining: estimated - actual + transfers,
  };
}

export default function BudgetView({ entity, onBack, embedded = false }: { entity: Entity; onBack: () => void; embedded?: boolean }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [revision, setRevision] = useState<BudgetRevision | null>(null);
  const [revisions, setRevisions] = useState<BudgetRevisionSummary[]>([]);
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [mode, setMode] = useState<ViewMode>("internal");
  const [panel, setPanel] = useState<Panel>(null);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [addingCostLine, setAddingCostLine] = useState<AddingCostLine | null>(null);
  const [blankStarted, setBlankStarted] = useState(false);

  const load = useCallback(async () => {
    const loaded = entity.type === "production"
      ? await api.get<Budget>(`/api/budgets/production/${entity.id}`)
      : await api.get<Budget>(`/api/budgets/opportunity/${entity.id}`);
    setBudget(loaded);
    setRevision(loaded.currentRevision ?? null);
    setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${loaded.id}/revisions`));
    setTemplates(await api.get<SectionTemplate[]>("/api/budgets/templates"));
  }, [entity.id, entity.type]);

  useEffect(() => {
    load().catch((err: Error) => setToast(err.message));
  }, [load]);

  async function openRevision(revisionId: string) {
    const next = await api.get<BudgetRevision>(`/api/budgets/revisions/${revisionId}`);
    setRevision(next);
  }

  async function refreshVersionList(nextRevision?: BudgetRevision | null) {
    if (!budget) return;
    setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${budget.id}/revisions`));
    if (nextRevision && nextRevision.id !== revision?.id) {
      const refreshed = entity.type === "production"
        ? await api.get<Budget>(`/api/budgets/production/${entity.id}`)
        : await api.get<Budget>(`/api/budgets/opportunity/${entity.id}`);
      setBudget(refreshed);
    }
  }

  async function acceptMutationRevision(nextRevision: BudgetRevision | null) {
    if (!nextRevision) return;
    const cloned = nextRevision.id !== revision?.id;
    setRevision(nextRevision);
    if (cloned && budget) {
      setToast(`${budgetVersionLabel(nextRevision)} created from locked ${budgetVersionLabel(revision ?? nextRevision)}.`);
      await refreshVersionList(nextRevision);
    }
  }

  async function patchBudget(patch: Partial<Budget>) {
    if (!budget) return;
    const updated = await api.patch<Budget>(`/api/budgets/${budget.id}`, patch);
    setBudget(updated);
    setRevision(updated.currentRevision ?? null);
  }

  async function patchRevision(patch: Partial<BudgetRevision>) {
    if (!revision) return;
    const updated = await api.patch<BudgetRevision>(`/api/budgets/revisions/${revision.id}`, patch);
    await acceptMutationRevision(updated);
    if (budget) setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${budget.id}/revisions`));
  }

  async function saveLine(line: BudgetLineItem, patch: Partial<BudgetLineItem>) {
    const response = await api.patch<LineMutationResponse>(`/api/budgets/lines/${line.id}`, patch);
    await acceptMutationRevision(response.revision);
  }

  async function addLine(section: BudgetSection) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/sections/${section.id}/lines`, {
      description: "New line item",
      qty: 1,
      days: 1,
      rate: 0,
      unit: "Days",
    });
    await acceptMutationRevision(response.revision);
  }

  async function reorderLines(section: BudgetSection, lineItemIds: string[]) {
    const response = await api.patch<LineReorderResponse>(`/api/budgets/sections/${section.id}/lines/reorder`, { lineItemIds });
    await acceptMutationRevision(response.revision);
  }

  async function addSection() {
    if (!revision) return;
    const code = window.prompt("Section code");
    const name = window.prompt("Section name");
    if (!code || !name) return;
    await api.post(`/api/budgets/revisions/${revision.id}/sections`, { code, name });
    await openRevision(revision.id);
    setBlankStarted(true);
  }

  async function deleteSection(section: BudgetSection) {
    if (section.lineItems.length > 0) return;
    if (!window.confirm(`Delete empty section ${section.code} ${section.name}?`)) return;
    await api.delete(`/api/budgets/sections/${section.id}`);
    await load();
  }

  async function duplicateLine(line: BudgetLineItem) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/lines/${line.id}/duplicate`, {});
    await acceptMutationRevision(response.revision);
  }

  async function deleteLine(line: BudgetLineItem) {
    if (!window.confirm(`Delete ${line.description}?`)) return;
    await api.delete(`/api/budgets/lines/${line.id}`);
    await load();
  }

  async function applyTemplate(templateId: string) {
    if (!revision) return;
    const updated = await api.post<BudgetRevision>(`/api/budgets/revisions/${revision.id}/apply-template`, { templateId });
    await acceptMutationRevision(updated);
    setBlankStarted(false);
    setPanel(null);
  }

  async function exportPdf(exportMode: "client" | "internal") {
    if (!revision) return;
    const file = await api.post<BudgetPdfExportResponse>(`/api/budgets/revisions/${revision.id}/export-pdf`, { mode: exportMode });
    if (file.contentBase64) {
      const binary = atob(file.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const blob = new Blob([bytes], { type: file.mimeType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.originalFilename || "Estimate.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } else {
      const link = document.createElement("a");
      link.href = `/api/files/${file.id}/download`;
      link.download = file.originalFilename || "Estimate.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setToast("PDF exported and downloaded.");
  }

  const firstAdvance = useMemo(() => {
    if (!budget || !revision?.totals) return null;
    const advance = budget.advanceInvoices[0];
    if (!advance) return null;
    return revision.totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? advance.calculatedAmount ?? 0;
  }, [budget, revision]);

  const entityLabel = entity.label ?? budget?.jobName ?? (entity.type === "production" ? "Production" : "Opportunity");
  const currentRevisionLocked = revision ? revisionLocked(revision) : false;

  if (!budget || !revision) {
    return <div className="flex min-h-full items-center justify-center text-sm text-gray-500">Loading budget...</div>;
  }

  const showTemplatePicker = revision.sections.length === 0 && !blankStarted;

  return (
    <div className={`${embedded ? "flex h-full min-h-0" : "fixed inset-0 z-50 flex"} flex-col bg-white text-[#1a1a1f]`}>
      {toast && (
        <button onClick={() => setToast(null)} className="fixed bottom-4 right-4 z-[70] rounded-md bg-[#1a1a1f] px-3 py-2 text-xs text-white shadow-lg">
          {toast}
        </button>
      )}

      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#e8e8e4] bg-white px-3">
        <button onClick={onBack} className="flex min-h-11 shrink-0 items-center gap-2 text-[15px] font-semibold text-[#1a1a1f]">
          <ArrowLeft size={16} />
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#13a18d] text-white">◆</span>
          <span className="max-w-[260px] truncate">{entityLabel}</span>
          <ChevronDown size={14} className="text-gray-400" />
        </button>
        <nav className="flex h-full flex-1 items-end justify-center gap-6 text-[13px] font-medium text-gray-500">
          <button className="h-full border-b-2 border-transparent pt-1 hover:text-[#1a1a1f]">Overview</button>
          <button className="h-full border-b-2 border-[#13a18d] pt-1 text-[#1a1a1f]">Budget</button>
          <button className="h-full border-b-2 border-transparent pt-1 hover:text-[#1a1a1f]">POs</button>
          <button className="h-full border-b-2 border-transparent pt-1 hover:text-[#1a1a1f]">Comms</button>
          <button className="h-full border-b-2 border-transparent pt-1 hover:text-[#1a1a1f]">Files</button>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => patchRevision({ status: revision.status === "DRAFT" ? "SENT" : revision.status }).catch(console.error)} className={`rounded-md border px-3 py-2 text-[12px] font-medium ${revisionTone(revision)}`}>
            {currentRevisionLocked ? "Locked" : STATUS_LABELS[revision.status]}
          </button>
          <button onClick={() => setVersionPanelOpen(true)} className="grid h-9 w-9 place-items-center rounded-md border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50" title="Version history">
            <History size={15} />
          </button>
          <button onClick={() => exportPdf(mode).catch((err: Error) => setToast(err.message))} className="flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 shadow-sm hover:bg-gray-50" title="Export PDF">
            <Download size={14} /> Export
          </button>
        </div>
      </header>

      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#caeee9] bg-[#e9fbf8]">
        <div className="flex h-full min-w-0 flex-1 items-end overflow-x-auto">
          {revisions.map((item) => {
            const active = item.id === revision.id;
            return (
              <button
                key={item.id}
                onClick={() => openRevision(item.id).catch(console.error)}
                className={`flex h-full min-w-[132px] max-w-[190px] items-center gap-2 border-r border-[#caeee9] px-3 text-left text-[13px] transition ${
                  active ? "bg-white font-semibold text-[#1a1a1f] shadow-[inset_0_-2px_0_#1a1a1f]" : "text-gray-600 hover:bg-white/55"
                }`}
                title={`${budgetVersionLabel(item)} · ${item.label}`}
              >
                <span className="truncate">{budgetVersionLabel(item)}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${revisionTone(item)}`}>{STATUS_LABELS[item.status]}</span>
              </button>
            );
          })}
          <button onClick={() => createRevision(budget.id, load).catch(console.error)} className="grid h-full w-12 shrink-0 place-items-center border-r border-[#caeee9] text-xl text-gray-500 hover:bg-white/60" title="New major version">
            +
          </button>
        </div>
        <div className="mr-3 flex shrink-0 rounded-md bg-white p-0.5 text-[12px] shadow-sm ring-1 ring-[#caeee9]">
          <button onClick={() => setMode("internal")} className={`h-8 rounded px-3 ${mode === "internal" ? "bg-[#1a1a1f] text-white" : "text-gray-500"}`}>Internal</button>
          <button onClick={() => setMode("client")} className={`h-8 rounded px-3 ${mode === "client" ? "bg-[#1a1a1f] text-white" : "text-gray-500"}`}>Client</button>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center justify-between border-b border-[#e8e8e4] bg-white px-3 text-[13px] text-gray-600">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <span className="font-semibold text-[#1a1a1f]">Grid view</span>
          <span className="text-gray-300">·</span>
          <span className="truncate text-[12px] text-gray-400">{currentRevisionLocked ? "Edits create a new minor version automatically." : "Draft edits save into this version."}</span>
        </div>
        <div className="ml-4 flex min-w-max items-center gap-1">
          <button onClick={addSection} className="h-8 rounded px-2 hover:bg-gray-100">+ Section</button>
          <button onClick={() => revision.sections[0] && addLine(revision.sections[0]).catch(console.error)} className="h-8 rounded px-2 hover:bg-gray-100">+ Line</button>
          <button onClick={() => setPanel("templates")} className="h-8 rounded px-2 hover:bg-gray-100">Templates</button>
          <button onClick={() => setPanel("cover")} className="h-8 rounded px-2 hover:bg-gray-100">Cover</button>
          <button onClick={() => setPanel("advances")} className="h-8 rounded px-2 hover:bg-gray-100">Advances</button>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-auto">
        {showTemplatePicker ? (
          <TemplatePicker templates={templates} onApply={applyTemplate} onBlank={() => setBlankStarted(true)} />
        ) : (
          <BudgetTable
            revision={revision}
            mode={mode}
            productionId={entity.type === "production" ? budget.productionId ?? entity.id : null}
            addingCostLine={addingCostLine}
            onSetAddingCostLine={setAddingCostLine}
            onSaveLine={saveLine}
            onAddLine={addLine}
            onReorderLines={reorderLines}
            onDeleteSection={deleteSection}
            onDuplicate={duplicateLine}
            onDelete={deleteLine}
            onRevision={(next) => { void acceptMutationRevision(next); }}
            onError={(message) => setToast(message)}
            onOpenTemplates={() => setPanel("templates")}
          />
        )}
      </main>

      <SummaryBar revision={revision} firstAdvance={firstAdvance} onRevisionPatch={patchRevision} />

      {panel === "cover" && <CoverPanel budget={budget} onClose={() => setPanel(null)} onSave={patchBudget} />}
      {panel === "advances" && <AdvancesPanel budget={budget} totals={revision.totals} onClose={() => setPanel(null)} onChanged={load} />}
      {panel === "templates" && <TemplatePanel templates={templates} onClose={() => setPanel(null)} onApply={applyTemplate} />}
      {versionPanelOpen && <VersionPanel currentRevision={revision} revisions={revisions} onClose={() => setVersionPanelOpen(false)} onOpenRevision={openRevision} onPatchRevision={patchRevision} />}
    </div>
  );
}

async function createRevision(budgetId: string, onDone: () => Promise<void>) {
  await api.post(`/api/budgets/${budgetId}/revisions`, {});
  await onDone();
}

function SummaryBar({ revision, firstAdvance, onRevisionPatch }: {
  revision: BudgetRevision;
  firstAdvance: number | null;
  onRevisionPatch: (patch: Partial<BudgetRevision>) => Promise<void>;
}) {
  const totals = revision.totals;
  const counts = stateCounts(revision);
  const finance = financeSummary(revision);
  const hasOpenCounts = counts.YELLOW + counts.PURPLE + counts.BLUE + counts.LIGHT_GREEN > 0;
  return (
    <div className="shrink-0 border-t border-[#e1e1dc] bg-[#fffefa] px-4 py-2 shadow-[0_-8px_24px_rgba(20,20,20,0.04)]">
      <div className="grid grid-cols-2 items-center gap-x-6 gap-y-1 md:grid-cols-4">
        <Metric label="Uncommitted" value={money(finance.openBalance)} />
        <Metric label="Committed" value={money(finance.committed)} />
        <Metric label="Projected profit" value={money(finance.projectedProfit)} grand />
        <Metric label="Client budget" value={money(totals.grandTotal)} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-4">
        <EstimateFeeControl
          label="Production fee"
          enabled={revision.productionFeeEnabled}
          percent={revision.productionFeePercent}
          value={totals.productionFee}
          onToggle={(enabled) => onRevisionPatch({ productionFeeEnabled: enabled })}
          onPercent={(productionFeePercent) => onRevisionPatch({ productionFeePercent })}
        />
        <EstimateFeeControl
          label="Insurance"
          enabled={revision.insuranceEnabled}
          percent={revision.insurancePercent}
          value={totals.insurance}
          onToggle={(enabled) => onRevisionPatch({ insuranceEnabled: enabled })}
          onPercent={(insurancePercent) => onRevisionPatch({ insurancePercent })}
        />
        <StateCount color="#16a34a" className="text-[#16a34a]" label={`in-house ${money(finance.inHouseCosts)}`} />
        <StateCount color="#16a34a" className="text-[#16a34a]" label={`job profit ${money(finance.releasedMargin)}`} />
        <StateCount color="#9ca3af" className="text-gray-500" label={`paid ${money(finance.paid)}`} />
        {finance.overages > 0 && <StateCount color="#dc2626" className="text-[#dc2626]" label={`overages ${money(finance.overages)}`} />}
        {firstAdvance !== null && <StateCount color="#9ca3af" className="text-gray-500" label={`advance due ${money(firstAdvance)}`} />}
        {counts.YELLOW > 0 && <IssueCount state="YELLOW" count={counts.YELLOW} />}
        {counts.PURPLE > 0 && <IssueCount state="PURPLE" count={counts.PURPLE} />}
        {counts.BLUE > 0 && <IssueCount state="BLUE" count={counts.BLUE} />}
        {counts.LIGHT_GREEN > 0 && <IssueCount state="LIGHT_GREEN" count={counts.LIGHT_GREEN} />}
        {!hasOpenCounts && <span title="All open lines reconciled" className="inline-flex items-center gap-1 text-[#16a34a]"><Check size={12} /> clear</span>}
      </div>
    </div>
  );
}

function EstimateFeeControl({ label, enabled, percent, value, onToggle, onPercent }: {
  label: string;
  enabled: boolean;
  percent: number;
  value: number;
  onToggle: (enabled: boolean) => Promise<void>;
  onPercent: (percent: number) => Promise<void>;
}) {
  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-[#deded8] bg-white text-[11px] text-gray-600 shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(!enabled).catch(console.error)}
        className={`grid h-6 w-7 place-items-center border-r border-[#deded8] ${enabled ? "bg-[#13a18d] text-white" : "bg-[#f3f3ef] text-gray-400"}`}
        title={`${enabled ? "Disable" : "Enable"} ${label}`}
      >
        {enabled ? <Check size={13} /> : <X size={13} />}
      </button>
      <button
        type="button"
        onClick={() => {
          const next = window.prompt(`${label} percentage`, String(percent));
          if (next !== null) onPercent(Number(next)).catch(console.error);
        }}
        className="h-6 px-2 hover:bg-[#f7f7f3]"
        title={`Set ${label} percentage`}
      >
        {label} {percentLabel(percent)}: {money(value)}
      </button>
    </span>
  );
}

function StateCount({ label, className, color }: { label: string; className: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className} after:ml-1 after:text-[#c8c8c4] after:content-['·'] last:after:content-none`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function IssueCount({ state, count }: { state: DotState; count: number }) {
  return (
    <span
      title={`${count} ${lineStateLabel(state).toLowerCase()}`}
      className="inline-flex h-6 min-w-7 items-center justify-center gap-1 rounded-md border border-[#e6e6e1] bg-white px-1.5 text-[11px] font-semibold text-[#555] shadow-sm"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOT_COLORS[state] }} />
      {count}
    </span>
  );
}

function Metric({ label, value, grand = false }: { label: string; value: string; grand?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-[#a6a6a0]">{label}</p>
      <p className={`tabular-nums ${grand ? "text-lg font-semibold text-[#1a1a1f]" : "text-sm font-medium text-[#1a1a1f]"}`}>{value}</p>
    </div>
  );
}

function BudgetTable(props: {
  revision: BudgetRevision;
  mode: ViewMode;
  productionId: string | null;
  addingCostLine: AddingCostLine | null;
  onSetAddingCostLine: (costLine: AddingCostLine | null) => void;
  onSaveLine: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onAddLine: (section: BudgetSection) => Promise<void>;
  onReorderLines: (section: BudgetSection, lineItemIds: string[]) => Promise<void>;
  onDeleteSection: (section: BudgetSection) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => Promise<void>;
  onDelete: (line: BudgetLineItem) => Promise<void>;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
  onOpenTemplates: () => void;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [toggledCostLines, setToggledCostLines] = useState<Set<string>>(new Set());
  const [parentMenu, setParentMenu] = useState<ParentContextMenu>(null);
  const [draggedLine, setDraggedLine] = useState<DraggedBudgetLine>(null);
  const [dragOverLine, setDragOverLine] = useState<DragOverBudgetLine>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<ActiveBudgetCell>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<BudgetColumnKey>>(() => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem(BUDGET_HIDDEN_COLUMNS_KEY) ?? "[]") as BudgetColumnKey[]);
    } catch {
      return new Set();
    }
  });
  const [poPanelLine, setPoPanelLine] = useState<BudgetLineItem | null>(null);
  const [costPanelLine, setCostPanelLine] = useState<BudgetLineItem | null>(null);
  const [closedPanelLine, setClosedPanelLine] = useState<BudgetLineItem | null>(null);
  const [costTrackerOpen, setCostTrackerOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const internal = props.mode === "internal";
  const columns = budgetColumns(props.mode, hiddenColumns);
  const gridStyle = gridStyleForColumns(columns);
  const menuLine = parentMenu
    ? props.revision.sections.flatMap((section) => section.lineItems).find((line) => line.id === parentMenu.lineId)
    : null;

  useEffect(() => {
    window.localStorage.setItem(BUDGET_HIDDEN_COLUMNS_KEY, JSON.stringify(Array.from(hiddenColumns)));
  }, [hiddenColumns]);

  useEffect(() => {
    if (!parentMenu) return;
    function close() {
      setParentMenu(null);
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", keyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", keyDown);
    };
  }, [parentMenu]);

  function toggleColumn(key: BudgetColumnKey) {
    const column = (internal ? INTERNAL_COLUMNS : CLIENT_COLUMNS).find((item) => item.key === key);
    if (!column?.hideable) return;
    const next = new Set(hiddenColumns);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHiddenColumns(next);
  }

  function moveActiveCell(direction: "left" | "right" | "up" | "down") {
    const cells = Array.from(tableRef.current?.querySelectorAll<HTMLElement>("[data-budget-cell]") ?? []);
    if (!cells.length) return;
    const current = activeCell ? cells.find((cell) => cell.dataset.budgetCell === `${activeCell.rowId}:${activeCell.field}`) : document.activeElement as HTMLElement | null;
    const index = current ? cells.indexOf(current) : -1;
    const currentCell = index >= 0 ? cells[index] : cells[0];
    const currentRow = currentCell.dataset.budgetRow ?? "";
    const rowCells = cells.filter((cell) => cell.dataset.budgetRow === currentRow);
    const rowIndex = rowCells.indexOf(currentCell);
    let target: HTMLElement | undefined;
    if (direction === "left") target = rowCells[Math.max(0, rowIndex - 1)];
    if (direction === "right") target = rowCells[Math.min(rowCells.length - 1, rowIndex + 1)];
    if (direction === "up" || direction === "down") {
      const rows = Array.from(new Set(cells.map((cell) => cell.dataset.budgetRow ?? "")));
      const nextRow = rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(currentRow) + (direction === "down" ? 1 : -1)))];
      const nextRowCells = cells.filter((cell) => cell.dataset.budgetRow === nextRow);
      target = nextRowCells[Math.min(rowIndex, nextRowCells.length - 1)];
    }
    target?.focus();
    if (target?.dataset.budgetCell) {
      const [rowId, field] = target.dataset.budgetCell.split(":");
      setActiveCell({ rowId, field });
    }
  }

  return (
    <div
      ref={tableRef}
      className="budget-table h-full w-full overflow-auto bg-[#f6f6f2]"
      onKeyDownCapture={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          moveActiveCell(event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : event.key === "ArrowUp" ? "up" : "down");
        }
        if (event.key === "Enter" && document.activeElement instanceof HTMLElement) {
          document.activeElement.click();
        }
        if (event.key === "Escape") setActiveCell(null);
      }}
    >
      <div className="budget-table-inner min-h-full min-w-[1180px] bg-white shadow-[inset_1px_0_0_#ededeb]" style={{ width: "100%" }}>
      <div className="sticky top-0 z-30 flex h-9 items-center justify-between border-b border-[#e6e6e1] bg-[#fbfbf8] px-3 text-[12px] text-gray-500">
        <div className="flex min-w-0 items-center gap-2">
          <span>{columns.length} fields visible</span>
        </div>
        <div className="relative">
          <button onClick={() => setColumnsOpen(!columnsOpen)} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#e1e1dc] bg-white px-2 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-[#f7f7f3]">
            <Columns3 size={13} /> Hide fields
          </button>
          <button onClick={() => setCostTrackerOpen(true)} className="ml-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-[#e1e1dc] bg-white px-2 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-[#f7f7f3]">
            Costs
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-8 z-50 w-56 rounded-lg border border-[#e3e3dd] bg-[#fffefa] p-2 text-[12px] shadow-[0_10px_28px_rgba(20,20,20,0.12)]">
              {(internal ? INTERNAL_COLUMNS : CLIENT_COLUMNS).filter((column) => column.hideable).map((column) => (
                <label key={column.key} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 hover:bg-[#f2f2ed]">
                  <input type="checkbox" checked={!hiddenColumns.has(column.key)} onChange={() => toggleColumn(column.key)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`sticky top-9 z-20 grid h-8 items-center border-b ${SHEET_BORDER} ${SHEET_HEADER_BG} text-[10px] font-medium uppercase tracking-[0.08em] text-[#9b9b95]`} style={gridStyle}>
        {columns.map((column) => (
          <HeaderCell key={column.key} column={column} columns={columns} title={column.key === "clo" ? "Close this line when fully settled" : undefined}>
            {column.key === "estimated" && !internal ? "Budget" : column.label}
          </HeaderCell>
        ))}
      </div>

      {props.revision.sections.filter((section) => section.isVisible).map((section) => {
        const collapsed = collapsedSections.has(section.id);
        return (
          <SectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            toggledCostLines={toggledCostLines}
            columns={columns}
            gridStyle={gridStyle}
            activeCell={activeCell}
            onActivateCell={setActiveCell}
            onToggleSection={() => {
              const next = new Set(collapsedSections);
              if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
              setCollapsedSections(next);
            }}
            onToggleCostLines={(lineId) => {
              const next = new Set(toggledCostLines);
              if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
              setToggledCostLines(next);
            }}
            onOpenParentMenu={(line, x, y) => setParentMenu({ lineId: line.id, x, y })}
            onOpenPoPanel={setPoPanelLine}
            onOpenCostPanel={setCostPanelLine}
            onOpenClosedPanel={setClosedPanelLine}
            draggedLine={draggedLine}
            dragOverLine={dragOverLine}
            onDragLineStart={setDraggedLine}
            onDragLineOver={setDragOverLine}
            onDragLineEnd={() => { setDraggedLine(null); setDragOverLine(null); }}
            internal={internal}
            {...props}
          />
        );
      })}
      {internal && parentMenu && menuLine && (
        <div
          className="fixed z-[80] flex items-center gap-1 rounded-md border border-[#e3e3dd] bg-[#fffefa] p-1 shadow-[0_10px_28px_rgba(20,20,20,0.12)]"
          style={{ left: parentMenu.x, top: parentMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {menuLine.isClosed ? (
            <>
              <button onClick={() => { setClosedPanelLine(menuLine); setParentMenu(null); }} className="min-h-7 rounded border border-[#d6eee9] bg-[#e9fbf8] px-2 text-[11px] font-medium text-[#166f64]">Closed options</button>
              <button onClick={() => { props.onSaveLine(menuLine, { isClosed: false }).catch(console.error); setParentMenu(null); }} className="min-h-7 rounded border border-[#e3e3dd] bg-white px-2 text-[11px] font-medium text-gray-600">Unclose</button>
            </>
          ) : (
            <>
              {props.productionId && <button onClick={() => { setPoPanelLine(menuLine); setParentMenu(null); }} className="min-h-7 rounded border border-[#e1d7ff] bg-[#fbf8ff] px-2 text-[11px] font-medium text-[#7c3aed]">Multi-line PO</button>}
              <CostLineAddButton lineType="PO" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "PO" }); setParentMenu(null); }} />
              <CostLineAddButton lineType="BILL" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "BILL" }); setParentMenu(null); }} />
              <CostLineAddButton lineType="PENDING_RECEIPT" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "PENDING_RECEIPT" }); setParentMenu(null); }} />
              <CostLineAddButton lineType="RECEIPT" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "RECEIPT" }); setParentMenu(null); }} />
              <CostLineAddButton lineType="IN_HOUSE" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "IN_HOUSE" }); setParentMenu(null); }} />
              <button onClick={() => { props.onDuplicate(menuLine).catch(console.error); setParentMenu(null); }} className="min-h-7 rounded border border-[#e3e3dd] bg-white px-2 text-[11px] font-medium text-gray-600">Duplicate</button>
              <button onClick={() => { props.onSaveLine(menuLine, { isClosed: true }).catch(console.error); setParentMenu(null); }} className="min-h-7 rounded border border-[#e3e3dd] bg-white px-2 text-[11px] font-medium text-gray-600">Close</button>
              <button onClick={() => { props.onDelete(menuLine).catch(console.error); setParentMenu(null); }} className="min-h-7 rounded border border-red-100 bg-red-50 px-2 text-[11px] font-medium text-red-600">Delete</button>
            </>
          )}
        </div>
      )}
      {poPanelLine && props.productionId && (
        <BudgetPoPanel
          productionId={props.productionId}
          initialLine={poPanelLine}
          onClose={() => setPoPanelLine(null)}
          onCreated={(nextRevision) => {
            setPoPanelLine(null);
            if (nextRevision) {
              props.onRevision(nextRevision);
              return;
            }
            api.get<BudgetRevision>(`/api/budgets/revisions/${props.revision.id}`)
              .then(props.onRevision)
              .catch(() => props.onError("PO created. Refresh budget to see allocations."));
          }}
        />
      )}
      {costPanelLine && (
        <CostLinesPanel
          revision={props.revision}
          line={props.revision.sections.flatMap((section) => section.lineItems).find((line) => line.id === costPanelLine.id) ?? costPanelLine}
          productionId={props.productionId}
          onClose={() => setCostPanelLine(null)}
          onRevision={props.onRevision}
          onError={props.onError}
          onOpenPoPanel={setPoPanelLine}
        />
      )}
      {closedPanelLine && (
        <ClosedLineActionsPanel
          revision={props.revision}
          line={props.revision.sections.flatMap((section) => section.lineItems).find((line) => line.id === closedPanelLine.id) ?? closedPanelLine}
          onClose={() => setClosedPanelLine(null)}
          onSaveLine={props.onSaveLine}
          onRevision={props.onRevision}
          onError={props.onError}
        />
      )}
      {costTrackerOpen && (
        <CostTrackerPanel
          revision={props.revision}
          onClose={() => setCostTrackerOpen(false)}
          onOpenLine={(line) => setCostPanelLine(line)}
          onRevision={props.onRevision}
          onError={props.onError}
        />
      )}
      </div>
    </div>
  );
}

function HeaderCell({ children, column, columns, title }: { children?: ReactNode; column: BudgetColumn; columns: BudgetColumn[]; title?: string }) {
  return <div title={title} style={frozenCellStyle(column, columns, 24)} className={`flex min-w-0 items-center truncate px-2 ${cellAlignClass(column)}`}>{children}</div>;
}

function sectionTint(index: number) {
  const colors = ["#13a18d", "#8b5cf6", "#3b82f6", "#d97706", "#16a34a"];
  return colors[index % colors.length];
}

function SectionIssueCount({ state, count }: { state: DotState; count: number }) {
  return (
    <span
      title={`${count} ${lineStateLabel(state).toLowerCase()}`}
      className="inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded border border-[#e0e0dc] bg-white/70 px-1 text-[10px] font-semibold tabular-nums text-[#555]"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOT_COLORS[state] }} />
      {count}
    </span>
  );
}

function SectionBlock({ section, collapsed, toggledCostLines, onToggleSection, onToggleCostLines, internal, ...props }: {
  section: BudgetSection;
  collapsed: boolean;
  toggledCostLines: Set<string>;
  columns: BudgetColumn[];
  gridStyle: CSSProperties;
  activeCell: ActiveBudgetCell;
  onActivateCell: (cell: ActiveBudgetCell) => void;
  onToggleSection: () => void;
  onToggleCostLines: (lineId: string) => void;
  onOpenParentMenu: (line: BudgetLineItem, x: number, y: number) => void;
  onOpenPoPanel: (line: BudgetLineItem) => void;
  onOpenCostPanel: (line: BudgetLineItem) => void;
  onOpenClosedPanel: (line: BudgetLineItem) => void;
  draggedLine: DraggedBudgetLine;
  dragOverLine: DragOverBudgetLine;
  onDragLineStart: (line: DraggedBudgetLine) => void;
  onDragLineOver: (line: DragOverBudgetLine) => void;
  onDragLineEnd: () => void;
  internal: boolean;
} & Omit<Parameters<typeof BudgetTable>[0], "mode">) {
  const sectionTotal = props.revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
  const displayTotals = displaySectionTotals(props.revision, section);
  const estimated = sectionTotal?.estimatedTotal ?? displayTotals.estimated;
  const actual = displayTotals.actual;
  const remaining = displayTotals.remaining;
  const topLevelLines = section.lineItems.filter((line) => !line.parentId);
  const sectionCounts = topLevelLines.reduce<Record<DotState, number>>((counts, line) => {
    counts[getDotState(line)] += 1;
    return counts;
  }, { YELLOW: 0, PURPLE: 0, BLUE: 0, LIGHT_GREEN: 0, DARK_GREEN: 0, GRAY: 0 });

  function reorderAround(targetLineId: string, placement: "before" | "after") {
    const movingLineId = props.draggedLine?.lineId;
    if (!movingLineId || props.draggedLine?.sectionId !== section.id || movingLineId === targetLineId) return;
    const currentIds = topLevelLines.map((line) => line.id);
    const nextIds = currentIds.filter((id) => id !== movingLineId);
    const targetIndex = nextIds.indexOf(targetLineId);
    nextIds.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, movingLineId);
    props.onReorderLines(section, nextIds).catch((error) => {
      console.error(error);
      props.onError("Could not reorder line items.");
    });
  }

  return (
    <section className="border-b border-[#e9e9e4]">
      <button onClick={onToggleSection} className="flex h-10 w-full items-center border-b border-[#e6e6e1] bg-[#f3f3ef] px-3 text-left text-[#1a1a1f] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md text-[10px] font-semibold text-white" style={{ backgroundColor: sectionTint(section.order) }}>{section.code}</span>
          <span className="truncate text-[12px] font-semibold uppercase tracking-[0.04em]">{section.name}</span>
          {collapsed ? <ChevronRight size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
          {internal && (
            <div className="ml-3 flex items-center gap-1">
              {(["YELLOW", "PURPLE", "BLUE", "LIGHT_GREEN", "DARK_GREEN"] as DotState[]).map((state) => (
                sectionCounts[state] > 0 ? <SectionIssueCount key={state} state={state} count={sectionCounts[state]} /> : null
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 text-xs">
          <span className="font-semibold tabular-nums text-[#1a1a1f]">{money(estimated)}</span>
          {internal && <span className={`rounded-full px-2 py-0.5 text-[10px] ${remainingPillClass(remaining, estimated)}`}>Balance {money(remaining)}</span>}
          <button
            onClick={(event) => { event.stopPropagation(); props.onAddLine(section).catch(console.error); }}
            className="grid h-8 w-8 place-items-center rounded text-gray-500 hover:bg-white hover:text-[#1a1a1f]"
            title="Add line"
          >
            <Plus size={14} />
          </button>
          <button onClick={(event) => event.stopPropagation()} className="grid h-8 w-8 place-items-center rounded text-gray-400 hover:bg-white hover:text-[#1a1a1f]" title="Section menu"><MoreHorizontal size={15} /></button>
        </div>
      </button>

      {!collapsed && topLevelLines.length === 0 && (
        <div className="flex h-10 items-center justify-center gap-2 border-b border-[#ededeb] bg-[#fbfbf8] text-[11px] text-gray-500">
          <span>No items —</span>
          <button onClick={props.onOpenTemplates} className="text-[#1a1a1f] underline">Browse templates</button>
          <span>or</span>
          <button onClick={() => props.onAddLine(section).catch(console.error)} className="text-[#1a1a1f] underline">+ Add line</button>
          {internal && (
            <>
              <span>or</span>
              <button onClick={() => props.onDeleteSection(section).catch(console.error)} className="text-red-600 underline">Delete section</button>
            </>
          )}
        </div>
      )}

      {!collapsed && topLevelLines.map((line) => (
        <ParentLineRow
          key={line.id}
          {...props}
          line={line}
          internal={internal}
          toggledCostLines={toggledCostLines.has(line.id)}
          onToggleCostLines={() => onToggleCostLines(line.id)}
          columns={props.columns}
          gridStyle={props.gridStyle}
          activeCell={props.activeCell}
          onActivateCell={props.onActivateCell}
          onOpenPoPanel={props.onOpenPoPanel}
          onOpenCostPanel={props.onOpenCostPanel}
          onOpenClosedPanel={props.onOpenClosedPanel}
          dragEnabled={internal && topLevelLines.length > 1}
          dragging={props.draggedLine?.lineId === line.id}
          dragOver={props.dragOverLine?.lineId === line.id && props.draggedLine?.sectionId === section.id && props.draggedLine?.lineId !== line.id ? props.dragOverLine.placement : null}
          onDragStart={() => props.onDragLineStart({ sectionId: section.id, lineId: line.id })}
          onDragOver={(event) => {
            if (props.draggedLine?.sectionId !== section.id || props.draggedLine.lineId === line.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const bounds = event.currentTarget.getBoundingClientRect();
            const placement = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
            props.onDragLineOver({ lineId: line.id, placement });
          }}
          onDragLeave={() => props.onDragLineOver(null)}
          onDrop={(event) => {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            reorderAround(line.id, event.clientY > bounds.top + bounds.height / 2 ? "after" : "before");
            props.onDragLineEnd();
          }}
          onDragEnd={props.onDragLineEnd}
        />
      ))}

      {internal && sectionTotal && estimated !== 0 && (
        <div className="grid h-8 items-center border-t border-[#e0e0dc] bg-[#f8f8f4] text-[11px] text-gray-500" style={props.gridStyle}>
          {props.columns.map((column) => {
            let content: ReactNode = null;
            if (column.key === "description") content = <div className="flex items-center px-2 italic">Section total</div>;
            if (column.key === "estimated") content = <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(estimated)}</div>;
            if (column.key === "actuals") content = <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(actual)}</div>;
            if (column.key === "remaining") content = <div className={`flex items-center justify-end px-2 font-medium not-italic tabular-nums ${remainingClass(remaining, estimated)}`}>{money(remaining)}</div>;
            return <div key={column.key} style={frozenCellStyle(column, props.columns)}>{content}</div>;
          })}
        </div>
      )}
    </section>
  );
}

function ParentLineRow({ line, internal, toggledCostLines, onToggleCostLines, ...props }: {
  line: BudgetLineItem;
  internal: boolean;
  toggledCostLines: boolean;
  columns: BudgetColumn[];
  gridStyle: CSSProperties;
  activeCell: ActiveBudgetCell;
  onActivateCell: (cell: ActiveBudgetCell) => void;
  onToggleCostLines: () => void;
  onOpenParentMenu: (line: BudgetLineItem, x: number, y: number) => void;
  onOpenPoPanel: (line: BudgetLineItem) => void;
  onOpenCostPanel: (line: BudgetLineItem) => void;
  onOpenClosedPanel: (line: BudgetLineItem) => void;
  dragEnabled: boolean;
  dragging: boolean;
  dragOver: "before" | "after" | null;
  onDragStart: () => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
} & Omit<Parameters<typeof BudgetTable>[0], "mode">) {
  const state = getDotState(line);
  const hasSubCosts = line.subCosts.length > 0;
  const displayActual = displayActualForLine(line);
  const displayRemaining = displayRemainingForLine(props.revision, line);
  const actualClass = hasSubCosts ? "text-[#2563eb]" : "text-[#c8c8c4]";
  const costLinesExpanded = hasSubCosts && toggledCostLines;
  const rowStyle = internal
    ? { ...props.gridStyle, background: state === "GRAY" ? "#f5f5f1" : "#fffefa", opacity: state === "GRAY" ? 0.74 : 1 }
    : props.gridStyle;
  const closed = state === "GRAY";

  function editableProps(field: string) {
    return {
      cellId: { rowId: line.id, field },
      active: props.activeCell?.rowId === line.id && props.activeCell.field === field,
      onActivate: props.onActivateCell,
    };
  }

  function renderCell(column: BudgetColumn) {
    switch (column.key) {
      case "dot":
        return internal ? <StatusDot state={state} /> : <div />;
      case "code":
        return (
          <div className="flex items-center gap-1 px-1.5 text-[11px] text-[#8f8f89]">
            {internal && (
              <span
                draggable={props.dragEnabled}
                onDragStart={(event) => {
                  if (!props.dragEnabled) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", line.id);
                  props.onDragStart();
                }}
                onDragEnd={props.onDragEnd}
                className={`grid h-6 w-4 place-items-center rounded text-[#b2b2ad] ${props.dragEnabled ? "cursor-grab hover:bg-[#f0f0eb] hover:text-[#555]" : "opacity-30"}`}
                title="Drag to reorder"
              >
                <GripVertical size={12} />
              </span>
            )}
            {internal && (
              <button
                type="button"
                draggable={false}
                disabled={!hasSubCosts}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggleCostLines(); }}
                className={`grid h-6 w-5 shrink-0 place-items-center rounded text-[#777] hover:bg-[#f0f0eb] disabled:pointer-events-none disabled:text-[#d4d4d0] ${hasSubCosts ? "" : "opacity-0 group-hover:opacity-100"}`}
                title={costLinesExpanded ? "Hide cost lines" : "Show cost lines"}
              >
                {costLinesExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            )}
            <span>{line.lineCode}</span>
          </div>
        );
      case "description":
        return <LineDescriptionCell line={line} state={state} internal={internal} readOnly={closed} onSave={(description) => props.onSaveLine(line, { description })} {...editableProps("description")} />;
      case "clientNotes":
        return <Cell><EditableCell value={line.clientNotes ?? ""} onSave={(value) => props.onSaveLine(line, { clientNotes: String(value) })} className="italic text-[#888]" readOnly={closed} {...editableProps("clientNotes")} /></Cell>;
      case "internalNotes":
        return internal ? <Cell><EditableCell value={line.internalNotes ?? ""} onSave={(value) => props.onSaveLine(line, { internalNotes: String(value) })} className="text-[#aaa]" readOnly={closed} {...editableProps("internalNotes")} /></Cell> : <div />;
      case "qty":
        return <NumberCell value={line.qty} onSave={(value) => props.onSaveLine(line, { qty: value ?? 0 })} readOnly={closed} {...editableProps("qty")} />;
      case "unit":
        return (
          <Cell>
            <UnitDaysCell
              days={line.days}
              unit={line.unit}
              readOnly={closed}
              onSaveDays={(days) => props.onSaveLine(line, { days })}
              onSaveUnit={(unit) => props.onSaveLine(line, { unit, days: unit === "Flat Fee" ? 1 : line.days })}
              {...editableProps("unit")}
            />
          </Cell>
        );
      case "rate":
        return <MoneyCell value={line.rate} onSave={(value) => props.onSaveLine(line, { rate: value ?? 0 })} readOnly={closed} {...editableProps("rate")} />;
      case "agency":
        return internal ? <PercentCell value={line.agencyFeePercent} onSave={(value) => props.onSaveLine(line, { agencyFeePercent: value ?? 0 })} readOnly={closed} className={Number(line.agencyFeePercent ?? 0) > 0 ? "text-[#d97706]" : ""} {...editableProps("agency")} /> : <div />;
      case "estimated":
        return <EstimatedCell line={line} />;
      case "actuals":
        return internal ? (
          <button
            onClick={() => props.onOpenCostPanel(line)}
            className={`flex min-h-[38px] w-full items-center justify-end rounded px-2 text-right tabular-nums transition hover:bg-[#f2f2ed] hover:underline ${actualClass}`}
            title={hasSubCosts ? "Open cost lines" : "No cost lines yet; showing estimated value as a placeholder"}
          >
            {money(displayActual)}
          </button>
        ) : <div />;
      case "remaining":
        return internal ? (
          <div className="flex min-h-[38px] flex-col items-end justify-center px-2 text-right leading-tight">
            <span className={`text-[12px] tabular-nums ${balanceClass(line, displayRemaining)}`}>{money(displayRemaining)}</span>
            <span className="text-[9px] uppercase tracking-[0.06em] text-[#b8b8b4]">{balanceLabel(line, displayRemaining)}</span>
          </div>
        ) : <div />;
      case "clo":
        return internal ? <StatusButton active={line.isClosed} onClick={() => line.isClosed ? props.onOpenClosedPanel(line) : props.onSaveLine(line, { isClosed: true }).catch(console.error)} title={line.isClosed ? "Closed line options" : "Close this line when fully settled"} /> : <div />;
      default:
        return <div />;
    }
  }

  return (
    <div className="group/line">
      <div
        className={`group relative grid min-h-[38px] items-center border-b ${props.dragOver === "before" ? "border-t-2 border-t-[#13a18d]" : props.dragOver === "after" ? "border-b-2 border-b-[#13a18d]" : SHEET_LINE} text-[12px] transition ${SHEET_HOVER} ${props.dragging ? "opacity-45" : ""}`}
        style={rowStyle}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        onDrop={props.onDrop}
        onContextMenu={(event) => {
          if (!internal) return;
          event.preventDefault();
          props.onOpenParentMenu(line, event.clientX, event.clientY);
        }}
      >
        {props.columns.map((column) => <div key={column.key} style={frozenCellStyle(column, props.columns)} className="min-w-0">{renderCell(column)}</div>)}
      </div>

      {internal && costLinesExpanded && line.subCosts.map((subCost) => (
        <SubCostRow key={subCost.id} subCost={subCost} closed={closed} columns={props.columns} gridStyle={props.gridStyle} onRevision={props.onRevision} onError={props.onError} />
      ))}
      {internal && props.addingCostLine?.lineId === line.id && (
        <SubCostDraftRow lineId={line.id} initialLineType={props.addingCostLine.lineType} columns={props.columns} gridStyle={props.gridStyle} onCancel={() => props.onSetAddingCostLine(null)} onRevision={(next) => { props.onRevision(next); props.onSetAddingCostLine(null); }} onError={props.onError} />
      )}
    </div>
  );
}

function Cell({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`flex min-h-[38px] items-center px-2 ${className}`}>{children}</div>;
}

function ReadMoney({ value, strong, className, title }: { value: number | null | undefined; strong?: boolean; className?: string; title?: string }) {
  return <div title={title} className={`flex min-h-[38px] items-center justify-end px-2 text-right tabular-nums ${strong ? "font-medium" : ""} ${className ?? moneyClass(value)}`}>{money(value)}</div>;
}

function StatusDot({ state }: { state: DotState }) {
  const hollow = state === "YELLOW";
  return (
    <div title={lineStateLabel(state)} className="flex min-h-[38px] w-6 items-center justify-center">
      <span
        className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full ring-2 ring-white shadow-[0_1px_3px_rgba(0,0,0,0.16)]"
        style={{
          backgroundColor: hollow ? "transparent" : DOT_COLORS[state],
          border: hollow ? `2px solid ${DOT_COLORS[state]}` : undefined,
        }}
      />
    </div>
  );
}

function LineDescriptionCell({ line, state, readOnly, onSave, cellId, active, onActivate }: { line: BudgetLineItem; state: DotState; internal: boolean; readOnly: boolean; onSave: (value: string) => Promise<void> } & BudgetCellHandle) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.description);
  useEffect(() => setDraft(line.description), [line.description]);
  const textClass = state === "GRAY" ? "text-gray-500" : "text-[#1a1a1f]";

  async function save() {
    setEditing(false);
    if (draft !== line.description) await onSave(draft);
  }

  if (editing && !readOnly) {
    return (
      <Cell>
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => save().catch(console.error)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save().catch(console.error);
            if (event.key === "Escape") { setDraft(line.description); setEditing(false); }
          }}
          className="h-7 w-full rounded border-0 bg-[#f7f7f3] px-1 text-xs font-medium outline-none ring-2 ring-[#13a18d]/25"
        />
      </Cell>
    );
  }

  return (
    <Cell>
      <button
        disabled={readOnly}
        data-budget-cell={cellId ? `${cellId.rowId}:${cellId.field}` : undefined}
        data-budget-row={cellId?.rowId}
        onFocus={() => cellId && onActivate?.(cellId)}
        onClick={() => { if (cellId) onActivate?.(cellId); setEditing(true); }}
        className={`flex min-w-0 items-center rounded px-1 py-1 text-left text-[12px] font-semibold hover:bg-[#f7f7f3] focus:outline-none ${active ? "ring-2 ring-[#13a18d]" : ""} disabled:hover:bg-transparent ${textClass}`}
      >
        <span className="truncate">{line.description || "—"}</span>
      </button>
    </Cell>
  );
}

function EditableCell({ value, onSave, className = "", kind = "text", readOnly = false, cellId, active, onActivate }: { value: string | number | null | undefined; onSave: (value: string | number | null) => Promise<void>; className?: string; kind?: EditableKind; readOnly?: boolean } & BudgetCellHandle) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  const [flash, setFlash] = useState(false);
  useEffect(() => setDraft(value === null || value === undefined ? "" : String(value)), [value]);

  async function save(move?: "next" | "down") {
    setEditing(false);
    const next = kind === "text" ? draft : draft === "" ? null : Number(draft);
    const current = value === null || value === undefined ? "" : String(value);
    if (String(draft) !== current) {
      await onSave(next);
      setFlash(true);
      window.setTimeout(() => setFlash(false), 350);
    }
    if (move) {
      window.setTimeout(() => {
        const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-budget-editable='true']"));
        const currentButton = document.activeElement as HTMLElement | null;
        const index = currentButton ? cells.indexOf(currentButton) : -1;
        const target = cells[index + 1] ?? null;
        target?.focus();
      }, 0);
    }
  }

  function keyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setDraft(value === null || value === undefined ? "" : String(value));
      setEditing(false);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      save("down").catch(console.error);
    }
    if (event.key === "Tab") {
      event.preventDefault();
      save("next").catch(console.error);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={kind === "text" ? "text" : "number"}
        step="any"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => save().catch(console.error)}
        onKeyDown={keyDown}
        className={`h-7 w-full rounded border-0 bg-[#f7f7f3] px-1 text-xs outline-none ring-2 ${EDIT_FOCUS} ${kind === "text" ? "text-left" : "text-right tabular-nums"} ${className}`}
      />
    );
  }

  const display = kind === "money" ? money(Number(value ?? 0)) : kind === "percent" ? percentLabel(Number(value ?? 0)) : kind === "number" ? numeric(Number(value ?? 0)) : String(value || "");
  if (readOnly) {
    return <div className={`min-h-[30px] w-full truncate rounded px-1 text-left ${kind !== "text" ? "text-right tabular-nums" : ""} ${Number(value ?? 1) === 0 && kind !== "text" ? "text-[#c8c8c4]" : ""} ${className}`}>{display || (kind === "text" ? "—" : "")}</div>;
  }
  return (
    <button
      data-budget-editable="true"
      data-budget-cell={cellId ? `${cellId.rowId}:${cellId.field}` : undefined}
      data-budget-row={cellId?.rowId}
      onFocus={() => cellId && onActivate?.(cellId)}
      onClick={() => setEditing(true)}
      className={`min-h-[30px] w-full truncate rounded px-1 text-left transition hover:bg-[#f7f7f3] focus:outline-none focus:ring-2 ${active ? "ring-[#13a18d]" : EDIT_FOCUS} ${kind !== "text" ? "text-right tabular-nums" : ""} ${flash ? "bg-[#e8f4f1]" : ""} ${Number(value ?? 1) === 0 && kind !== "text" ? "text-[#c8c8c4]" : ""} ${className}`}
    >
      {display || (kind === "text" ? "—" : "")}
    </button>
  );
}

function NumberCell({ value, onSave, readOnly = false, ...cellHandle }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean } & BudgetCellHandle) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="number" readOnly={readOnly} {...cellHandle} /></Cell>;
}

function MoneyCell({ value, onSave, readOnly = false, ...cellHandle }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean } & BudgetCellHandle) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="money" readOnly={readOnly} {...cellHandle} /></Cell>;
}

function PercentCell({ value, onSave, readOnly = false, className = "", ...cellHandle }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean; className?: string } & BudgetCellHandle) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="percent" readOnly={readOnly} className={className} {...cellHandle} /></Cell>;
}

function UnitDaysCell({ days, unit, onSaveDays, onSaveUnit, readOnly = false, cellId, active, onActivate }: {
  days: number;
  unit: string;
  onSaveDays: (value: number) => Promise<void>;
  onSaveUnit: (value: string) => Promise<void>;
  readOnly?: boolean;
} & BudgetCellHandle) {
  const [open, setOpen] = useState(false);
  const [editingDays, setEditingDays] = useState(false);
  const [draftDays, setDraftDays] = useState(String(days ?? 1));
  const ref = useRef<HTMLDivElement>(null);
  const flatFee = unit === "Flat Fee";

  useEffect(() => setDraftDays(String(days ?? 1)), [days]);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  async function saveDays() {
    setEditingDays(false);
    const next = Number(draftDays || 1);
    if (next !== days) await onSaveDays(next);
  }

  return (
    <div ref={ref} className="relative flex w-full items-center justify-end gap-1 text-right text-xs tabular-nums">
      {!flatFee && (
        editingDays && !readOnly ? (
          <input
            autoFocus
            type="number"
            step="any"
            value={draftDays}
            onChange={(event) => setDraftDays(event.target.value)}
            onBlur={() => saveDays().catch(console.error)}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveDays().catch(console.error);
              if (event.key === "Escape") { setDraftDays(String(days ?? 1)); setEditingDays(false); }
            }}
            className="h-7 w-9 rounded border-0 bg-[#f7f7f3] px-1 text-right text-xs outline-none ring-2 ring-[#13a18d]/25"
          />
        ) : (
          <button disabled={readOnly} data-budget-editable="true" data-budget-cell={cellId ? `${cellId.rowId}:${cellId.field}` : undefined} data-budget-row={cellId?.rowId} onFocus={() => cellId && onActivate?.(cellId)} onClick={() => setEditingDays(true)} className={`rounded px-1 hover:bg-[#f7f7f3] ${active ? "ring-2 ring-[#13a18d]" : ""} ${Number(days ?? 0) === 0 ? "text-[#c8c8c4]" : ""}`}>
            {numeric(days) || "0"}
          </button>
        )
      )}
      <button disabled={readOnly} onClick={() => setOpen(!open)} className="flex min-h-[30px] items-center gap-1 rounded px-1 text-xs hover:bg-[#f7f7f3]">
        <span>{unit}</span><span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-40 w-32 rounded-md border border-[#e3e3dd] bg-[#fffefa] py-1 text-xs shadow-[0_10px_24px_rgba(20,20,20,0.10)]">
          {UNITS.map((option) => (
            <button
              key={option}
              onClick={() => { onSaveUnit(option).catch(console.error); setOpen(false); }}
              className={`block h-[30px] w-full px-2 text-left hover:bg-[#f2f2ed] ${option === unit ? "bg-[#1a1a1f] text-white" : ""}`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EstimatedCell({ line }: { line: BudgetLineItem }) {
  const qty = Number(line.qty ?? 1);
  const days = Number(line.unit === "Flat Fee" ? 1 : line.days ?? 1);
  const rate = Number(line.rate ?? 0);
  const agency = Number(line.agencyFeePercent ?? 0);
  const base = qty * days * rate;
  const agencyValue = base * (agency / 100);

  return (
    <div className="group/estimated relative">
      <ReadMoney value={line.estimatedTotal} strong />
      <div className="pointer-events-none absolute bottom-8 right-1 z-40 hidden w-max min-w-48 rounded-md border border-[#e3e3dd] bg-[#fffefa] px-3 py-2 text-left text-[11px] leading-[1.6] text-[#1a1a1f] shadow-[0_10px_24px_rgba(20,20,20,0.12)] group-hover/estimated:block">
        {line.unit === "Flat Fee" ? (
          <div>{qty} × {money(rate)} Flat Fee = {money(base)}</div>
        ) : (
          <div>{qty} × {days} {line.unit} × {money(rate)} = {money(base)}</div>
        )}
        {agency > 0 && (
          <>
            <div>+ {percentLabel(agency)} agency = {money(agencyValue)}</div>
            <div className="font-medium">Total: {money(line.estimatedTotal)}</div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusButton({ active, onClick, title }: { active: boolean; onClick?: () => void; title: string }) {
  return (
    <button title={title} onClick={onClick} disabled={!onClick} className="grid min-h-[38px] place-items-center text-[11px]">
      {statusSymbol(active)}
    </button>
  );
}

function CostLineAddButton({ lineType, onClick }: { lineType: SubCostLineType; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`min-h-7 rounded border px-2 text-[11px] font-medium transition hover:brightness-[0.98] ${lineTypeClass(lineType)}`} title={`Add ${lineTypeName(lineType)}`}>
      + {lineTypeName(lineType)}
    </button>
  );
}

function CostLineTypePill({ lineType, onChange, menuPlacement = "bottom" }: { lineType: SubCostLineType; onChange: (lineType: SubCostLineType) => void; menuPlacement?: "top" | "bottom" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const menuClass = menuPlacement === "top" ? "bottom-7" : "top-7";
  return (
    <div ref={ref} className="relative flex items-center justify-center">
      <button onClick={() => setOpen(!open)} className={`max-w-[68px] truncate rounded border px-1.5 py-1 text-[10px] font-medium ${lineTypeClass(lineType)}`}>
        {lineTypeLabel(lineType)} ▾
      </button>
      {open && (
        <div className={`absolute left-0 ${menuClass} z-[90] w-36 rounded-md border border-[#e3e3dd] bg-[#fffefa] py-1 shadow-[0_10px_24px_rgba(20,20,20,0.14)]`}>
          {(["PO", "BILL", "PENDING_RECEIPT", "RECEIPT", "IN_HOUSE"] as SubCostLineType[]).map((type) => (
            <button key={type} onClick={() => { onChange(type); setOpen(false); }} className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-[#f2f2ed] ${type === lineType ? "font-semibold" : ""}`}>
              {lineTypeName(type)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubCostRow({ subCost, closed, columns, gridStyle, onRevision, onError }: { subCost: SubCost; closed: boolean; columns: BudgetColumn[]; gridStyle: CSSProperties; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const background = subCost.lineType === "BILL" && subCost.isPaid
    ? "#f0fdf4"
    : subCost.lineType === "RECEIPT" && subCost.freeAgentTransactionId
      ? "#dcfce7"
      : COST_LINE_BACKGROUNDS[subCost.lineType];
  const amountClass = subCost.lineType === "PO"
    ? "text-[#8b5cf6]"
    : subCost.lineType === "PENDING_RECEIPT"
      ? "text-[#d97706]"
    : subCost.lineType === "IN_HOUSE"
      ? "text-[#0f766e]"
    : subCost.lineType === "BILL" && !subCost.isPaid
      ? "text-[#3b82f6]"
      : "text-[#16a34a]";
  const reference = subCost.lineType === "PO" ? subCost.poNumber : subCost.lineType === "BILL" ? subCost.invoiceNumber : null;

  async function patch(patchData: Partial<SubCost>) {
    try {
      const response = await api.patch<SubCostMutationResponse>(`/api/budgets/subcosts/${subCost.id}`, patchData);
      if (response.revision) onRevision(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${subCost.description}?`)) return;
    const result = await fetch(`/api/budgets/subcosts/${subCost.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!result.ok) throw new Error("Delete failed");
    const response = await result.json() as { revision: BudgetRevision | null };
    if (response.revision) onRevision(response.revision);
  }

  async function exportPoDocument() {
    if (!subCost.purchaseOrderGroupId) return;
    const file = await api.post<BudgetPdfExportResponse>(`/api/budgets/purchase-orders/${subCost.purchaseOrderGroupId}/export-pdf`, {});
    const link = document.createElement("a");
    link.href = `/api/files/${file.id}/download`;
    link.download = file.originalFilename || `${subCost.poNumber ?? "PO"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderCell(column: BudgetColumn) {
    if (column.key === "description") {
      return (
        <div className="flex min-h-[30px] min-w-0 items-center gap-2 overflow-hidden pl-12 pr-2">
          <span className="shrink-0 text-[#b8b8b4]">{subCost.receiptCaptureId ? <Camera size={12} /> : "└─"}</span>
          <CostLineTypePill lineType={subCost.lineType} onChange={(lineType) => patch({ lineType }).catch(console.error)} />
          {reference && <span className="shrink-0 whitespace-nowrap text-xs font-medium" style={{ color: DOT_COLORS[subCost.lineType === "PO" ? "PURPLE" : "BLUE" ] }}>{reference}</span>}
          {subCost.lineType === "PO" && subCost.purchaseOrderGroupId && (
            <button onClick={() => exportPoDocument().catch((err: unknown) => onError(err instanceof Error ? err.message : "PO export failed"))} className="grid h-5 w-5 shrink-0 place-items-center rounded border border-[#e1d7ff] bg-white text-[#7c3aed] hover:bg-[#fbf8ff]" title="Download supplier PO">
              <Download size={12} />
            </button>
          )}
          <EditableCell value={subCost.description} onSave={(value) => patch({ description: String(value) })} className="min-w-0 text-[#555]" />
          {subCost.supplierName && <span className="shrink-0 truncate text-[11px] italic text-[#888]">{subCost.supplierName}</span>}
        </div>
      );
    }
    if (column.key === "actuals") {
      return (
        <div className="flex min-h-[30px] items-center justify-end gap-1 px-2 text-right tabular-nums">
          <EditableCell value={subCost.amount} onSave={(value) => patch({ amount: Number(value ?? 0) })} kind="money" className={amountClass} />
        </div>
      );
    }
    if (column.key === "remaining") return <CostLineLifecycleCell subCost={subCost} onPatch={patch} />;
    if (column.key === "clo") {
      return (
        <div className="flex min-h-[30px] items-center justify-end gap-1 px-1">
          <Paperclip size={14} className={subCost.invoiceFileId ? "text-[#1a1a1f]" : "text-[#888]"} />
          {subCost.proofOfPayment ? <Check size={14} className="text-green-600" /> : <span className="text-[#aaa]">✓</span>}
          <button onClick={remove} className="grid h-7 w-7 place-items-center text-[#aaa] hover:text-red-600"><X size={12} /></button>
        </div>
      );
    }
    return <div />;
  }

  return (
    <div className="grid min-h-[30px] border-b border-[#f0f0ed] text-[11px]" style={{ ...gridStyle, background, opacity: closed ? 0.74 : 1 }}>
      {columns.map((column) => <div key={column.key} style={frozenCellStyle(column, columns)} className="min-w-0">{renderCell(column)}</div>)}
    </div>
  );
}

function CostLineLifecycleCell({ subCost, onPatch }: { subCost: SubCost; onPatch: (patchData: Partial<SubCost>) => Promise<void> }) {
  if (subCost.lineType === "PO") {
    return (
      <div className="flex min-h-[30px] items-center justify-end">
        <button
          onClick={() => onPatch({ lineType: "BILL" }).catch(console.error)}
          className="min-h-7 rounded border border-[#cfe0fb] bg-[#f5f9ff] px-2 text-[11px] font-medium text-[#2563eb]"
          title="Convert this PO to a Bill"
        >
          + Bill
        </button>
      </div>
    );
  }

  if (subCost.lineType === "RECEIPT") {
    return (
      <div className="flex min-h-[30px] items-center justify-end px-2 text-[11px] font-medium text-[#16a34a]">
        Paid ✓
      </div>
    );
  }

  if (subCost.lineType === "IN_HOUSE") {
    return (
      <div className="flex min-h-[30px] items-center justify-end px-2 text-[11px] font-medium text-[#0f766e]" title="Retained in-house cost">
        In-house
      </div>
    );
  }

  if (subCost.lineType === "PENDING_RECEIPT") {
    return (
      <div className="flex min-h-[30px] items-center justify-end px-2 text-[11px] font-medium text-[#d97706]" title="Paid spend captured without receipt">
        Receipt needed
      </div>
    );
  }

  return (
    <button
      onClick={() => onPatch({ isPaid: !subCost.isPaid }).catch(console.error)}
      className="flex min-h-[30px] items-center justify-end gap-1 text-[11px] font-medium"
      title="Mark bill as paid"
    >
      {subCost.isPaid ? <span className="text-[#16a34a]">Paid ✓</span> : <span className="text-[#d4d4d0]">○ Paid</span>}
    </button>
  );
}

function SubCostDraftRow({ lineId, initialLineType, columns, gridStyle, onCancel, onRevision, onError }: { lineId: string; initialLineType: SubCostLineType; columns: BudgetColumn[]; gridStyle: CSSProperties; onCancel: () => void; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const [lineType, setLineType] = useState<SubCostLineType>(initialLineType);
  const [description, setDescription] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");

  async function save() {
    try {
      const response = await api.post<SubCostMutationResponse>(`/api/budgets/lines/${lineId}/subcosts`, {
        lineType,
        description: description || `${lineTypeLabel(lineType)} cost line`,
        supplierName: supplierName || null,
        amount: Number(amount || 0),
      });
      if (response.revision) onRevision(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function renderCell(column: BudgetColumn) {
    if (column.key === "description") {
      return (
        <div className="flex min-h-[30px] items-center gap-2 pl-12 pr-2">
          <span className="shrink-0 text-[#b8b8b4]">└─</span>
          <CostLineTypePill lineType={lineType} onChange={setLineType} />
          <input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description..." className="h-7 min-w-0 flex-1 rounded border-0 bg-white/70 px-1 text-xs outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
          <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier..." className="h-7 w-28 rounded border-0 bg-white/70 px-1 text-[11px] italic text-[#888] outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
        </div>
      );
    }
    if (column.key === "actuals") return <Cell><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" placeholder="£" className="h-7 w-full rounded border-0 bg-white/70 px-1 text-right text-xs tabular-nums outline-none focus:ring-2 focus:ring-[#13a18d]/25" /></Cell>;
    if (column.key === "clo") {
      return (
        <div className="flex min-h-[30px] items-center justify-end gap-2 px-2">
          <button onClick={save} className="min-h-[28px] rounded bg-[#1a1a1f] px-2 text-[11px] font-medium text-white">Save</button>
          <button onClick={onCancel} className="grid min-h-[28px] w-7 place-items-center text-red-600"><X size={12} /></button>
        </div>
      );
    }
    return <div />;
  }

  return (
    <div className="grid min-h-[30px] border-b border-[#f0f0ed] bg-[#fbfbf8] text-[11px]" style={gridStyle}>
      {columns.map((column) => <div key={column.key} style={frozenCellStyle(column, columns)} className="min-w-0">{renderCell(column)}</div>)}
    </div>
  );
}

function TemplatePicker({ templates, onApply, onBlank }: { templates: SectionTemplate[]; onApply: (templateId: string) => Promise<void>; onBlank: () => void }) {
  const iconFor = (name: string) => name.includes("Motion") ? "🎬" : name.includes("Event") ? "🎉" : "📷";
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="w-full max-w-3xl rounded-lg border border-[#e8e8e4] bg-white p-8 text-center">
        <h2 className="text-base font-semibold text-[#1a1a1f]">Choose a template to get started</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {templates.map((template) => (
            <button key={template.id} onClick={() => onApply(template.id).catch(console.error)} className="h-[110px] w-[180px] rounded-lg border border-[#e8e8e4] bg-white p-4 text-center hover:border-[#1a1a1f]">
              <div className="text-2xl">{iconFor(template.name)}</div>
              <p className="mt-2 text-sm font-medium">{template.name}</p>
              <p className="mt-1 text-xs text-gray-400">{template.sections.length} sections</p>
            </button>
          ))}
        </div>
        <button onClick={onBlank} className="mt-7 min-h-11 text-sm text-gray-500 hover:text-[#1a1a1f]">or <span className="font-medium underline">Start blank →</span></button>
      </div>
    </div>
  );
}

function TemplatePanel({ templates, onClose, onApply }: { templates: SectionTemplate[]; onClose: () => void; onApply: (templateId: string) => Promise<void> }) {
  return (
    <SidePanel title="Section templates" onClose={onClose} width="360px">
      <div className="space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-md border border-[#e8e8e4] p-3">
            <p className="text-sm font-medium">{template.name}</p>
            <p className="text-xs text-gray-500">{template.sections.length} sections</p>
            <button onClick={() => onApply(template.id).catch(console.error)} className="mt-3 min-h-10 rounded bg-[#1a1a1f] px-3 text-xs text-white">Apply</button>
          </div>
        ))}
      </div>
    </SidePanel>
  );
}

function VersionPanel({ currentRevision, revisions, onClose, onOpenRevision, onPatchRevision }: { currentRevision: BudgetRevision; revisions: BudgetRevisionSummary[]; onClose: () => void; onOpenRevision: (revisionId: string) => Promise<void>; onPatchRevision: (patch: Partial<BudgetRevision>) => Promise<void> }) {
  const [compare, setCompare] = useState<BudgetCompareResult | null>(null);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  useEffect(() => {
    setCompare(null);
    if (!currentRevision.sourceRevisionId) return;
    api.get<BudgetCompareResult>(`/api/budgets/revisions/${currentRevision.id}/compare`)
      .then(setCompare)
      .catch(() => setCompare(null));
  }, [currentRevision.id, currentRevision.sourceRevisionId]);

  return (
    <SidePanel title="Budget versions" onClose={onClose} width="460px">
      <div className="space-y-4">
        <section className="rounded-lg border border-[#e6e6e1] bg-[#fbfbf8] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">Current estimate</p>
              <h3 className="mt-1 text-sm font-semibold text-[#1a1a1f]">{budgetVersionLabel(currentRevision)} · {currentRevision.label}</h3>
            </div>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${revisionTone(currentRevision)}`}>{STATUS_LABELS[currentRevision.status]}</span>
          </div>
          <div className="mt-3 space-y-3">
            <BudgetPanelInput label="Estimate description" value={currentRevision.estimateDescription ?? ""} onChange={(value) => onPatchRevision({ estimateDescription: value }).catch(console.error)} placeholder="1 day location shoot in NY with John Munro and 2 models" />
            <BudgetPanelInput label="Change summary" value={currentRevision.changeSummary ?? ""} onChange={(value) => onPatchRevision({ changeSummary: value }).catch(console.error)} placeholder="What changed in this version?" />
            <BudgetPanelInput label="Representative" value={currentRevision.representative ?? ""} onChange={(value) => onPatchRevision({ representative: value }).catch(console.error)} placeholder="Conor Bond" />
            <BudgetPanelInput label="Valid until" value={currentRevision.validUntil ? currentRevision.validUntil.slice(0, 10) : ""} onChange={(value) => onPatchRevision({ validUntil: value }).catch(console.error)} placeholder="YYYY-MM-DD" />
            <BudgetPanelTextarea label="Included" value={currentRevision.includedNotes ?? ""} onChange={(value) => onPatchRevision({ includedNotes: value }).catch(console.error)} />
            <BudgetPanelTextarea label="Not included" value={currentRevision.notIncludedNotes ?? ""} onChange={(value) => onPatchRevision({ notIncludedNotes: value }).catch(console.error)} />
            <BudgetPanelTextarea label="Assumptions" value={currentRevision.assumptions ?? ""} onChange={(value) => onPatchRevision({ assumptions: value }).catch(console.error)} />
            <BudgetPanelTextarea label="Payment terms" value={currentRevision.paymentTerms ?? ""} onChange={(value) => onPatchRevision({ paymentTerms: value }).catch(console.error)} placeholder="50% deposit required before shoot." />
          </div>
        </section>

        {compare && (
          <section className="rounded-lg border border-[#e6e6e1] bg-white p-3">
            <button onClick={() => setComparisonOpen(!comparisonOpen)} className="flex w-full items-center justify-between text-left">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">Compare to source</p>
                <p className="mt-1 text-sm font-semibold text-[#1a1a1f]">{compare.baseRevision ? budgetVersionLabel(compare.baseRevision) : "Previous"} → {budgetVersionLabel(currentRevision)}</p>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${compare.totalDelta > 0 ? "text-[#dc2626]" : compare.totalDelta < 0 ? "text-[#16a34a]" : "text-gray-400"}`}>{compare.totalDelta > 0 ? "+" : ""}{money(compare.totalDelta)}</span>
            </button>
            {comparisonOpen && (
              <div className="mt-3 max-h-56 space-y-1 overflow-auto border-t border-[#ededeb] pt-2">
                {compare.changes.length === 0 ? (
                  <p className="py-3 text-center text-xs text-gray-400">No line-level estimate changes.</p>
                ) : compare.changes.map((change) => (
                  <div key={`${change.type}-${change.sectionCode}-${change.lineCode}-${change.description}`} className="grid grid-cols-[1fr_80px] gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#fbfbf8]">
                    <div className="min-w-0">
                      <span className="mr-2 text-[10px] uppercase text-gray-400">{change.type}</span>
                      <span className="font-medium text-[#1a1a1f]">{change.lineCode}</span>
                      <span className="ml-2 text-gray-600">{change.description}</span>
                    </div>
                    <span className={`text-right font-medium tabular-nums ${change.deltaEstimated > 0 ? "text-[#dc2626]" : "text-[#16a34a]"}`}>{change.deltaEstimated > 0 ? "+" : ""}{money(change.deltaEstimated)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="space-y-2">
        {revisions.map((revisionItem) => {
          const active = revisionItem.id === currentRevision.id;
          const source = revisionItem.sourceRevisionId ? revisions.find((item) => item.id === revisionItem.sourceRevisionId) : null;
          return (
            <button
              key={revisionItem.id}
              onClick={() => onOpenRevision(revisionItem.id).then(onClose).catch(console.error)}
              className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-[#13a18d] bg-[#e9fbf8]" : "border-[#e6e6e1] bg-white hover:bg-[#fbfbf8]"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#1a1a1f]">{budgetVersionLabel(revisionItem)}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${revisionTone(revisionItem)}`}>{STATUS_LABELS[revisionItem.status]}</span>
                </div>
                <span className="text-xs font-medium tabular-nums text-gray-500">{money(revisionItem.grandTotal)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{revisionItem.changeSummary || (source ? `Created from ${budgetVersionLabel(source)}` : "Major version")}</p>
              <p className="mt-1 text-[11px] text-gray-400">{new Date(revisionItem.updatedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </button>
          );
        })}
        </div>
      </div>
    </SidePanel>
  );
}

function ClosedLineActionsPanel({ revision, line, onClose, onSaveLine, onRevision, onError }: {
  revision: BudgetRevision;
  line: BudgetLineItem;
  onClose: () => void;
  onSaveLine: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
}) {
  const available = Math.max(0, adjustedBalanceForLine(revision, line));
  const [toLineItemId, setToLineItemId] = useState("");
  const [amount, setAmount] = useState(String(available));
  const [reason, setReason] = useState("");
  const targetLines = revision.sections
    .flatMap((section) => section.lineItems.map((item) => ({ ...item, sectionName: section.name })))
    .filter((item) => !item.parentId && item.id !== line.id && !item.isClosed);

  async function transferRemaining() {
    try {
      const transferAmount = Number(amount || 0);
      if (!toLineItemId || transferAmount <= 0) throw new Error("Choose a target line and amount to transfer.");
      const next = await api.post<BudgetRevision>(`/api/budgets/revisions/${revision.id}/transfers`, {
        fromLineItemId: line.id,
        toLineItemId,
        amount: Math.min(transferAmount, available),
        reason: reason || `Closed-line transfer from ${line.lineCode}`,
      });
      onRevision(next);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Transfer failed");
    }
  }

  async function retainAsProfit() {
    try {
      await onSaveLine(line, { isClosed: true, reconNotes: line.reconNotes || "Remaining balance retained as job profit" });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function unclose() {
    try {
      await onSaveLine(line, { isClosed: false });
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <SidePanel title="Closed line options" onClose={onClose} width="520px">
      <div className="space-y-4">
        <section className="rounded-lg border border-[#e6e6e1] bg-[#fbfbf8] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">{line.lineCode}</p>
          <h3 className="mt-1 text-base font-semibold text-[#1a1a1f]">{line.description}</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <CostMetric label="Estimated" value={money(line.estimatedTotal)} />
            <CostMetric label="Committed" value={money(line.actualTotal)} />
            <CostMetric label="Remaining" value={money(available)} className="text-[#16a34a]" />
          </div>
        </section>

        <section className="rounded-lg border border-[#e6e6e1] bg-white p-3">
          <h4 className="text-sm font-semibold text-[#1a1a1f]">Transfer remaining</h4>
          <div className="mt-3 grid gap-3">
            <label className="text-xs text-gray-500">
              Target line
              <select value={toLineItemId} onChange={(event) => setToLineItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e1e1dc] bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25">
                <option value="">Choose line item pot</option>
                {targetLines.map((target) => (
                  <option key={target.id} value={target.id}>{target.lineCode} {target.description} · {target.sectionName}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-[120px_1fr]">
              <BudgetPanelInput label="Amount" value={amount} onChange={setAmount} />
              <BudgetPanelInput label="Reason" value={reason} onChange={setReason} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button disabled={available <= 0 || !toLineItemId} onClick={() => transferRemaining().catch(console.error)} className="min-h-9 rounded-md bg-[#1a1a1f] px-3 text-xs font-medium text-white disabled:bg-gray-200 disabled:text-gray-500">Transfer</button>
          </div>
        </section>

        <div className="grid gap-2 md:grid-cols-2">
          <button onClick={() => retainAsProfit().catch(console.error)} className="min-h-10 rounded-lg border border-[#d6eee9] bg-[#e9fbf8] px-3 text-sm font-medium text-[#166f64]">
            Add remaining to job profit
          </button>
          <button onClick={() => unclose().catch(console.error)} className="min-h-10 rounded-lg border border-[#e6e6e1] bg-white px-3 text-sm font-medium text-gray-700">
            Unclose line item
          </button>
        </div>
      </div>
    </SidePanel>
  );
}

function CostLinesPanel({ revision, line, productionId, onClose, onRevision, onError, onOpenPoPanel }: {
  revision: BudgetRevision;
  line: BudgetLineItem;
  productionId: string | null;
  onClose: () => void;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
  onOpenPoPanel: (line: BudgetLineItem) => void;
}) {
  const [addingType, setAddingType] = useState<SubCostLineType | null>(null);
  const actual = Number(line.actualTotal ?? 0);
  const estimate = Number(line.estimatedTotal ?? 0);
  const remaining = Number(line.variance ?? 0);
  const transfers = transferSummaryForLine(revision, line.id);
  const adjustedBalance = remaining + transfers.adjustedBalance;

  return (
    <SidePanel title="Cost lines" onClose={onClose} width="520px">
      <div className="space-y-4">
        <section className="rounded-lg border border-[#e6e6e1] bg-[#fbfbf8] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">{line.lineCode}</p>
              <h3 className="mt-1 truncate text-base font-semibold text-[#1a1a1f]">{line.description}</h3>
            </div>
            <StatusDot state={getDotState(line)} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <CostMetric label="Estimated" value={money(estimate)} />
            <CostMetric label="Actuals" value={line.subCosts.length ? money(actual) : "No costs"} muted={!line.subCosts.length} />
            <CostMetric label={line.subCosts.length ? balanceLabel(line, adjustedBalance) : "Available"} value={line.subCosts.length ? money(adjustedBalance) : money(0)} className={line.subCosts.length ? (adjustedBalance < 0 ? "text-[#dc2626]" : adjustedBalance === 0 ? "text-[#c8c8c4]" : "text-[#16a34a]") : "text-[#c8c8c4]"} />
          </div>
          {(transfers.transferIn > 0 || transfers.transferOut > 0) && (
            <p className="mt-2 text-[11px] text-gray-500">
              Transfers: {transfers.transferIn > 0 ? `+${money(transfers.transferIn)} in` : ""}{transfers.transferIn > 0 && transfers.transferOut > 0 ? " · " : ""}{transfers.transferOut > 0 ? `${money(transfers.transferOut)} released` : ""}
            </p>
          )}
          {!line.subCosts.length && (
            <p className="mt-3 rounded-md bg-white px-3 py-2 text-[12px] leading-5 text-gray-500">
              No spend is committed yet. The grid shows the estimate as a grey placeholder until a PO, Bill, quick cost, or Receipt is added.
            </p>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-2">
          {productionId && (
            <button onClick={() => { onClose(); onOpenPoPanel(line); }} className="min-h-8 rounded-md border border-[#e1d7ff] bg-[#fbf8ff] px-3 text-[12px] font-medium text-[#7c3aed]">
              Multi-line PO
            </button>
          )}
          <CostLineAddButton lineType="PO" onClick={() => setAddingType("PO")} />
          <CostLineAddButton lineType="BILL" onClick={() => setAddingType("BILL")} />
          <CostLineAddButton lineType="PENDING_RECEIPT" onClick={() => setAddingType("PENDING_RECEIPT")} />
          <CostLineAddButton lineType="RECEIPT" onClick={() => setAddingType("RECEIPT")} />
          <CostLineAddButton lineType="IN_HOUSE" onClick={() => setAddingType("IN_HOUSE")} />
        </div>

        {addingType && (
          <CostLinePanelForm
            lineId={line.id}
            lineType={addingType}
            onCancel={() => setAddingType(null)}
            onCreated={(revision) => { setAddingType(null); onRevision(revision); }}
            onError={onError}
          />
        )}

        <section className="rounded-lg border border-[#e6e6e1] bg-white">
          <div className="grid grid-cols-[86px_minmax(0,1fr)_88px_96px_28px] items-center border-b border-[#ededeb] bg-[#f7f7f3] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
            <span>Type</span>
            <span>Description</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Status</span>
            <span />
          </div>
          {line.subCosts.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">No cost lines yet.</div>
          ) : (
            line.subCosts.map((subCost, index) => (
              <CostLinePanelRow key={subCost.id} revision={revision} line={line} subCost={subCost} menuPlacement={index === line.subCosts.length - 1 ? "top" : "bottom"} onRevision={onRevision} onError={onError} />
            ))
          )}
        </section>
      </div>
    </SidePanel>
  );
}

function CostMetric({ label, value, muted = false, className = "" }: { label: string; value: string; muted?: boolean; className?: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${muted ? "text-gray-300" : className || "text-[#1a1a1f]"}`}>{value}</p>
    </div>
  );
}

function CostLinePanelForm({ lineId, lineType, onCancel, onCreated, onError }: {
  lineId: string;
  lineType: SubCostLineType;
  onCancel: () => void;
  onCreated: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
}) {
  const [type, setType] = useState<SubCostLineType>(lineType);
  const [description, setDescription] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");

  async function save() {
    try {
      const response = await api.post<SubCostMutationResponse>(`/api/budgets/lines/${lineId}/subcosts`, {
        lineType: type,
        description: description || `${lineTypeLabel(type)} cost line`,
        supplierName: supplierName || null,
        amount: Number(amount || 0),
      });
      if (response.revision) onCreated(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="rounded-lg border border-[#e6e6e1] bg-[#fbfbf8] p-3">
      <div className="grid gap-2 md:grid-cols-[86px_1fr]">
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">Type</p>
          <CostLineTypePill lineType={type} onChange={setType} />
        </div>
        <BudgetPanelInput label="Description" value={description} onChange={setDescription} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_120px]">
        <BudgetPanelInput label="Supplier" value={supplierName} onChange={setSupplierName} />
        <label className="text-xs text-gray-500">
          Amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" step="0.01" className="mt-1 h-10 w-full rounded-lg border border-[#e1e1dc] px-3 text-right text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="min-h-9 rounded-md px-3 text-xs text-gray-500 hover:bg-white">Cancel</button>
        <button onClick={save} className="min-h-9 rounded-md bg-[#1a1a1f] px-3 text-xs font-medium text-white">Add cost line</button>
      </div>
    </div>
  );
}

function CostLinePanelRow({ revision, line, subCost, menuPlacement, onRevision, onError }: { revision: BudgetRevision; line: BudgetLineItem; subCost: SubCost; menuPlacement: "top" | "bottom"; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const reference = subCost.lineType === "PO" ? subCost.poNumber : subCost.lineType === "BILL" ? subCost.invoiceNumber : null;
  const amountClass = subCost.lineType === "PO" ? "text-[#8b5cf6]" : subCost.lineType === "PENDING_RECEIPT" ? "text-[#d97706]" : subCost.lineType === "IN_HOUSE" ? "text-[#0f766e]" : subCost.lineType === "BILL" && !subCost.isPaid ? "text-[#3b82f6]" : "text-[#16a34a]";
  const [converting, setConverting] = useState(false);
  const [billAmount, setBillAmount] = useState(String(subCost.amount ?? 0));
  const [coverFromLineItemId, setCoverFromLineItemId] = useState("");
  const amountNumber = Number(billAmount || 0);
  const overage = Math.max(0, amountNumber - Number(subCost.amount ?? 0));
  const sourceLines = revision.sections.flatMap((section) => section.lineItems.map((item) => ({ ...item, sectionName: section.name })))
    .filter((item) => !item.parentId && item.id !== line.id && (item.variance + transferSummaryForLine(revision, item.id).adjustedBalance) > 0);

  async function patch(patchData: Partial<SubCost>) {
    try {
      const response = await api.patch<SubCostMutationResponse>(`/api/budgets/subcosts/${subCost.id}`, patchData);
      if (response.revision) onRevision(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${subCost.description}?`)) return;
    const result = await fetch(`/api/budgets/subcosts/${subCost.id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!result.ok) throw new Error("Delete failed");
    const response = await result.json() as { revision: BudgetRevision | null };
    if (response.revision) onRevision(response.revision);
  }

  async function convertToBill() {
    try {
      const response = await api.post<{ revision: BudgetRevision | null }>(`/api/budgets/subcosts/${subCost.id}/convert-to-bill`, {
        amount: amountNumber,
        coverFromLineItemId: coverFromLineItemId || null,
        reason: overage > 0 ? `Covered ${money(overage)} overage for ${subCost.poNumber ?? subCost.description}` : null,
      });
      if (response.revision) onRevision(response.revision);
      setConverting(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Bill conversion failed");
    }
  }

  return (
    <div className="border-b border-[#f0f0ed] last:border-b-0">
      <div className="grid min-h-[58px] grid-cols-[86px_minmax(0,1fr)_88px_96px_28px] items-center gap-2 px-3 py-2 text-xs">
        <CostLineTypePill lineType={subCost.lineType} menuPlacement={menuPlacement} onChange={(lineType) => lineType === "BILL" && subCost.lineType === "PO" ? setConverting(true) : patch({ lineType }).catch(console.error)} />
        <div className="min-w-0 leading-tight">
          {reference && <span className={`mr-2 font-semibold ${amountClass}`}>{reference}</span>}
          <EditableCell value={subCost.description} onSave={(value) => patch({ description: String(value) })} className="inline max-w-full text-[#1a1a1f]" />
          {subCost.supplierName && <p className="mt-0.5 truncate text-[11px] italic text-gray-400">{subCost.supplierName}</p>}
        </div>
        <div className="text-right"><EditableCell value={subCost.amount} onSave={(value) => patch({ amount: Number(value ?? 0) })} kind="money" className={amountClass} /></div>
        <div className="flex justify-end">
          {subCost.lineType === "PO" ? (
            <button onClick={() => setConverting(true)} className="min-h-7 rounded border border-[#cfe0fb] bg-[#f5f9ff] px-2 text-[11px] font-medium text-[#2563eb]">+ Bill</button>
          ) : (
            <CostLineLifecycleCell subCost={subCost} onPatch={patch} />
          )}
        </div>
        <button onClick={() => remove().catch((err: unknown) => onError(err instanceof Error ? err.message : "Delete failed"))} className="grid h-7 w-7 place-items-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600"><X size={13} /></button>
      </div>
      {converting && (
        <div className="mx-3 mb-3 rounded-lg border border-[#dce9fb] bg-[#f7fbff] p-3 text-xs">
          <div className="grid gap-3 md:grid-cols-[120px_1fr]">
            <BudgetPanelInput label="Bill amount" value={billAmount} onChange={setBillAmount} />
            {overage > 0 ? (
              <label className="text-xs text-gray-500">
                Cover {money(overage)} overage from
                <select value={coverFromLineItemId} onChange={(event) => setCoverFromLineItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d7e5f9] bg-white px-3 text-sm text-gray-900 outline-none">
                  <option value="">Simple overage</option>
                  {sourceLines.map((sourceLine) => {
                    const available = sourceLine.variance + transferSummaryForLine(revision, sourceLine.id).adjustedBalance;
                    return <option key={sourceLine.id} value={sourceLine.id}>{sourceLine.lineCode} {sourceLine.description} · {money(available)} available</option>;
                  })}
                </select>
              </label>
            ) : <p className="self-end pb-2 text-[11px] text-gray-500">No overage against the original PO amount.</p>}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setConverting(false)} className="min-h-8 rounded-md px-3 text-xs text-gray-500 hover:bg-white">Cancel</button>
            <button onClick={() => convertToBill().catch(console.error)} className="min-h-8 rounded-md bg-[#1a1a1f] px-3 text-xs font-medium text-white">Save as Bill</button>
          </div>
        </div>
      )}
    </div>
  );
}

type CostTrackerFilter = "all" | "open_po" | "unpaid_bills" | "paid_bills" | "missing_receipts" | "reconciled" | "over_budget" | "released";

function CostTrackerPanel({ revision, onClose, onOpenLine, onRevision, onError }: {
  revision: BudgetRevision;
  onClose: () => void;
  onOpenLine: (line: BudgetLineItem) => void;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
}) {
  const [filter, setFilter] = useState<CostTrackerFilter>("all");
  const lines = revision.sections.flatMap((section) => section.lineItems).filter((line) => !line.parentId);
  const costs = lines.flatMap((line) => line.subCosts.map((subCost) => ({ subCost, line })));
  const filtered = filter === "over_budget"
    ? lines.filter((line) => adjustedBalanceForLine(revision, line) < 0).map((line) => ({ line, subCost: null }))
    : filter === "released"
      ? lines.filter((line) => line.isClosed && adjustedBalanceForLine(revision, line) > 0).map((line) => ({ line, subCost: null }))
      : costs.filter(({ subCost }) => {
        if (filter === "all") return true;
        if (filter === "open_po") return subCost.lineType === "PO";
        if (filter === "unpaid_bills") return subCost.lineType === "BILL" && !subCost.isPaid;
        if (filter === "paid_bills") return subCost.lineType === "BILL" && subCost.isPaid;
        if (filter === "missing_receipts") return subCost.lineType === "PENDING_RECEIPT" || (subCost.isPaid && !subCost.proofOfPayment);
        if (filter === "reconciled") return Boolean(subCost.freeAgentTransactionId);
        return true;
      });
  const totals = {
    openPo: costs.filter(({ subCost }) => subCost.lineType === "PO").length,
    unpaidBills: costs.filter(({ subCost }) => subCost.lineType === "BILL" && !subCost.isPaid).length,
    missingReceipts: costs.filter(({ subCost }) => subCost.lineType === "PENDING_RECEIPT" || (subCost.isPaid && !subCost.proofOfPayment)).length,
  };

  return (
    <SidePanel title="Cost tracker" onClose={onClose} width="720px">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <CostMetric label="Open POs" value={String(totals.openPo)} className="text-[#8b5cf6]" />
          <CostMetric label="Bills unpaid" value={String(totals.unpaidBills)} className="text-[#3b82f6]" />
          <CostMetric label="Receipts missing" value={String(totals.missingReceipts)} className="text-[#d97706]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All costs"],
            ["open_po", "Open POs"],
            ["unpaid_bills", "Bills unpaid"],
            ["paid_bills", "Bills paid"],
            ["missing_receipts", "Receipt missing"],
            ["reconciled", "Reconciled"],
            ["over_budget", "Over-budget lines"],
            ["released", "Released margin"],
          ] as Array<[CostTrackerFilter, string]>).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`min-h-8 rounded-md border px-3 text-[12px] ${filter === key ? "border-[#13a18d] bg-[#e9fbf8] text-[#166f64]" : "border-[#e6e6e1] bg-white text-gray-500 hover:bg-[#fbfbf8]"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-[#e6e6e1] bg-white">
          <div className="grid grid-cols-[92px_1fr_110px_112px] border-b border-[#ededeb] bg-[#f7f7f3] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">
            <span>Stage</span>
            <span>Line / cost</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Balance</span>
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-gray-400">Nothing in this view.</div>
          ) : (
            filtered.map(({ line, subCost }) => (
              <div key={subCost?.id ?? `${filter}-${line.id}`} className="grid grid-cols-[92px_1fr_110px_112px] items-center gap-2 border-b border-[#f0f0ed] px-3 py-2 text-xs last:border-b-0">
                <div>{subCost ? <CostLineTypePill lineType={subCost.lineType} onChange={(lineType) => {
                  api.patch<SubCostMutationResponse>(`/api/budgets/subcosts/${subCost.id}`, { lineType })
                    .then((response) => response.revision && onRevision(response.revision))
                    .catch((err: unknown) => onError(err instanceof Error ? err.message : "Save failed"));
                }} /> : <span className="rounded border border-[#e6e6e1] px-2 py-1 text-[10px] font-medium text-gray-500">{balanceLabel(line, adjustedBalanceForLine(revision, line))}</span>}</div>
                <button onClick={() => onOpenLine(line)} className="min-w-0 text-left hover:underline">
                  <span className="font-medium text-[#1a1a1f]">{line.lineCode} {line.description}</span>
                  {subCost && <span className="ml-2 text-gray-400">{subCost.description}</span>}
                  {subCost?.supplierName && <p className="mt-0.5 truncate text-[11px] italic text-gray-400">{subCost.supplierName}</p>}
                </button>
                <span className="text-right tabular-nums text-[#1a1a1f]">{subCost ? money(subCost.amount) : "—"}</span>
                <span className={`text-right tabular-nums ${balanceClass(line, adjustedBalanceForLine(revision, line))}`}>{money(adjustedBalanceForLine(revision, line))}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </SidePanel>
  );
}

function BudgetPoPanel({ productionId, initialLine, onClose, onCreated }: { productionId: string; initialLine: BudgetLineItem; onClose: () => void; onCreated: (revision?: BudgetRevision | null) => void }) {
  const { refreshDrafts, maximizeDraft } = useDrafts();
  const [context, setContext] = useState<PurchaseOrderContext | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [comments, setComments] = useState("");
  const [blackbookEntryId, setBlackbookEntryId] = useState<string | null>(null);
  const [optionCandidateId, setOptionCandidateId] = useState("");
  const [query, setQuery] = useState("");
  const [blackbookResults, setBlackbookResults] = useState<Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({ [initialLine.id]: String(initialLine.estimatedTotal ?? 0) });
  const [saving, setSaving] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [createdRevision, setCreatedRevision] = useState<BudgetRevision | null | undefined>(null);
  const [createdPoNumber, setCreatedPoNumber] = useState("");

  useEffect(() => {
    api.get<PurchaseOrderContext>(`/api/budgets/production/${productionId}/purchase-order-context`)
      .then((nextContext) => {
        setContext(nextContext);
        setAllocations((current) => current[initialLine.id] !== undefined ? current : { ...current, [initialLine.id]: String(initialLine.estimatedTotal ?? 0) });
      })
      .catch(console.error);
  }, [productionId, initialLine.id, initialLine.estimatedTotal]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setBlackbookResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      api.get<Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>>(`/api/options/blackbook?${new URLSearchParams({ q: query.trim(), limit: "8" }).toString()}`)
        .then(setBlackbookResults)
        .catch(() => setBlackbookResults([]));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  function selectCandidate(candidateId: string) {
    setOptionCandidateId(candidateId);
    const candidate = context?.optionCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setSupplierName(candidate.blackbookEntry?.displayName ?? candidate.name);
    setSupplierEmail(candidate.contactEmail ?? candidate.blackbookEntry?.email ?? "");
    setSupplierPhone(candidate.contactPhone ?? candidate.blackbookEntry?.phone ?? "");
    setBlackbookEntryId(candidate.blackbookEntryId ?? null);
  }

  function selectedAllocations() {
    return Object.entries(allocations)
      .map(([lineItemId, amount]) => ({ lineItemId, amount: Number(amount || 0) }))
      .filter((allocation) => allocation.amount > 0);
  }

  async function save() {
    setSaving(true);
    try {
      const created = await api.post<PurchaseOrderCreateResponse>(`/api/budgets/production/${productionId}/purchase-orders`, {
        supplierName,
        supplierEmail: supplierEmail || null,
        supplierPhone: supplierPhone || null,
        blackbookEntryId,
        optionCandidateId: optionCandidateId || null,
        notes: comments.trim() || null,
        allocations: selectedAllocations(),
      });
      if (created.sendFlowError) window.alert(`PO created, but follow-up draft failed: ${created.sendFlowError}`);
      const result = created.sendFlow ?? await api.post<PurchaseOrderSendFlowResponse>(`/api/budgets/purchase-orders/${created.id}/send-flow`, {
        supplierEmail: supplierEmail || null,
        requireOnboarding: !blackbookEntryId,
      });
      if (result.mode === "onboarding") {
        setOnboardingUrl(result.onboardingUrl);
        setCreatedRevision(created.revision ?? null);
        setCreatedPoNumber(created.poNumber);
        await navigator.clipboard?.writeText(result.onboardingUrl).catch(() => undefined);
        await refreshDrafts();
        if (result.draft?.id) maximizeDraft(result.draft.id);
        return;
      }
      await refreshDrafts();
      if (result.draft?.id) maximizeDraft(result.draft.id);
      onCreated(created.revision ?? null);
    } finally {
      setSaving(false);
    }
  }

  const allocationTotal = selectedAllocations().reduce((sum, allocation) => sum + allocation.amount, 0);

  return (
    <SidePanel title="Create multi-line PO" onClose={onClose} width="760px">
      {!context ? (
        <div className="p-6 text-center text-sm text-gray-400">Loading PO context...</div>
      ) : onboardingUrl ? (
        <div className="space-y-4">
          <section className="rounded-lg border border-[#caeee9] bg-[#e9fbf8] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#166f64]">Supplier onboarding link</p>
            <h3 className="mt-2 text-sm font-semibold text-[#1a1a1f]">{createdPoNumber} is ready for supplier onboarding</h3>
            <p className="mt-2 text-xs leading-5 text-[#166f64]">Send this branded link to the supplier. When they submit their details, their Blackbook profile is updated and a PO email draft is prepared with the PDF attached.</p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-[#b9e8e1] bg-white p-2">
              <input readOnly value={onboardingUrl} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-gray-900 outline-none" />
              <button onClick={() => navigator.clipboard?.writeText(onboardingUrl).catch(console.error)} className="min-h-8 rounded-md bg-[#1a1a1f] px-3 text-xs font-medium text-white">Copy</button>
            </div>
          </section>
          <div className="flex justify-end gap-2">
            <button onClick={() => onCreated(createdRevision ?? null)} className="min-h-10 rounded-lg bg-[#1a1a1f] px-4 text-sm font-medium text-white">Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <section className="rounded-lg border border-[#e6e6e1] bg-[#fbfbf8] p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Supplier</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">From job options
                <select value={optionCandidateId} onChange={(event) => selectCandidate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e1e1dc] bg-white px-3 text-sm text-gray-900">
                  <option value="">No option candidate</option>
                  {context.optionCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.group.name} · {candidate.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Search Blackbook
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier..." className="mt-1 h-10 w-full rounded-lg border border-[#e1e1dc] px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
              </label>
            </div>
            {blackbookResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-[#e6e6e1] bg-white">
                {blackbookResults.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setBlackbookEntryId(entry.id);
                      setSupplierName(entry.displayName);
                      setSupplierEmail(entry.email ?? "");
                      setSupplierPhone(entry.phone ?? "");
                      setBlackbookResults([]);
                      setQuery(entry.displayName);
                    }}
                    className="block w-full border-b border-[#f0f0ed] px-3 py-2 text-left text-xs hover:bg-[#fbfbf8] last:border-b-0"
                  >
                    <span className="font-medium text-gray-900">{entry.displayName}</span>
                    <span className="ml-2 text-gray-400">{entry.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <BudgetPanelInput label="Supplier name" value={supplierName} onChange={setSupplierName} />
              <BudgetPanelInput label="Email" value={supplierEmail} onChange={setSupplierEmail} />
              <BudgetPanelInput label="Phone" value={supplierPhone} onChange={setSupplierPhone} />
            </div>
            <div className="mt-3">
              <BudgetPanelTextarea label="PO comments" value={comments} onChange={setComments} placeholder="Terms, delivery notes, call-off details, or anything the supplier needs on this PO." />
            </div>
          </section>

          <section className="rounded-lg border border-[#e6e6e1]">
            <div className="flex items-center justify-between border-b border-[#ededeb] px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Budget allocations</h4>
              <span className="text-xs font-semibold tabular-nums text-gray-900">Total {money(allocationTotal)}</span>
            </div>
            <div className="max-h-[430px] overflow-auto">
              {context.lines.map((line) => (
                <div key={line.id} className="grid grid-cols-[1fr_128px] items-center gap-3 border-b border-[#f0f0ed] px-3 py-2 text-xs last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{line.lineCode} {line.description}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{line.section.code} {line.section.name} · estimate {money(line.estimatedTotal)}</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={allocations[line.id] ?? ""}
                    onChange={(event) => setAllocations((current) => ({ ...current, [line.id]: event.target.value }))}
                    placeholder="£"
                    className="h-9 rounded-lg border border-[#e1e1dc] px-2 text-right text-sm tabular-nums text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25"
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-lg bg-[#e9fbf8] px-3 py-2 text-xs leading-5 text-[#166f64]">
            If the supplier is selected from Blackbook, this creates an email draft with the PO attached. If the supplier is manually entered, this creates a branded onboarding link first.
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="min-h-10 rounded-lg px-4 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button onClick={() => save().catch((err: unknown) => window.alert(err instanceof Error ? err.message : "Failed to create PO"))} disabled={saving || !supplierName.trim() || !supplierEmail.trim() || selectedAllocations().length === 0} className="min-h-10 rounded-lg bg-[#1a1a1f] px-4 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Creating..." : blackbookEntryId ? "Create PO draft" : "Create onboarding link"}
            </button>
          </div>
        </div>
      )}
    </SidePanel>
  );
}

function BudgetPanelInput({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="text-xs text-gray-500">
      {label}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e1e1dc] px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
    </label>
  );
}

function BudgetPanelTextarea({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="text-xs text-gray-500">
      {label}
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-[#e1e1dc] px-3 py-2 text-sm leading-5 text-gray-900 outline-none focus:ring-2 focus:ring-[#13a18d]/25" />
    </label>
  );
}

function CoverPanel({ budget, onClose, onSave }: { budget: Budget; onClose: () => void; onSave: (patch: Partial<Budget>) => Promise<void> }) {
  const fields: Array<[keyof Budget, string, "input" | "textarea"]> = [
    ["jobName", "Job Name / Ref", "input"],
    ["jobLocation", "Location", "input"],
    ["shotCount", "Shot Count", "input"],
    ["prepTravelDate", "Prep / Travel Date", "input"],
    ["shootDates", "Shoot Dates", "input"],
    ["photographerDirector", "Photographer / Director", "input"],
    ["accountingContact", "Accounting Contact", "input"],
    ["comments", "Comments (shown on PDF)", "textarea"],
    ["caveats", "Included / Not included", "textarea"],
    ["usages", "Usages", "textarea"],
  ];
  return (
    <SidePanel title="Cover page" onClose={onClose} width="360px">
      <div className="space-y-4">
        {fields.map(([key, label, kind]) => (
          <label key={String(key)} className="block text-[13px] font-medium text-gray-600">
            {label}
            {kind === "textarea" ? (
              <textarea defaultValue={String(budget[key] ?? "")} onBlur={(event) => onSave({ [key]: event.target.value } as Partial<Budget>).catch(console.error)} className="mt-1 min-h-20 w-full rounded border border-[#e8e8e4] p-2 text-sm text-[#1a1a1f]" />
            ) : (
              <input defaultValue={String(budget[key] ?? "")} onBlur={(event) => onSave({ [key]: event.target.value } as Partial<Budget>).catch(console.error)} className="mt-1 h-10 w-full rounded border border-[#e8e8e4] px-2 text-sm text-[#1a1a1f]" />
            )}
          </label>
        ))}
      </div>
    </SidePanel>
  );
}

function AdvancesPanel({ budget, totals, onClose, onChanged }: { budget: Budget; totals: BudgetRevision["totals"]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ label: "75% Advance", calculationType: "PERCENT_OF_TOTAL" as AdvanceCalcType, percent: "75", amount: "", dueDate: "", notes: "" });
  const preview = form.calculationType === "FIXED_AMOUNT"
    ? Number(form.amount || 0)
    : (form.calculationType === "PERCENT_OF_PRODUCTION" ? totals.subtotal : totals.grandTotal) * (Number(form.percent || 0) / 100);

  async function addAdvance() {
    await api.post(`/api/budgets/${budget.id}/advances`, {
      label: form.label,
      calculationType: form.calculationType,
      percent: form.calculationType === "FIXED_AMOUNT" ? null : Number(form.percent || 0),
      amount: form.calculationType === "FIXED_AMOUNT" ? Number(form.amount || 0) : null,
      dueDate: form.dueDate || null,
      notes: form.notes || null,
    });
    setFormOpen(false);
    await onChanged();
  }

  const totalAdvances = budget.advanceInvoices.reduce((sum, advance) => sum + (totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? advance.calculatedAmount ?? 0), 0);

  return (
    <SidePanel title="Advance Invoices" onClose={onClose} width="320px">
      {budget.advanceInvoices.length === 0 && !formOpen && (
        <div className="rounded-md border border-dashed border-[#e8e8e4] p-4 text-center text-sm text-gray-500">
          <p>No advance invoices yet.</p>
          <button onClick={() => setFormOpen(true)} className="mt-3 min-h-10 rounded bg-[#1a1a1f] px-3 text-xs text-white">+ Add advance invoice</button>
        </div>
      )}
      <div className="space-y-3">
        {budget.advanceInvoices.map((advance) => (
          <AdvanceRow key={advance.id} advance={advance} calculated={totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? advance.calculatedAmount ?? 0} onChanged={onChanged} />
        ))}
      </div>
      {!formOpen && budget.advanceInvoices.length > 0 && <button onClick={() => setFormOpen(true)} className="mt-4 min-h-10 text-xs font-medium text-[#1a1a1f]">+ Add advance invoice</button>}
      {formOpen && (
        <div className="mt-4 space-y-3 border-t border-[#e8e8e4] pt-4 text-xs">
          <label className="block">Label<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="mt-1 h-9 w-full rounded border border-[#e8e8e4] px-2" /></label>
          <label className="block">Type<select value={form.calculationType} onChange={(event) => setForm({ ...form, calculationType: event.target.value as AdvanceCalcType })} className="mt-1 h-9 w-full rounded border border-[#e8e8e4] px-2">
            <option value="PERCENT_OF_TOTAL">% of Grand Total</option>
            <option value="PERCENT_OF_PRODUCTION">% of Subtotal</option>
            <option value="FIXED_AMOUNT">Fixed Amount</option>
          </select></label>
          <label className="block">Value<input value={form.calculationType === "FIXED_AMOUNT" ? form.amount : form.percent} onChange={(event) => form.calculationType === "FIXED_AMOUNT" ? setForm({ ...form, amount: event.target.value }) : setForm({ ...form, percent: event.target.value })} type="number" className="mt-1 h-9 w-full rounded border border-[#e8e8e4] px-2" /></label>
          <p className="text-gray-500">Calculated: <span className="font-semibold text-[#1a1a1f]">{money(preview)}</span></p>
          <label className="block">Due date<input value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} type="date" className="mt-1 h-9 w-full rounded border border-[#e8e8e4] px-2" /></label>
          <label className="block">Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-1 h-9 w-full rounded border border-[#e8e8e4] px-2" /></label>
          <div className="flex gap-2">
            <button onClick={addAdvance} className="min-h-10 rounded bg-[#1a1a1f] px-3 text-white">Add</button>
            <button onClick={() => setFormOpen(false)} className="min-h-10 px-3 text-gray-500">Cancel</button>
          </div>
        </div>
      )}
      <div className="mt-5 border-t border-[#e8e8e4] pt-3 text-right text-xs text-gray-500">Total advances: <span className="font-semibold text-[#1a1a1f]">{money(totalAdvances)}</span></div>
    </SidePanel>
  );
}

function AdvanceRow({ advance, calculated, onChanged }: { advance: AdvanceInvoice; calculated: number; onChanged: () => Promise<void> }) {
  async function togglePaid() {
    await api.patch(`/api/budgets/advances/${advance.id}`, { isPaid: !advance.isPaid, datePaid: !advance.isPaid ? new Date().toISOString() : null });
    await onChanged();
  }
  async function remove() {
    if (!window.confirm("Delete this advance?")) return;
    await api.delete(`/api/budgets/advances/${advance.id}`);
    await onChanged();
  }
  return (
    <div className="rounded-md border border-[#e8e8e4] bg-white p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium">{advance.label}</p>
        <button onClick={togglePaid} className={`rounded-full px-2 py-1 text-[10px] ${advance.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{advance.isPaid ? "PAID" : "UNPAID"}</button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-gray-500">{advance.calculationType.replace(/_/g, " ")} · {advance.percent ?? advance.amount ?? ""}</p>
        <p className="text-sm font-semibold tabular-nums">{money(calculated)}</p>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
        <span>Due: {advance.dueDate ? new Date(advance.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "not set"}</span>
        <button onClick={remove} className="text-red-600">Delete</button>
      </div>
    </div>
  );
}

function SidePanel({ title, children, onClose, width = "420px" }: { title: string; children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <aside className="fixed inset-y-0 right-0 z-[60] w-full overflow-y-auto overflow-x-visible border-l border-[#e8e8e4] bg-white p-5 shadow-xl md:w-auto" style={{ maxWidth: width }}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded hover:bg-gray-100"><X size={18} /></button>
      </div>
      {children}
    </aside>
  );
}
