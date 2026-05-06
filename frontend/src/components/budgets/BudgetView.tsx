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
} from "../../lib/types";
import { formatCurrency } from "../../lib/types";

type Entity =
  | { type: "production"; id: string; data?: Production }
  | { type: "opportunity"; id: string; data?: OpportunityListItem };

type ViewMode = "internal" | "client";
type EditableLineField = "description" | "internalUnitCost" | "clientUnitCost" | "quantity" | "daysUnits" | "unitLabel";
type BudgetLineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };

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

function displayVariance(value?: number) {
  return -(value ?? 0);
}

function varianceColor(value?: number) {
  const shown = displayVariance(value);
  if (shown > 0) return "green";
  if (shown < 0) return "red";
  return "muted";
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

  const isProduction = entity.type === "production";
  const totals = revision?.totals;

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
    setSelectedLine(res.line);
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

      <div className="sticky top-0 z-20 grid shrink-0 grid-cols-2 gap-4 border-b border-gray-200 bg-white px-5 py-5 md:grid-cols-4">
        <Metric label="Client estimate" value={formatCurrency(totals?.clientGrandTotal)} strong />
        <Metric label="Actual spend" value={isProduction ? formatCurrency(totals?.actualTotal) : "—"} muted={!isProduction} />
        <Metric
          label="Variance"
          value={isProduction ? formatCurrency(displayVariance(totals?.variance)) : formatCurrency(0)}
          danger={isProduction && varianceColor(totals?.variance) === "red"}
          good={isProduction && varianceColor(totals?.variance) === "green"}
          muted={!isProduction || varianceColor(totals?.variance) === "muted"}
        />
        <Metric label="Production fee" value={`${revision.productionFeePercent}%`} />
      </div>

      <div className="hidden shrink-0 border-b border-gray-100 px-4 py-2 md:block">
        <div className="mx-auto flex max-w-md items-center justify-between text-xs text-gray-500">
          <span className="font-semibold text-gray-900">Estimate</span><span className="h-px flex-1 bg-gray-200 mx-3" />
          <span className={isProduction ? "font-semibold text-gray-900" : ""}>Production</span><span className="h-px flex-1 bg-gray-200 mx-3" />
          <span>Invoice</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto pb-24">
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
            onSaveCell={saveLine}
            onSaveError={showSaveError}
          />
        </div>
        <InfoPanel entity={entity} revisions={revisions} currentId={revision.id} onNewRevision={createRevision} onOpenRevision={(id) => reloadRevision(id)} />
      </div>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-16 left-4 right-4 z-30 flex min-h-12 items-center gap-3 rounded-xl bg-gray-900 px-3 text-sm text-white shadow-lg md:left-20 md:right-80">
          <span>{selectedIds.length} items selected</span>
          <div className="flex-1" />
          <button onClick={deleteSelected} className="min-h-10 rounded-lg bg-red-600 px-3">Delete selected</button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 grid min-h-[52px] items-center gap-1 border-t border-gray-200 bg-white px-6 py-2 text-[13px] shadow-sm md:left-13 md:grid-cols-4">
        <span><span className="text-gray-500">Advances:</span> <span className="text-sm font-medium">£0.00</span></span>
        {mode === "internal" && <span><span className="text-gray-500">Internal Total:</span> <span className="text-sm font-medium">{formatCurrency(totals?.internalTotal)}</span></span>}
        <span><span className="text-gray-500">Fees Total:</span> <span className="text-sm font-medium">{formatCurrency(totals?.clientTotal)}</span></span>
        <span><span className="text-gray-500">Subtotal:</span> <span className="text-sm font-medium">{formatCurrency(totals?.clientGrandTotal)}</span></span>
      </div>

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

function BudgetTable({ revision, mode, selectedIds, onToggleSelected, onEdit, onAddLine, onBrowseCatalog, onDuplicate, onDelete, onSaveCell, onSaveError }: {
  revision: BudgetRevision;
  mode: ViewMode;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onEdit: (line: BudgetLineItem) => void;
  onAddLine: (sectionId: string) => void;
  onBrowseCatalog: (sectionCode: string) => void;
  onDuplicate: (line: BudgetLineItem) => void;
  onDelete: (line: BudgetLineItem) => void;
  onSaveCell: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onSaveError: () => void;
}) {
  return (
    <div className="min-w-full">
      <div className={`sticky top-0 z-10 hidden h-9 border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 md:grid ${mode === "internal" ? "grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]" : "grid-cols-[minmax(320px,1fr)_100px_60px_60px_70px_110px]"}`}>
        {mode === "internal" ? ["", "Description", "Int. Rate", "Client Rate", "Qty", "Days", "Unit", "Markup", "Int. Total", "Client Total", "Actual", "Variance", "Inv."].map((h) => <div key={h} className="px-4 py-3 text-right first:text-left nth-[2]:text-left">{h}</div>) : ["Description", "Rate", "Qty", "Days", "Unit", "Total"].map((h) => <div key={h} className="px-4 py-3 text-right first:text-left">{h}</div>)}
      </div>
      {revision.sections.map((section) => {
        const sectionTotal = revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
        return (
          <div key={section.id} className="pt-2">
            <div className="flex min-h-11 items-center gap-3 border-t border-gray-200 bg-[#f8f8f8] px-4 text-[13px] font-semibold text-gray-900">
              <span>{section.code}) {section.name}</span>
              <span className="ml-auto text-sm text-gray-600">{formatCurrency(sectionTotal?.clientTotal)}</span>
              <button onClick={() => onBrowseCatalog(section.code)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><MoreHorizontal size={16} /></button>
            </div>
            {section.lineItems.length === 0 ? (
              <div className="grid min-h-[60px] place-items-center p-4 text-center text-[13px] text-gray-400">
                No line items — <button onClick={() => onBrowseCatalog(section.code)} className="text-indigo-600">Browse catalog</button> or <button onClick={() => onAddLine(section.id)} className="text-indigo-600">+ Add line</button>
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
                onSaveCell={onSaveCell}
                onSaveError={onSaveError}
              />
            ))}
            {section.lineItems.length > 0 && (
              <div className="hidden min-h-10 border-b border-gray-100 bg-gray-50 text-xs font-medium text-gray-500 md:grid md:grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]">
                <div /><div className="py-3 pl-5 pr-4 italic">Section total</div><div /><div /><div /><div /><div /><div /><div className="px-4 py-3 text-right tabular-nums">{formatCurrency(sectionTotal?.internalTotal)}</div><div className="px-4 py-3 text-right tabular-nums">{formatCurrency(sectionTotal?.clientTotal)}</div><div className="px-4 py-3 text-right tabular-nums">{formatCurrency(sectionTotal?.actualTotal)}</div><div /><div />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineRow({ line, mode, checked, onCheck, onEdit, onDuplicate, onDelete, onSaveCell, onSaveError }: {
  line: BudgetLineItem;
  mode: ViewMode;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveCell: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onSaveError: () => void;
}) {
  async function saveCell(field: EditableLineField, value: string | number) {
    const patch: Partial<BudgetLineItem> = { [field]: value } as Partial<BudgetLineItem>;
    try {
      await onSaveCell(line, patch);
    } catch {
      onSaveError();
      throw new Error("save failed");
    }
  }

  return (
    <div className="group relative border-b border-gray-100 hover:bg-gray-50">
      <div className="flex min-h-[52px] items-center gap-3 px-4 md:hidden">
        <div className="min-w-0 flex-1">
          <InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />
          {line.publicMemo && <p className="truncate text-xs italic text-gray-500">{line.publicMemo}</p>}
        </div>
        <button onClick={onEdit} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-400"><MoreHorizontal size={16} /></button>
        <p className="text-sm font-semibold tabular-nums">{formatCurrency(line.clientSubtotal)}</p>
      </div>
      <div className={`hidden min-h-[52px] items-center text-[13px] tabular-nums md:grid ${mode === "internal" ? "grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]" : "grid-cols-[minmax(320px,1fr)_100px_60px_60px_70px_110px]"}`}>
        {mode === "internal" ? (
          <>
            <div className="px-2"><input type="checkbox" checked={checked} onChange={onCheck} className="opacity-0 group-hover:opacity-100" /></div>
            <div className="min-w-0 pl-5 pr-4 text-left">
              <InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />
              {line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}
            </div>
            <InlineNumberCell line={line} field="internalUnitCost" value={line.internalUnitCost} onSave={saveCell} />
            <InlineNumberCell line={line} field="clientUnitCost" value={line.clientUnitCost} onSave={saveCell} />
            <InlineNumberCell line={line} field="quantity" value={line.quantity} onSave={saveCell} plain />
            <InlineNumberCell line={line} field="daysUnits" value={line.daysUnits} onSave={saveCell} plain />
            <UnitDropdown value={line.unitLabel} onSave={(value) => saveCell("unitLabel", value)} />
            <Cell>{formatCurrency(line.agencyMarkup)}</Cell><Cell muted>{formatCurrency(line.internalSubtotal)}</Cell><Cell strong>{formatCurrency(line.clientSubtotal)}</Cell><Cell>{formatCurrency(line.actualCost)}</Cell><Cell color={varianceColor(line.variance)}>{formatCurrency(displayVariance(line.variance))}</Cell>
            <button onClick={onEdit} className="mx-auto rounded-full bg-gray-100 px-2 py-1 text-xs">{line.invoices.length}</button>
            <div className="absolute right-12 top-1.5 hidden gap-1 rounded-lg bg-white/90 p-1 shadow-sm group-hover:flex">
              <button
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                className="grid min-h-10 min-w-10 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
                title="Duplicate"
              >
                <Copy size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="grid min-h-10 min-w-10 place-items-center rounded-md text-red-500 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 pl-5 pr-4 text-left"><InlineTextCell line={line} field="description" value={line.description} align="left" onSave={saveCell} />{line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}</div>
            <InlineNumberCell line={line} field="clientUnitCost" value={line.clientUnitCost} onSave={saveCell} strong color="blue" />
            <InlineNumberCell line={line} field="quantity" value={line.quantity} onSave={saveCell} plain />
            <InlineNumberCell line={line} field="daysUnits" value={line.daysUnits} onSave={saveCell} plain />
            <UnitDropdown value={line.unitLabel} onSave={(value) => saveCell("unitLabel", value)} />
            <Cell strong>{formatCurrency(line.clientSubtotal)}</Cell>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ children, muted, strong, center, color }: { children: ReactNode; muted?: boolean; strong?: boolean; center?: boolean; color?: "red" | "green" | "blue" | "muted" }) {
  const colorClass = color === "red" ? "text-red-600" : color === "green" ? "text-emerald-700" : color === "blue" ? "text-blue-700" : muted || color === "muted" ? "text-gray-500" : "text-gray-800";
  return <div className={`px-4 ${center ? "text-center" : "text-right"} ${strong ? "font-medium" : ""} ${colorClass}`}>{children}</div>;
}

function InlineTextCell({ line, field, value, align, onSave }: {
  line: BudgetLineItem;
  field: EditableLineField;
  value: string;
  align: "left" | "right";
  onSave: (field: EditableLineField, value: string) => Promise<void>;
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
        className={`w-full border-0 bg-transparent p-0 text-sm text-gray-900 outline-none shadow-none ${align === "right" ? "text-right" : "text-left"}`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`block w-full cursor-text truncate border-0 bg-transparent p-0 text-sm text-gray-900 group-hover:underline group-hover:decoration-gray-300 group-hover:underline-offset-4 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {value}
    </button>
  );
}

function InlineNumberCell({ line, field, value, onSave, plain, strong, color }: {
  line: BudgetLineItem;
  field: EditableLineField;
  value: number;
  onSave: (field: EditableLineField, value: number) => Promise<void>;
  plain?: boolean;
  strong?: boolean;
  color?: "blue";
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

  const colorClass = color === "blue" ? "text-blue-700" : "text-gray-800";
  const display = plain ? String(value) : formatCurrency(value);

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
        className={`w-full border-0 bg-transparent px-4 text-right text-[13px] tabular-nums outline-none shadow-none ${strong ? "font-medium" : ""} ${colorClass}`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={`w-full cursor-text border-0 bg-transparent px-4 text-right text-[13px] tabular-nums group-hover:underline group-hover:decoration-gray-300 group-hover:underline-offset-4 ${strong ? "font-medium" : ""} ${colorClass}`}
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
      <button onClick={() => setOpen(!open)} className="inline-flex min-h-8 items-center gap-1 border-0 bg-transparent text-xs text-gray-800 hover:underline hover:decoration-gray-300 hover:underline-offset-4">
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
    <div className="fixed inset-0 z-50 overflow-auto bg-white md:bg-black/30 md:p-6">
      <div className="min-h-full border-t-4 border-amber-500 bg-white p-4 md:mx-auto md:max-w-4xl md:rounded-lg md:shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Edit line item</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Field className="md:col-span-3" label="Name" value={form.description} onChange={(description) => setForm({ ...form, description })} />
          <Field label="Markup%" type="number" value={String(form.agencyMarkup)} onChange={(agencyMarkup) => setForm({ ...form, agencyMarkup: Number(agencyMarkup) })} />
          <Field label="Qty" type="number" value={String(form.quantity)} onChange={(quantity) => setForm({ ...form, quantity: Number(quantity) })} />
          <Field label="Time" type="number" value={String(form.daysUnits)} onChange={(daysUnits) => setForm({ ...form, daysUnits: Number(daysUnits) })} />
          <label className="block"><span className="mb-1 block text-xs font-semibold text-gray-500">Unit</span><select value={form.unitLabel} onChange={(e) => setForm({ ...form, unitLabel: e.target.value })} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm">{UNIT_LABELS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <Field label={mode === "client" ? "Client rate" : "Internal rate"} type="number" value={String(mode === "client" ? form.clientUnitCost : form.internalUnitCost)} onChange={(value) => mode === "client" ? setForm({ ...form, clientUnitCost: Number(value) }) : setForm({ ...form, internalUnitCost: Number(value) })} />
          <Textarea label="Private memo" value={form.privateMemo ?? ""} onChange={(privateMemo) => setForm({ ...form, privateMemo })} />
          <Textarea label="Memo" value={form.publicMemo ?? ""} onChange={(publicMemo) => setForm({ ...form, publicMemo })} />
          <div className="grid gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })} /> Taxable</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.hasPW} onChange={(e) => setForm({ ...form, hasPW: e.target.checked })} /> P&W (%)</label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.hasHealthSafety} onChange={(e) => setForm({ ...form, hasHealthSafety: e.target.checked })} /> Health & Safety</label>
          </div>
          <div className="grid gap-2 md:grid-cols-3 md:col-span-4">
            <Field label="Base hours" type="number" value={String(form.baseHours ?? 10)} onChange={(baseHours) => setForm({ ...form, baseHours: Number(baseHours) })} />
            <Field label="1.5x" type="number" value={String(form.overtime15x ?? 0)} onChange={(overtime15x) => setForm({ ...form, overtime15x: Number(overtime15x) })} />
            <Field label="2x" type="number" value={String(form.overtime2x ?? 0)} onChange={(overtime2x) => setForm({ ...form, overtime2x: Number(overtime2x) })} />
          </div>
        </div>
        <div className="mt-4 flex min-h-14 items-center gap-2 rounded-lg bg-amber-100 p-2">
          <button onClick={() => onDelete(line)} className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-600">Delete</button>
          <div className="flex-1" />
          <button onClick={onClose} className="min-h-11 rounded-lg px-3 text-sm">Cancel</button>
          <button onClick={() => onDuplicate(line)} className="grid min-h-11 min-w-11 place-items-center rounded-lg"><Copy size={17} /></button>
          <button onClick={save} className="min-h-11 rounded-lg bg-gray-900 px-5 text-sm font-medium text-white">Save</button>
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

function InfoPanel({ entity, revisions, currentId, onNewRevision, onOpenRevision }: { entity: Entity; revisions: BudgetRevisionSummary[]; currentId: string; onNewRevision: () => void; onOpenRevision: (id: string) => void }) {
  return (
    <aside className="hidden w-[260px] shrink-0 border-l border-gray-200 bg-gray-50 p-5 lg:block">
      <div className="rounded-lg bg-white p-4">
        <h3 className="text-[11px] font-medium uppercase text-gray-500">Info</h3>
        <p className="mt-2 text-[15px] font-medium text-gray-900">{entityLabel(entity)}</p>
        <p className="text-xs text-gray-400">{entity.type}</p>
      </div>
      <div className="mt-3 rounded-lg bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase text-gray-500">Revisions</h3>
          <button onClick={onNewRevision} className="text-xs font-medium text-indigo-600">New</button>
        </div>
        {revisions.map((revision) => (
          <button key={revision.id} onClick={() => onOpenRevision(revision.id)} className={`mb-1 flex min-h-11 w-full items-center gap-2 rounded-full px-2 text-left text-xs ${revision.id === currentId ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            <span className={`rounded-full px-2 py-1 font-semibold ${revision.id === currentId ? "bg-white/15" : "bg-gray-100 text-gray-600"}`}>R{revision.revisionNumber}</span>
            <span className="min-w-0 flex-1 truncate">{revision.label}</span>
            <span className="font-medium tabular-nums">{formatCurrency(revision.clientGrandTotal)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Metric({ label, value, strong, danger, good, muted }: { label: string; value: string; strong?: boolean; danger?: boolean; good?: boolean; muted?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-2xl font-medium" : "text-2xl font-medium"} ${danger ? "text-red-600" : good ? "text-emerald-700" : muted ? "text-gray-400" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block md:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm" /></label>;
}
