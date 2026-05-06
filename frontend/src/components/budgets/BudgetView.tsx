import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  Download,
  History,
  Mail,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
  Check,
  ChevronDown,
  FileText,
  Info,
  Pencil,
} from "lucide-react";
import { api } from "../../lib/api";
import type {
  Budget,
  BudgetLineItem,
  BudgetRevision,
  BudgetRevisionStatus,
  BudgetRevisionSummary,
  CatalogSection,
  Production,
  OpportunityListItem,
  PurchaseOrder,
  PurchaseOrderStatus,
} from "../../lib/types";
import { formatCurrency } from "../../lib/types";

type Entity =
  | { type: "production"; id: string; data?: Production }
  | { type: "opportunity"; id: string; data?: OpportunityListItem };

type ViewMode = "internal" | "client";
type EditableLineField = "description" | "internalUnitCost" | "clientUnitCost" | "quantity" | "daysUnits" | "unitLabel";
type BudgetLineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };
type RemainingTone = "green" | "amber" | "red" | "muted";

const UNIT_LABELS = ["Days", "Units", "Drives", "Weeks", "Other"];

function revisionStatusLabel(status: BudgetRevisionStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function entityLabel(entity: Entity) {
  if (entity.type === "production") {
    return `${entity.data?.jobCode ?? ""} ${entity.data?.clientName ?? entity.data?.title ?? "Production"}`.trim();
  }
  return entity.data?.title ?? "Opportunity";
}

function formatPercent(value?: number) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function remainingColor(lineOrTotal: { remainingAccrual?: number; totalRemaining?: number; internalSubtotal?: number; totalAccrual?: number }): RemainingTone {
  const remaining = Number(lineOrTotal.remainingAccrual ?? lineOrTotal.totalRemaining ?? 0);
  const accrual = Number(lineOrTotal.internalSubtotal ?? lineOrTotal.totalAccrual ?? 0);
  if (remaining < 0) return "red";
  if (remaining === 0) return accrual > 0 ? "amber" : "muted";
  return "green";
}

function remainingTextClass(lineOrTotal: { remainingAccrual?: number; totalRemaining?: number; internalSubtotal?: number; totalAccrual?: number }) {
  const color = remainingColor(lineOrTotal);
  if (color === "green") return "text-emerald-700";
  if (color === "amber") return "text-amber-600";
  if (color === "red") return "text-red-600";
  return "text-gray-300";
}

function marginColor(value?: number): "green" | "red" | "tertiary" {
  const margin = Number(value ?? 0);
  if (margin > 0) return "green";
  if (margin < 0) return "red";
  return "tertiary";
}

function marginTextClass(value?: number) {
  const color = marginColor(value);
  if (color === "green") return "text-emerald-700";
  if (color === "red") return "text-red-600";
  return "text-gray-300";
}

function isZeroValue(value?: number) {
  return Math.abs(Number(value ?? 0)) < 0.005;
}

function zeroAwareTextClass(value?: number, nonZeroClass = "text-gray-800") {
  return isZeroValue(value) ? "text-gray-300" : nonZeroClass;
}

function nonZeroCurrency(value?: number) {
  return isZeroValue(value) ? "" : formatCurrency(value);
}

function nonZeroPercent(value?: number) {
  return Math.abs(Number(value ?? 0)) < 0.05 ? "" : formatPercent(value);
}

function remainingSectionCurrency(remaining?: number, accrual?: number) {
  if (isZeroValue(remaining) && isZeroValue(accrual)) return "";
  return formatCurrency(remaining);
}

async function closeLine(line: BudgetLineItem, onSave: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>, onRefresh: () => Promise<void>) {
  const hasOpenPos = line.purchaseOrders.some((po) => po.status === "OPEN");
  if (hasOpenPos) {
    window.alert("Close all Open POs before closing this line.");
    return;
  }
  const released = Number(line.internalSubtotal ?? 0) - Number(line.totalCommitted ?? 0);
  const ok = window.confirm(`Close this line item?\n\nAccrual held: ${formatCurrency(line.internalSubtotal)}\nTotal committed: ${formatCurrency(line.totalCommitted)}\nReleased to margin: ${formatCurrency(released)}`);
  if (!ok) return;
  await onSave(line, { isClosed: true });
  await onRefresh();
}

export default function BudgetView({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [revision, setRevision] = useState<BudgetRevision | null>(null);
  const [revisions, setRevisions] = useState<BudgetRevisionSummary[]>([]);
  const [mode, setMode] = useState<ViewMode>("internal");
  const [selectedLine, setSelectedLine] = useState<BudgetLineItem | null>(null);
  const [catalogOpen, setCatalogOpen] = useState<{ sectionCode: string } | null>(null);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const loaded = entity.type === "production"
      ? await api.get<Budget>(`/api/budgets/production/${entity.id}`)
      : await api.get<Budget>(`/api/budgets/opportunity/${entity.id}`);
    setBudget(loaded);
    if (loaded.currentRevision) setRevision(loaded.currentRevision);
    if (loaded.id) {
      const summaries = await api.get<BudgetRevisionSummary[]>(`/api/budgets/${loaded.id}/revisions`);
      setRevisions(summaries);
    }
  }, [entity.id, entity.type]);

  useEffect(() => { load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load budget")); }, [load]);

  const totals = revision?.totals;
  const budgetMode = totals?.mode ?? (entity.type === "production" ? "production" : "bidding");
  const isProduction = budgetMode === "production";

  async function reloadRevision(revisionId = revision?.id) {
    if (!revisionId) return;
    const loaded = await api.get<BudgetRevision>(`/api/budgets/revisions/${revisionId}`);
    setRevision(loaded);
    if (budget?.id) setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${budget.id}/revisions`));
  }

  async function addManualLine(sectionId: string) {
    if (!revision) return;
    const line = await api.post<BudgetLineItem>(`/api/budgets/revisions/${revision.id}/sections/${sectionId}/lines`, {
      description: "New line item",
      clientUnitCost: 0,
      internalUnitCost: 0,
    });
    await reloadRevision();
    setSelectedLine(line);
  }

  function showSaveError() {
    setToast("Failed to save — please try again");
    window.setTimeout(() => setToast(""), 3000);
  }

  async function saveLine(line: BudgetLineItem, patch: Partial<BudgetLineItem>) {
    const res = await api.patch<BudgetLineMutationResponse>(`/api/budgets/lines/${line.id}`, patch);
    if (res.revision) setRevision(res.revision);
    setSelectedLine((current) => current?.id === line.id ? res.line : current);
  }

  async function duplicateLine(line: BudgetLineItem) {
    const res = await api.post<BudgetLineMutationResponse>(`/api/budgets/lines/${line.id}/duplicate`, {});
    if (res.revision) setRevision(res.revision);
    else await reloadRevision();
    setSelectedLine(res.line);
  }

  async function deleteLine(line: BudgetLineItem) {
    if (!window.confirm(`Delete ${line.description}?`)) return;
    await api.delete(`/api/budgets/lines/${line.id}`);
    setSelectedLine(null);
    await reloadRevision();
  }

  async function createRevision() {
    if (!budget) return;
    const created = await api.post<BudgetRevision>(`/api/budgets/${budget.id}/revisions`, {});
    setRevision(created);
    await load();
  }

  async function updateProductionFee(productionFeePercent: number) {
    if (!revision) return;
    const updated = await api.patch<BudgetRevision>(`/api/budgets/revisions/${revision.id}`, { productionFeePercent });
    setRevision(updated);
    if (budget?.id) setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${budget.id}/revisions`));
  }

  async function exportPdf(exportMode: "client" | "internal") {
    if (!revision) return;
    await api.post(`/api/budgets/revisions/${revision.id}/export-pdf`, { mode: exportMode });
    await reloadRevision();
  }

  function toggleSelected(lineId: string) {
    setSelectedIds((ids) => ids.includes(lineId) ? ids.filter((id) => id !== lineId) : [...ids, lineId]);
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selectedIds.length} selected items?`)) return;
    for (const id of selectedIds) await api.delete(`/api/budgets/lines/${id}`);
    setSelectedIds([]);
    await reloadRevision();
  }

  if (!revision || !budget) {
    return (
      <div className="grid h-full place-items-center bg-white text-sm text-gray-500">
        {error || "Loading budget…"}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-white text-gray-900">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4">
        <button onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ChevronLeft size={18} /> {entityLabel(entity)}
        </button>
        <select
          value={revision.id}
          onChange={(e) => reloadRevision(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-center text-sm md:max-w-[200px]"
        >
          {revisions.map((item) => (
            <option key={item.id} value={item.id}>{item.label} — {revisionStatusLabel(item.status)}</option>
          ))}
        </select>
        <div className="hidden rounded-lg border border-gray-200 p-1 sm:flex">
          <button onClick={() => setMode("internal")} className={`min-h-9 rounded-md px-3 text-sm ${mode === "internal" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Internal</button>
          <button onClick={() => setMode("client")} className={`min-h-9 rounded-md px-3 text-sm ${mode === "client" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Client</button>
        </div>
        <button onClick={() => exportPdf(mode)} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-gray-900 text-white">
          <Download size={17} />
        </button>
      </div>

      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-gray-100 bg-gray-50 px-4 text-sm">
        <button onClick={() => setSelectedIds([])} className="min-h-10 px-2 text-gray-600">Unselect all</button>
        <button onClick={() => exportPdf("client")} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><Printer size={16} /><span className="hidden sm:inline">Print estimate</span></button>
        <button className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><Mail size={16} /><span className="hidden sm:inline">Email estimate</span></button>
        <button onClick={() => setRevisionsOpen(true)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><History size={16} /><span className="hidden sm:inline">Revision history</span></button>
        <div className="flex-1" />
        <button
          onClick={() => {
            const firstSection = revision.sections[0];
            if (firstSection) addManualLine(firstSection.id);
          }}
          className="flex h-9 min-h-9 items-center gap-1 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
        >
          <Plus size={16} /> Add line
        </button>
      </div>

      <div className="hidden h-8 shrink-0 border-b border-gray-100 px-4 md:block">
        <div className="mx-auto flex max-w-md items-center justify-between text-xs text-gray-500">
          <span className="font-semibold text-gray-900">Estimate</span><span className="h-px flex-1 bg-gray-200 mx-3" />
          <span className={isProduction ? "font-semibold text-gray-900" : ""}>Production</span><span className="h-px flex-1 bg-gray-200 mx-3" />
          <span>Invoice</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto pb-32 md:pb-24">
          <BudgetTable
            revision={revision}
            mode={mode}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onEdit={setSelectedLine}
            onAddLine={addManualLine}
            onBrowseCatalog={(code) => setCatalogOpen({ sectionCode: code })}
            onDuplicate={duplicateLine}
            onDelete={deleteLine}
            expandedLineId={selectedLine?.id ?? null}
            onSaveCell={saveLine}
            onSaveError={showSaveError}
            onCloseEdit={() => setSelectedLine(null)}
            onRefresh={() => reloadRevision()}
          />
        </div>
        <InfoPanel entity={entity} revision={revision} revisions={revisions} currentId={revision.id} onNewRevision={createRevision} onOpenRevision={(id) => reloadRevision(id)} onProductionFeeChange={updateProductionFee} />
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-28 left-4 right-4 z-30 flex min-h-12 items-center gap-3 rounded-xl bg-gray-900 px-3 text-sm text-white shadow-lg md:left-20 md:right-80">
          <span>{selectedIds.length} items selected</span>
          <div className="flex-1" />
          <button onClick={deleteSelected} className="min-h-10 rounded-lg bg-red-600 px-3">Delete selected</button>
        </div>
      )}

      <BudgetBottomBar revision={revision} isProduction={isProduction} />

      {selectedLine && (
        <LineEditor
          line={selectedLine}
          mode={mode}
          onClose={() => setSelectedLine(null)}
          onSave={saveLine}
          onDuplicate={duplicateLine}
          onDelete={deleteLine}
        />
      )}

      {toast && (
        <div className="fixed right-4 top-4 z-[60] rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {catalogOpen && (
        <CatalogPanel
          revisionId={revision.id}
          sectionCode={catalogOpen.sectionCode}
          onClose={() => setCatalogOpen(null)}
          onInserted={() => reloadRevision()}
        />
      )}

      {revisionsOpen && (
        <RevisionSheet
          revisions={revisions}
          currentId={revision.id}
          onClose={() => setRevisionsOpen(false)}
          onNew={createRevision}
          onOpen={(id) => { setRevisionsOpen(false); reloadRevision(id); }}
        />
      )}
    </div>
  );
}

function BudgetTable({ revision, mode, selectedIds, onToggleSelected, onEdit, onAddLine, onBrowseCatalog, onDuplicate, onDelete, expandedLineId, onSaveCell, onSaveError, onCloseEdit, onRefresh }: {
  revision: BudgetRevision;
  mode: ViewMode;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onEdit: (line: BudgetLineItem) => void;
  onAddLine: (sectionId: string) => void;
  onBrowseCatalog: (sectionCode: string) => void;
  onDuplicate: (line: BudgetLineItem) => void;
  onDelete: (line: BudgetLineItem) => void;
  expandedLineId: string | null;
  onSaveCell: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onSaveError: () => void;
  onCloseEdit: () => void;
  onRefresh: () => Promise<void>;
}) {
  const productionMode = revision.totals.mode === "production";
  const [openPoLineId, setOpenPoLineId] = useState<string | null>(null);
  const internalGrid = productionMode
    ? "grid-cols-[32px_minmax(200px,1fr)_80px_90px_80px_70px_70px_70px_80px_80px_52px]"
    : "grid-cols-[32px_minmax(200px,1fr)_80px_80px_60px_60px_70px_70px_80px_90px_80px_80px_52px]";
  const clientGrid = "grid-cols-[minmax(200px,1fr)_80px_60px_60px_70px_90px]";
  const headers = mode === "internal"
    ? (productionMode
      ? [
        { label: "", tier: 3 }, { label: "Description", tier: 1 }, { label: "Rate", tier: 2 },
        { label: "Total", tier: 1 }, { label: "Accrual", tier: 3 }, { label: "POs", tier: 3 },
        { label: "Inv.", tier: 3 }, { label: "Paid", tier: 3 }, { label: "Left", tier: 1 },
        { label: "Margin", tier: 1 }, { label: "", tier: 3 },
      ]
      : [
        { label: "", tier: 3 }, { label: "Description", tier: 1 }, { label: "Int. Rate", tier: 3 },
        { label: "Rate", tier: 2 }, { label: "Qty", tier: 3 }, { label: "Days", tier: 3 },
        { label: "Unit", tier: 3 }, { label: "Markup", tier: 3 }, { label: "Int. Total", tier: 3 },
        { label: "Total", tier: 1 }, { label: "Margin", tier: 1 }, { label: "Margin %", tier: 1 },
        { label: "", tier: 3 },
      ])
    : [
      { label: "Description", tier: 1 }, { label: "Rate", tier: 2 }, { label: "Qty", tier: 3 },
      { label: "Days", tier: 3 }, { label: "Unit", tier: 3 }, { label: "Total", tier: 1 },
    ];

  return (
    <div className="min-w-full">
      <div className={`sticky top-0 z-10 hidden h-8 border-b border-gray-200 bg-gray-50 uppercase tracking-[0.5px] md:grid ${mode === "internal" ? internalGrid : clientGrid}`}>
        {headers.map((h, index) => (
          <div
            key={`${h.label}-${index}`}
            className={`whitespace-nowrap px-3 py-2 text-right ${index === 0 || index === 1 && mode === "internal" ? "text-left" : ""} ${h.tier === 1 ? "text-[11px] font-medium text-gray-500" : h.tier === 2 ? "text-[11px] font-normal text-gray-500" : "text-[10px] font-normal text-gray-300"}`}
          >
            {h.label}
          </div>
        ))}
      </div>
      {revision.sections.map((section) => {
        const sectionTotal = revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
        return (
          <div key={section.id} className="pt-2">
            <div className="flex h-10 items-center gap-3 bg-[#1a1a1f] px-4 text-white">
              <span className="rounded bg-[#2c2c2a] px-1.5 py-0.5 text-[11px] font-medium text-white">{section.code}</span>
              <span className="text-[13px] font-medium">{section.name}</span>
              <span className="ml-auto text-[13px] font-medium tabular-nums text-white">{formatCurrency(sectionTotal?.clientTotal)}</span>
              <button onClick={() => onBrowseCatalog(section.code)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-400 hover:text-white"><MoreHorizontal size={16} /></button>
            </div>
            {section.lineItems.length === 0 ? (
              <div className="flex h-10 items-center bg-[#2c2c2a] px-5 text-left text-[13px] text-gray-400">
                <span>No line items — <button onClick={() => onBrowseCatalog(section.code)} className="text-gray-100">Browse catalog</button> or <button onClick={() => onAddLine(section.id)} className="text-gray-100">+ Add line</button></span>
              </div>
            ) : section.lineItems.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                mode={mode}
                checked={selectedIds.includes(line.id)}
                onCheck={() => onToggleSelected(line.id)}
                onEdit={() => onEdit(line)}
                onDuplicate={() => onDuplicate(line)}
                onDelete={() => onDelete(line)}
                expanded={expandedLineId === line.id}
                onSaveCell={onSaveCell}
                onSaveError={onSaveError}
                onCloseEdit={onCloseEdit}
                productionMode={productionMode}
                openPoPanel={openPoLineId === line.id}
                onTogglePoPanel={() => setOpenPoLineId(openPoLineId === line.id ? null : line.id)}
                onRefresh={onRefresh}
              />
            ))}
            {section.lineItems.length > 0 && (
              <div className={`hidden h-8 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 md:grid ${mode === "internal" ? internalGrid : clientGrid}`}>
                {mode === "internal" && productionMode ? (
                  <><div /><div className="py-2 pl-5 pr-3 text-[11px] italic text-gray-300">Section total</div><div /><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.clientTotal)}</div><div className="px-3 py-2 text-right text-xs font-medium italic tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.accrual)}</div><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.totalPOs)}</div><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.totalInvoiced)}</div><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.totalPaid)}</div><div className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${remainingTextClass({ totalRemaining: sectionTotal?.remaining, totalAccrual: sectionTotal?.accrual })}`}>{remainingSectionCurrency(sectionTotal?.remaining, sectionTotal?.accrual)}</div><div className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${marginTextClass(sectionTotal?.marginAmount)}`}>{nonZeroCurrency(sectionTotal?.marginAmount)}</div><div /></>
                ) : mode === "internal" ? (
                  <><div /><div className="py-2 pl-5 pr-3 text-[11px] italic text-gray-300">Section total</div><div /><div /><div /><div /><div /><div /><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.internalTotal)}</div><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.clientTotal)}</div><div className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${marginTextClass(sectionTotal?.marginAmount)}`}>{nonZeroCurrency(sectionTotal?.marginAmount)}</div><div className={`px-3 py-2 text-right text-xs font-medium tabular-nums ${marginTextClass(sectionTotal?.marginAmount)}`}>{nonZeroPercent(sectionTotal?.marginPercent)}</div><div /></>
                ) : (
                  <><div className="py-2 pl-5 pr-3 text-[11px] italic text-gray-300">Section total</div><div /><div /><div /><div /><div className="px-3 py-2 text-right text-xs font-medium tabular-nums text-gray-800">{nonZeroCurrency(sectionTotal?.clientTotal)}</div></>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineRow({ line, mode, checked, onCheck, onEdit, onDuplicate, onDelete, expanded, onSaveCell, onSaveError, onCloseEdit, productionMode, openPoPanel, onTogglePoPanel, onRefresh }: {
  line: BudgetLineItem;
  mode: ViewMode;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  expanded: boolean;
  onSaveCell: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onSaveError: () => void;
  onCloseEdit: () => void;
  productionMode: boolean;
  openPoPanel: boolean;
  onTogglePoPanel: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const longPressRef = useRef<number | null>(null);

  async function saveCell(field: EditableLineField, value: string | number) {
    const patch: Partial<BudgetLineItem> = { [field]: value } as Partial<BudgetLineItem>;
    try {
      await onSaveCell(line, patch);
    } catch {
      onSaveError();
      throw new Error("save failed");
    }
  }

  function startLongPress() {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => setMobileActionsOpen(true), 550);
  }

  function cancelLongPress() {
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }

  return (
    <div className={`group relative border-b border-gray-100 hover:bg-gray-50 ${line.isClosed ? "bg-gray-50 text-gray-400" : ""} ${productionMode && line.isOverBudget ? "border-l-[3px] border-l-red-900" : productionMode && line.isOverAccrual ? "border-l-[3px] border-l-red-600" : productionMode && Number(line.accrualUsedPercent ?? 0) > 80 ? "border-l-[3px] border-l-amber-500" : ""}`}>
      <div
        className="flex min-h-12 items-center gap-3 px-4 md:hidden"
        onContextMenu={(e) => { e.preventDefault(); setMobileActionsOpen(true); }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
      >
        <div className="min-w-0 flex-1">
          <InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />
          {line.publicMemo && <p className="truncate text-xs italic text-gray-500">{line.publicMemo}</p>}
        </div>
        <button onClick={onEdit} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-400"><Pencil size={15} /></button>
        <p className={`text-sm font-semibold tabular-nums ${zeroAwareTextClass(line.clientSubtotal)}`}>{formatCurrency(line.clientSubtotal)}</p>
      </div>
      {mobileActionsOpen && (
        <div className="absolute right-3 top-10 z-30 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-lg md:hidden">
          <button onClick={() => { setMobileActionsOpen(false); onDuplicate(); }} className="flex min-h-11 w-36 items-center gap-2 px-3 text-gray-700"><Copy size={15} /> Duplicate</button>
          <button onClick={() => { setMobileActionsOpen(false); onDelete(); }} className="flex min-h-11 w-36 items-center gap-2 px-3 text-red-600"><Trash2 size={15} /> Delete</button>
        </div>
      )}
      <div className={`hidden h-10 items-center tabular-nums md:grid ${mode === "internal" ? productionMode ? "grid-cols-[32px_minmax(200px,1fr)_80px_90px_80px_70px_70px_70px_80px_80px_52px]" : "grid-cols-[32px_minmax(200px,1fr)_80px_80px_60px_60px_70px_70px_80px_90px_80px_80px_52px]" : "grid-cols-[minmax(200px,1fr)_80px_60px_60px_70px_90px]"}`}>
        {mode === "internal" ? (
          productionMode ? (
          <>
            <div className="px-2"><input type="checkbox" checked={checked} onChange={onCheck} className="opacity-0 group-hover:opacity-100" /></div>
            <div className="min-w-0 pl-5 pr-4 text-left">
              <InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} muted={line.isClosed} />
              {line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}
              {line.isClosed && <span className="text-[11px] text-gray-400">Closed</span>}
              {!line.isClosed && line.purchaseOrders.length > 0 && line.purchaseOrders.every((po) => po.status !== "OPEN") && <button onClick={() => closeLine(line, onSaveCell, onRefresh).catch(onSaveError)} className="text-[11px] text-indigo-600">All POs settled — close this line?</button>}
            </div>
            <InlineNumberCell line={line} field="clientUnitCost" value={line.clientUnitCost} onSave={saveCell} />
            <Cell strong color={isZeroValue(line.clientSubtotal) ? "tertiary" : undefined}>{formatCurrency(line.clientSubtotal)}</Cell>
            <InlineNumberCell line={line} field="internalUnitCost" value={line.internalUnitCost} displayValue={line.internalSubtotal} onSave={saveCell} muted italic small />
            <div className="px-3 text-right text-xs font-normal tabular-nums">
              {line.purchaseOrders.length > 0 ? (
                <span className="inline-flex items-center justify-end gap-1.5 text-gray-500">
                  {formatCurrency(line.totalPOs)}
                  <button onClick={onTogglePoPanel} className="grid h-[18px] min-h-[18px] w-[18px] min-w-[18px] place-items-center rounded-full bg-gray-900 text-[11px] leading-none text-white">{line.purchaseOrders.length}</button>
                </span>
              ) : (
                <span className="text-gray-300">{formatCurrency(0)}</span>
              )}
            </div>
            <Cell className="text-xs font-normal" color={isZeroValue(line.totalInvoiced) ? "tertiary" : "muted"}>{formatCurrency(line.totalInvoiced)}</Cell>
            <Cell className="text-xs font-normal" color={isZeroValue(line.totalPaid) ? "tertiary" : "muted"}>{formatCurrency(line.totalPaid)}</Cell>
            <Cell strong color={remainingColor({ remainingAccrual: line.remainingAccrual, internalSubtotal: line.internalSubtotal }) === "muted" ? "tertiary" : remainingColor({ remainingAccrual: line.remainingAccrual, internalSubtotal: line.internalSubtotal })}>{formatCurrency(line.remainingAccrual)}</Cell>
            <Cell strong color={marginColor(line.marginAmount)}>{formatCurrency(line.marginAmount)}</Cell>
            <div />
            <LineHoverActions onEdit={onEdit} onPo={onTogglePoPanel} onDuplicate={onDuplicate} onDelete={onDelete} />
          </>
          ) : (
          <>
            <div className="px-2"><input type="checkbox" checked={checked} onChange={onCheck} className="opacity-0 group-hover:opacity-100" /></div>
            <div className="min-w-0 pl-5 pr-4 text-left">
              <InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />
              {line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}
            </div>
            <InlineNumberCell line={line} field="internalUnitCost" value={line.internalUnitCost} onSave={saveCell} muted small />
            <InlineNumberCell line={line} field="clientUnitCost" value={line.clientUnitCost} onSave={saveCell} />
            <InlineNumberCell line={line} field="quantity" value={line.quantity} onSave={saveCell} plain />
            <InlineNumberCell line={line} field="daysUnits" value={line.daysUnits} onSave={saveCell} plain />
            <UnitDropdown value={line.unitLabel} onSave={(value) => saveCell("unitLabel", value)} />
            <Cell className="text-xs font-normal" color={isZeroValue(line.agencyMarkup) ? "tertiary" : "muted"}>{formatCurrency(line.agencyMarkup)}</Cell><Cell className="text-xs font-normal" color={isZeroValue(line.internalSubtotal) ? "tertiary" : "muted"}>{formatCurrency(line.internalSubtotal)}</Cell><Cell strong color={isZeroValue(line.clientSubtotal) ? "tertiary" : undefined}>{formatCurrency(line.clientSubtotal)}</Cell><Cell strong color={marginColor(line.marginAmount)}>{formatCurrency(line.marginAmount)}</Cell><Cell strong color={marginColor(line.marginAmount)}>{formatPercent(line.marginPercent)}</Cell>
            <div />
            <LineHoverActions onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
          </>
          )
        ) : (
          <>
            <div className="min-w-0 pl-5 pr-4 text-left"><InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />{line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}</div>
            <InlineNumberCell line={line} field="clientUnitCost" value={line.clientUnitCost} onSave={saveCell} strong color="blue" />
            <InlineNumberCell line={line} field="quantity" value={line.quantity} onSave={saveCell} plain />
            <InlineNumberCell line={line} field="daysUnits" value={line.daysUnits} onSave={saveCell} plain />
            <UnitDropdown value={line.unitLabel} onSave={(value) => saveCell("unitLabel", value)} />
            <Cell strong color={isZeroValue(line.clientSubtotal) ? "tertiary" : undefined}>{formatCurrency(line.clientSubtotal)}</Cell>
            <LineHoverActions onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
          </>
        )}
      </div>
      {expanded && (
        <InlineExpandedEditor
          line={line}
          mode={mode}
          productionMode={productionMode}
          onClose={onCloseEdit}
          onSave={onSaveCell}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      )}
      {openPoPanel && <PoPanel line={line} onChanged={onRefresh} />}
    </div>
  );
}

function LineHoverActions({ onEdit, onPo, onDuplicate, onDelete }: { onEdit: () => void; onPo?: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="absolute right-2 top-1 hidden gap-1 rounded-lg bg-white/90 p-1 shadow-sm group-hover:flex">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
        title="Edit"
      >
        <Pencil size={15} />
      </button>
      {onPo && (
        <button
          onClick={(e) => { e.stopPropagation(); onPo(); }}
          className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
          title="Purchase orders"
        >
          <FileText size={18} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
        className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
        title="Duplicate"
      >
        <Copy size={15} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="grid h-8 w-8 place-items-center rounded-md text-red-500 hover:bg-red-50"
        title="Delete"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function InlineExpandedEditor({ line, mode, productionMode, onClose, onSave, onDuplicate, onDelete }: {
  line: BudgetLineItem;
  mode: ViewMode;
  productionMode: boolean;
  onClose: () => void;
  onSave: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => void;
  onDelete: (line: BudgetLineItem) => void;
}) {
  const [form, setForm] = useState(line);

  useEffect(() => setForm(line), [line]);

  async function save() {
    await onSave(line, form);
    onClose();
  }

  const rateLabel = productionMode ? "Accrual rate" : mode === "client" ? "Client rate" : "Internal rate";
  const rateValue = mode === "client" && !productionMode ? form.clientUnitCost : form.internalUnitCost;
  const updateRate = (value: string) => {
    const next = Number(value);
    if (mode === "client" && !productionMode) setForm({ ...form, clientUnitCost: next });
    else setForm({ ...form, internalUnitCost: next });
  };

  return (
    <div className="hidden border-y border-l-4 border-amber-500 bg-white px-4 py-3 md:block">
      <div className="grid gap-[10px]">
        <div className="grid items-end gap-2 md:grid-cols-[minmax(220px,1fr)_100px]">
          <Field label="Name" value={form.description} onChange={(description) => setForm({ ...form, description })} />
          <Field label="Markup%" type="number" value={String(form.agencyMarkup)} onChange={(agencyMarkup) => setForm({ ...form, agencyMarkup: Number(agencyMarkup) })} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="max-w-20" label="Qty" type="number" value={String(form.quantity)} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />
          <Field className="max-w-20" label="Time" type="number" value={String(form.daysUnits)} onChange={(daysUnits) => setForm({ ...form, daysUnits: Number(daysUnits) })} />
          <label className="block max-w-[120px]"><span className="mb-1 block text-xs font-semibold text-gray-500">Unit</span><select value={form.unitLabel} onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px]">{UNIT_LABELS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <Field className="max-w-[120px]" label={rateLabel} type="number" value={String(rateValue)} onChange={updateRate} />
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_170px]">
          <Textarea label="Private memo" value={form.privateMemo ?? ""} onChange={(privateMemo) => setForm({ ...form, privateMemo })} />
          <div className="grid content-start gap-1.5 pt-4">
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })} /> Taxable</label>
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasPW} onChange={(e) => setForm({ ...form, hasPW: e.target.checked })} /> P&W (%)</label>
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasHealthSafety} onChange={(e) => setForm({ ...form, hasHealthSafety: e.target.checked })} /> Health & Safety</label>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Field label="Base hours" type="number" value={String(form.baseHours ?? 10)} onChange={(baseHours) => setForm({ ...form, baseHours: Number(baseHours) })} />
          <Field label="1.5x" type="number" value={String(form.overtime15x ?? 0)} onChange={(overtime15x) => setForm({ ...form, overtime15x: Number(overtime15x) })} />
          <Field label="2x" type="number" value={String(form.overtime2x ?? 0)} onChange={(overtime2x) => setForm({ ...form, overtime2x: Number(overtime2x) })} />
        </div>
        <Textarea label="Public memo" value={form.publicMemo ?? ""} onChange={(publicMemo) => setForm({ ...form, publicMemo })} />
      </div>
      <div className="mt-[10px] flex h-11 items-center gap-2 bg-amber-100 px-2">
        <button onClick={() => onDelete(line)} className="h-9 rounded-lg px-3 text-[13px] font-medium text-red-600">Delete</button>
        <div className="flex-1" />
        <button onClick={onClose} className="h-9 rounded-lg px-3 text-[13px]">Cancel</button>
        <button onClick={() => onDuplicate(line)} className="grid h-9 w-9 place-items-center rounded-lg"><Copy size={18} /></button>
        <button onClick={save} className="h-9 rounded-lg bg-gray-900 px-5 text-[13px] font-medium text-white">Save</button>
      </div>
    </div>
  );
}

function Cell({ children, muted, strong, center, color, className = "" }: { children: ReactNode; muted?: boolean; strong?: boolean; center?: boolean; color?: "red" | "green" | "blue" | "muted" | "amber" | "tertiary"; className?: string }) {
  const colorClass = color === "red" ? "text-red-600" : color === "green" ? "text-emerald-700" : color === "blue" ? "text-blue-700" : color === "amber" ? "text-amber-600" : color === "tertiary" ? "text-gray-300" : muted || color === "muted" ? "text-gray-500" : "text-gray-800";
  return <div className={`px-3 text-[13px] ${center ? "text-center" : "text-right"} ${strong ? "font-medium" : ""} ${colorClass} ${className}`}>{children}</div>;
}

function InlineTextCell({ line, field, value, align, onSave, muted }: {
  line: BudgetLineItem;
  field: EditableLineField;
  value: string;
  align: "left" | "right";
  onSave: (field: EditableLineField, value: string) => Promise<void>;
  muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value, line.id]);

  async function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    try {
      await onSave(field, trimmed);
    } catch {
      setDraft(value);
      throw new Error("save failed");
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit().catch(() => {})}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`w-full border-0 bg-transparent p-0 text-[13px] font-medium outline-none shadow-none ${muted ? "text-gray-400 line-through" : "text-gray-900"} ${align === "right" ? "text-right" : "text-left"}`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`block w-full cursor-text truncate border-0 bg-transparent p-0 text-[13px] font-medium ${muted ? "text-gray-400 line-through" : "text-gray-900"} ${align === "right" ? "text-right" : "text-left"}`}
    >
      {value}
    </button>
  );
}

function InlineNumberCell({ line, field, value, displayValue, onSave, plain, strong, color, muted, italic, small }: {
  line: BudgetLineItem;
  field: EditableLineField;
  value: number;
  displayValue?: number;
  onSave: (field: EditableLineField, value: number) => Promise<void>;
  plain?: boolean;
  strong?: boolean;
  color?: "blue";
  muted?: boolean;
  italic?: boolean;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => { setDraft(String(value)); }, [value, line.id]);

  async function commit() {
    setEditing(false);
    const next = Number(draft);
    if (!Number.isFinite(next) || next === value) {
      setDraft(String(value));
      return;
    }
    try {
      await onSave(field, next);
    } catch {
      setDraft(String(value));
      throw new Error("save failed");
    }
  }

  const shownValue = displayValue ?? value;
  const colorClass = isZeroValue(shownValue) ? "text-gray-300" : color === "blue" ? "text-blue-700" : muted ? "text-gray-500" : "text-gray-800";
  const display = plain ? String(shownValue) : formatCurrency(shownValue);
  const textSize = small ? "text-xs" : "text-[13px]";

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit().catch(() => {})}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
        }}
        className={`w-full border-0 bg-transparent px-3 text-right ${textSize} tabular-nums outline-none shadow-none ${strong ? "font-medium" : ""} ${italic ? "italic" : ""} ${colorClass}`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`w-full cursor-text border-0 bg-transparent px-3 text-right ${textSize} tabular-nums group-hover:underline group-hover:decoration-gray-300 group-hover:underline-offset-4 ${strong ? "font-medium" : ""} ${italic ? "italic" : ""} ${colorClass}`}
    >
      {display}
    </button>
  );
}

function UnitDropdown({ value, onSave }: { value: string; onSave: (value: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function choose(next: string) {
    setOpen(false);
    if (next !== value) await onSave(next);
  }

  return (
    <div ref={ref} className="relative px-4 text-center">
      <button onClick={() => setOpen(!open)} className="inline-flex min-h-8 items-center gap-1 border-0 bg-transparent text-xs text-gray-500 hover:underline hover:decoration-gray-300 hover:underline-offset-4">
        {value}<ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-1/2 top-9 z-30 w-28 -translate-x-1/2 overflow-hidden rounded border border-gray-200 bg-white py-1 text-left shadow-lg">
          {UNIT_LABELS.map((unit) => (
            <button key={unit} onClick={() => choose(unit).catch(() => {})} className="flex h-8 w-full items-center justify-between px-2 text-xs text-gray-700 hover:bg-gray-50">
              {unit}
              {unit === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PoPanel({ line, onChanged }: { line: BudgetLineItem; onChanged: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");
  const openTotal = line.purchaseOrders.filter((po) => po.status === "OPEN").reduce((sum, po) => sum + po.agreedAmount, 0);
  const invoicedTotal = line.purchaseOrders.filter((po) => po.status === "INVOICED").reduce((sum, po) => sum + po.agreedAmount, 0);
  const paidPoTotal = line.purchaseOrders.filter((po) => po.status === "PAID").reduce((sum, po) => sum + po.agreedAmount, 0);
  const poTotal = line.purchaseOrders.reduce((sum, po) => sum + po.agreedAmount, 0);

  async function remove(po: PurchaseOrder) {
    if (!window.confirm(`Delete ${po.poNumber}?`)) return;
    setError("");
    try {
      await api.delete(`/api/budgets/pos/${po.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete PO");
    }
  }

  return (
    <div className="mb-2 border-t border-gray-200 bg-gray-50 p-3 md:ml-8 md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Purchase Orders</h3>
        <button onClick={() => { setAdding(true); setEditing(null); }} className="min-h-11 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white">+ Add PO</button>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="space-y-2">
        {line.purchaseOrders.map((po) => (
          <div key={po.id} className="rounded-lg border border-gray-200 bg-white p-3">
            {editing?.id === po.id ? (
              <PoForm lineId={line.id} po={po} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-gray-900 px-2 py-1 font-mono text-xs text-white">{po.poNumber}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{po.supplierName}</p>
                  {po.description && <p className="truncate text-xs text-gray-500">{po.description}</p>}
                  <p className="text-xs text-gray-400">{new Date(po.dateRaised).toLocaleDateString("en-GB")}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatCurrency(po.agreedAmount)}</span>
                <StatusPill status={po.status} />
                <button onClick={() => setEditing(po)} className="min-h-11 rounded-lg px-3 text-sm text-gray-600">Edit</button>
                {po.status === "OPEN" && <button onClick={() => remove(po)} className="min-h-11 rounded-lg px-3 text-sm text-red-600">Delete</button>}
              </div>
            )}
          </div>
        ))}
        {line.purchaseOrders.length === 0 && <p className="rounded-lg border border-dashed border-gray-200 bg-white p-4 text-center text-sm text-gray-400">No purchase orders yet.</p>}
      </div>
      {adding && <PoForm lineId={line.id} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} />}
      <div className="mt-3 grid gap-2 rounded-lg bg-white p-3 text-sm md:grid-cols-4">
        <MiniTotal label="Total agreed" value={poTotal} />
        <MiniTotal label="Open POs" value={openTotal} />
        <MiniTotal label="Invoiced" value={invoicedTotal} />
        <MiniTotal label="Paid" value={paidPoTotal} />
      </div>
      <div className="mt-3 max-w-[280px] border-t border-gray-200 pt-2 text-xs">
        <StackRow label="Accrual held" value={formatCurrency(line.internalSubtotal)} />
        <StackRow label="Total committed" value={formatCurrency(line.totalCommitted)} />
        <StackRow label="Remaining" value={formatCurrency(line.remainingAccrual)} valueClass={remainingTextClass({ remainingAccrual: line.remainingAccrual, internalSubtotal: line.internalSubtotal })} />
        <StackRow label="Client total" value={formatCurrency(line.clientSubtotal)} />
        <StackRow label="Margin" value={formatCurrency(line.marginAmount)} valueClass="text-emerald-700" />
      </div>
    </div>
  );
}

function StackRow({ label, value, valueClass = "text-gray-900" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="grid h-8 grid-cols-[120px_120px] items-center gap-4">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-right text-xs font-medium tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function BudgetBottomBar({ revision, isProduction }: { revision: BudgetRevision; isProduction: boolean }) {
  const totals = revision.totals;
  const projectedMargin = `${formatCurrency(totals.projectedMargin)} (${formatPercent(totals.projectedMarginPercent)})`;
  const feeLabel = `${formatPercent(revision.productionFeePercent)} = ${formatCurrency(totals.productionFeeAmount)}`;

  if (isProduction) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-20 min-h-[72px] border-t border-gray-300 bg-white px-6 pb-2 pt-3 shadow-sm md:left-13">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-5">
          <BottomPrimary label="Client value" value={formatCurrency(totals.clientGrandTotal)} />
          <BottomPrimary className="hidden md:block" label="Accrual held" value={formatCurrency(totals.totalAccrual)} />
          <BottomPrimary className="hidden md:block" label="Committed" value={formatCurrency(totals.totalCommitted)} />
          <BottomPrimary label="Remaining" value={formatCurrency(totals.totalRemaining)} valueClass={remainingTextClass({ totalRemaining: totals.totalRemaining, totalAccrual: totals.totalAccrual })} />
          <BottomPrimary className="hidden md:block" label="Projected margin" value={projectedMargin} valueClass={marginTextClass(totals.projectedMargin)} tooltip="Client value minus accrual held. Assumes all spend stays within accrual." />
          <BottomPrimary className="md:hidden" label="Committed" value={formatCurrency(totals.totalCommitted)} />
          <BottomPrimary className="md:hidden" label="Projected margin" value={projectedMargin} valueClass={marginTextClass(totals.projectedMargin)} tooltip="Client value minus accrual held. Assumes all spend stays within accrual." />
        </div>
        <div className="mt-1 grid grid-cols-1 gap-x-4 text-right text-xs text-gray-500 md:grid-cols-5">
          <BottomSecondary className="hidden md:block" label="Advances" value={formatCurrency(0)} />
          <BottomSecondary className="hidden md:block" label="Accrual" value={formatCurrency(totals.totalAccrual)} />
          <BottomSecondary className="hidden md:block" label="Committed" value={formatCurrency(totals.totalCommitted)} />
          <BottomSecondary className="hidden md:block" label="Remaining" value={formatCurrency(totals.totalRemaining)} valueClass={remainingTextClass({ totalRemaining: totals.totalRemaining, totalAccrual: totals.totalAccrual })} />
          <BottomSecondary label="Subtotal" value={formatCurrency(totals.clientGrandTotal)} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 min-h-[72px] border-t border-gray-300 bg-white px-6 pb-2 pt-3 shadow-sm md:left-13">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
        <BottomPrimary label="Client estimate" value={formatCurrency(totals.clientGrandTotal)} />
        <BottomPrimary className="hidden md:block" label="Internal cost" value={formatCurrency(totals.internalTotal)} />
        <BottomPrimary label="Total margin" value={formatCurrency(totals.totalMarginAmount)} valueClass={marginTextClass(totals.totalMarginAmount)} />
        <BottomPrimary className="hidden md:block" label="Margin %" value={formatPercent(totals.totalMarginPercent)} valueClass={marginTextClass(totals.totalMarginAmount)} />
        <BottomPrimary className="md:hidden" label="Internal cost" value={formatCurrency(totals.internalTotal)} />
        <BottomPrimary className="md:hidden" label="Margin %" value={formatPercent(totals.totalMarginPercent)} valueClass={marginTextClass(totals.totalMarginAmount)} />
      </div>
      <div className="mt-1 grid grid-cols-1 gap-x-4 text-right text-xs text-gray-500 md:grid-cols-4">
        <BottomSecondary className="hidden md:block" label="Advances" value={formatCurrency(0)} />
        <BottomSecondary className="hidden md:block" label="Fees Total" value={formatCurrency(totals.clientTotal)} />
        <BottomSecondary className="hidden md:block" label="Production fee" value={feeLabel} />
        <BottomSecondary label="Subtotal" value={formatCurrency(totals.clientGrandTotal)} />
      </div>
    </div>
  );
}

function BottomPrimary({ label, value, valueClass = "text-gray-900", className = "", tooltip }: { label: string; value: string; valueClass?: string; className?: string; tooltip?: string }) {
  return (
    <div className={`text-right ${className}`}>
      <TooltipLabel label={label} tooltip={tooltip} />
      <p className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function BottomSecondary({ label, value, valueClass = "text-gray-400", className = "" }: { label: string; value: string; valueClass?: string; className?: string }) {
  return <div className={`text-[11px] tabular-nums text-gray-300 ${className}`}><span>{label}: </span><span className={valueClass}>{value}</span></div>;
}

function TooltipLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <p className="group relative inline-flex items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-[0.5px] text-gray-500">
      {label}
      {tooltip && (
        <>
          <button type="button" className="grid min-h-5 min-w-5 place-items-center rounded-full text-gray-400">
            <Info size={12} />
          </button>
          <span className="pointer-events-none absolute bottom-6 right-0 z-40 hidden max-w-[220px] rounded bg-gray-900 px-2 py-1.5 text-left text-[13px] normal-case leading-snug text-white shadow-lg group-hover:block">
            {tooltip}
          </span>
        </>
      )}
    </p>
  );
}

function PoForm({ lineId, po, onCancel, onSaved }: { lineId: string; po?: PurchaseOrder; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    supplierName: po?.supplierName ?? "",
    description: po?.description ?? "",
    agreedAmount: String(po?.agreedAmount ?? ""),
    dateRaised: po?.dateRaised?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    status: po?.status ?? "OPEN" as PurchaseOrderStatus,
    invoiceNumber: po?.invoiceNumber ?? "",
    invoiceDate: po?.invoiceDate?.slice(0, 10) ?? "",
    notes: po?.notes ?? "",
  });
  const [error, setError] = useState("");
  const showInvoiceFields = form.status === "INVOICED" || form.status === "PAID";

  async function save() {
    if (!form.supplierName.trim() || !form.agreedAmount) return;
    setError("");
    try {
      const payload = {
        ...form,
        agreedAmount: Number(form.agreedAmount),
        invoiceNumber: showInvoiceFields ? form.invoiceNumber : undefined,
        invoiceDate: showInvoiceFields ? form.invoiceDate : undefined,
      };
      if (po) await api.patch(`/api/budgets/pos/${po.id}`, payload);
      else await api.post(`/api/budgets/lines/${lineId}/pos`, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save PO");
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <PlainField label="Supplier" value={form.supplierName} onChange={(supplierName) => setForm({ ...form, supplierName })} />
        <PlainField label="Agreed amount" type="number" value={form.agreedAmount} onChange={(agreedAmount) => setForm({ ...form, agreedAmount })} />
        <PlainField label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <PlainField label="Date raised" type="date" value={form.dateRaised} onChange={(dateRaised) => setForm({ ...form, dateRaised })} />
        {po && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PurchaseOrderStatus })} className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm">
              <option value="OPEN">Open</option>
              <option value="INVOICED">Invoiced</option>
              <option value="PAID">Paid</option>
            </select>
          </label>
        )}
        {showInvoiceFields && (
          <>
            <PlainField label="Invoice number" value={form.invoiceNumber} onChange={(invoiceNumber) => setForm({ ...form, invoiceNumber })} />
            <PlainField label="Invoice date" type="date" value={form.invoiceDate} onChange={(invoiceDate) => setForm({ ...form, invoiceDate })} />
          </>
        )}
        <label className="block md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-gray-500">Notes</span>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-200 p-3 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="min-h-11 rounded-lg px-4 text-sm text-gray-600">Cancel</button>
        <button onClick={save} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Save</button>
      </div>
    </div>
  );
}

function PlainField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>;
}

function StatusPill({ status }: { status: PurchaseOrderStatus }) {
  const cls = status === "PAID" ? "bg-emerald-100 text-emerald-700" : status === "INVOICED" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${cls}`}>{status.toLowerCase()}</span>;
}

function MiniTotal({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-gray-500">{label}</p><p className="font-medium tabular-nums text-gray-900">{formatCurrency(value)}</p></div>;
}

function LineEditor({ line, mode, onClose, onSave, onDuplicate, onDelete }: {
  line: BudgetLineItem;
  mode: ViewMode;
  onClose: () => void;
  onSave: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => Promise<void>;
  onDelete: (line: BudgetLineItem) => Promise<void>;
}) {
  const [form, setForm] = useState(line);

  async function save() {
    await onSave(line, form);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white md:hidden">
      <div className="min-h-full border-t-4 border-amber-500 bg-white px-4 py-3">
        <div className="mb-[10px] flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Edit line item</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="grid gap-[10px] md:grid-cols-4">
          <Field className="md:col-span-3" label="Name" value={form.description} onChange={(description) => setForm({ ...form, description })} />
          <Field label="Markup%" type="number" value={String(form.agencyMarkup)} onChange={(agencyMarkup) => setForm({ ...form, agencyMarkup: Number(agencyMarkup) })} />
          <Field label="Qty" type="number" value={String(form.quantity)} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />
          <Field label="Time" type="number" value={String(form.daysUnits)} onChange={(daysUnits) => setForm({ ...form, daysUnits: Number(daysUnits) })} />
          <label className="block"><span className="mb-1 block text-xs font-semibold text-gray-500">Unit</span><select value={form.unitLabel} onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm">{UNIT_LABELS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <Field label={mode === "client" ? "Client rate" : "Internal rate"} type="number" value={String(mode === "client" ? form.clientUnitCost : form.internalUnitCost)} onChange={(value) => mode === "client" ? setForm({ ...form, clientUnitCost: Number(value) }) : setForm({ ...form, internalUnitCost: Number(value) })} />
          <Textarea label="Private memo" value={form.privateMemo ?? ""} onChange={(privateMemo) => setForm({ ...form, privateMemo })} />
          <Textarea label="Memo" value={form.publicMemo ?? ""} onChange={(publicMemo) => setForm({ ...form, publicMemo })} />
          <div className="grid gap-1.5">
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })} /> Taxable</label>
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasPW} onChange={(e) => setForm({ ...form, hasPW: e.target.checked })} /> P&W (%)</label>
            <label className="flex h-8 items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasHealthSafety} onChange={(e) => setForm({ ...form, hasHealthSafety: e.target.checked })} /> Health & Safety</label>
          </div>
          <div className="grid gap-2 md:grid-cols-3 md:col-span-4">
            <Field label="Base hours" type="number" value={String(form.baseHours ?? 10)} onChange={(baseHours) => setForm({ ...form, baseHours: Number(baseHours) })} />
            <Field label="1.5x" type="number" value={String(form.overtime15x ?? 0)} onChange={(overtime15x) => setForm({ ...form, overtime15x: Number(overtime15x) })} />
            <Field label="2x" type="number" value={String(form.overtime2x ?? 0)} onChange={(overtime2x) => setForm({ ...form, overtime2x: Number(overtime2x) })} />
          </div>
        </div>
        <div className="mt-[10px] flex h-11 items-center gap-2 rounded-lg bg-amber-100 px-2">
          <button onClick={() => onDelete(line)} className="h-9 rounded-lg px-3 text-[13px] font-medium text-red-600">Delete</button>
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 rounded-lg px-3 text-[13px]">Cancel</button>
          <button onClick={() => onDuplicate(line)} className="grid h-9 w-9 place-items-center rounded-lg"><Copy size={18} /></button>
          <button onClick={save} className="h-9 rounded-lg bg-gray-900 px-5 text-[13px] font-medium text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

function CatalogPanel({ revisionId, sectionCode, onClose, onInserted }: { revisionId: string; sectionCode: string; onClose: () => void; onInserted: () => void }) {
  const [catalog, setCatalog] = useState<CatalogSection[]>([]);
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => { api.get<CatalogSection[]>("/api/catalog").then(setCatalog).catch(console.error); }, []);
  const filtered = catalog.map((section) => ({ ...section, items: section.items.filter((item) => item.description.toLowerCase().includes(search.toLowerCase())) }));

  async function insert(itemId: string, targetSection = sectionCode) {
    await api.post(`/api/budgets/revisions/${revisionId}/catalog-item`, { sectionCode: targetSection, catalogItemId: itemId });
    setAdded(itemId);
    onInserted();
    setTimeout(() => setAdded(null), 900);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 md:flex md:justify-end">
      <div className="h-full overflow-auto bg-white p-4 md:w-80">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Item catalog</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg"><X size={18} /></button>
        </div>
        <label className="relative block">
          <Search size={15} className="absolute left-3 top-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search catalog" className="min-h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm" />
        </label>
        <div className="mt-4 space-y-4">
          {filtered.map((section) => (
            <div key={section.code} className={section.code === sectionCode ? "rounded-lg border border-gray-900 p-2" : ""}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{section.code}) {section.name}</h3>
              {section.items.map((item) => (
                <button key={item.id} onClick={() => insert(item.id, section.code)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm hover:bg-gray-50">
                  <span>{item.description}</span>
                  <span className="text-xs text-gray-400">{added === item.id ? "Added" : item.defaultUnitLabel}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RevisionSheet({ revisions, currentId, onClose, onNew, onOpen }: { revisions: BudgetRevisionSummary[]; currentId: string; onClose: () => void; onNew: () => void; onOpen: (id: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 md:grid md:place-items-center">
      <div className="h-full overflow-auto bg-white p-4 md:h-auto md:w-[520px] md:rounded-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Revision history</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg"><X size={18} /></button>
        </div>
        <button onClick={onNew} className="mb-3 min-h-11 w-full rounded-lg bg-gray-900 text-sm font-medium text-white">New Revision</button>
        {revisions.map((revision) => (
          <button key={revision.id} onClick={() => onOpen(revision.id)} className={`mb-2 flex min-h-16 w-full items-center gap-3 rounded-lg border p-3 text-left ${revision.id === currentId ? "border-gray-900 border-l-4" : "border-gray-200"}`}>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">R{revision.revisionNumber}</span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{revision.label}</span><span className="text-xs text-gray-500">{revisionStatusLabel(revision.status)} · V{revision.version}</span></span>
            <span className="text-sm font-medium">{formatCurrency(revision.clientGrandTotal)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoPanel({ entity, revision, revisions, currentId, onNewRevision, onOpenRevision, onProductionFeeChange }: {
  entity: Entity;
  revision: BudgetRevision;
  revisions: BudgetRevisionSummary[];
  currentId: string;
  onNewRevision: () => void;
  onOpenRevision: (id: string) => void;
  onProductionFeeChange: (value: number) => Promise<void>;
}) {
  return (
    <aside className="hidden w-[260px] shrink-0 border-l border-gray-200 bg-gray-50 px-5 pb-5 pt-5 lg:block">
      <div className="rounded-lg bg-white p-4">
        <h3 className="text-[11px] font-medium uppercase text-gray-500">Info</h3>
        <p className="mt-2 text-[15px] font-medium text-gray-900">{entityLabel(entity)}</p>
        <p className="text-xs text-gray-400">{entity.type}</p>
      </div>
      <div className="mt-3 rounded-lg bg-white p-4">
        <h3 className="text-[11px] font-medium uppercase text-gray-500">Notes</h3>
        <ProductionFeeField value={revision.productionFeePercent} onSave={onProductionFeeChange} />
      </div>
      <div className="mt-3 rounded-lg bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase text-gray-500">Revisions</h3>
          <button onClick={onNewRevision} className="text-xs font-medium text-indigo-600">New</button>
        </div>
        {revisions.map((revision) => (
          <button key={revision.id} onClick={() => onOpenRevision(revision.id)} className={`mb-1 flex h-10 w-full items-center gap-2 rounded-full px-2 text-left text-xs ${revision.id === currentId ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            <span className={`rounded-full px-2 py-1 font-semibold ${revision.id === currentId ? "bg-white/15 text-white" : "bg-gray-900 text-white"}`}>R{revision.revisionNumber}</span>
            <span className="min-w-0 flex-1 truncate">{revision.label}</span>
            <span className="font-medium tabular-nums">{formatCurrency(revision.clientGrandTotal)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ProductionFeeField({ value, onSave }: { value: number; onSave: (value: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(String(value)), [value]);

  async function commit() {
    const next = Number(draft);
    if (!Number.isFinite(next) || next === value) {
      setDraft(String(value));
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium text-gray-500">Production fee %</span>
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit().catch(() => setDraft(String(value)))}
        className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px]"
      />
      <span className="mt-1 block text-[11px] text-gray-400">{saving ? "Saving..." : "Applies to client total only"}</span>
    </label>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[13px]" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="h-14 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-[13px]" /></label>;
}
