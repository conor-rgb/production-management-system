import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
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

  async function saveLine(line: BudgetLineItem, patch: Partial<BudgetLineItem>) {
    const updated = await api.patch<BudgetLineItem>(`/api/budgets/lines/${line.id}`, patch);
    await reloadRevision();
    setSelectedLine(updated);
  }

  async function duplicateLine(line: BudgetLineItem) {
    const created = await api.post<BudgetLineItem>(`/api/budgets/lines/${line.id}/duplicate`, {});
    await reloadRevision();
    setSelectedLine(created);
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
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3">
        <button onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ChevronLeft size={18} /> {entityLabel(entity)}
        </button>
        <select
          value={revision.id}
          onChange={(e) => reloadRevision(e.target.value)}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm md:max-w-xs"
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

      <div className="flex min-h-10 shrink-0 items-center gap-1 border-b border-gray-100 bg-gray-50 px-3">
        <button onClick={() => setSelectedIds([])} className="min-h-10 px-2 text-xs text-gray-600">Unselect all</button>
        <button onClick={() => exportPdf("client")} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><Printer size={16} /><span className="hidden sm:inline">Print estimate</span></button>
        <button className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><Mail size={16} /><span className="hidden sm:inline">Email estimate</span></button>
        <button onClick={() => setRevisionsOpen(true)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-600 sm:flex sm:gap-1 sm:px-2"><History size={16} /><span className="hidden sm:inline">Revision history</span></button>
        <div className="flex-1" />
        <button
          onClick={() => {
            const firstSection = revision.sections[0];
            if (firstSection) addManualLine(firstSection.id);
          }}
          className="flex min-h-10 items-center gap-1 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
        >
          <Plus size={16} /> Add line
        </button>
      </div>

      <div className="sticky top-0 z-20 grid shrink-0 grid-cols-2 gap-2 border-b border-gray-200 bg-white p-3 md:grid-cols-4">
        <Metric label="Client estimate" value={formatCurrency(totals?.clientGrandTotal)} strong />
        <Metric label="Actual spend" value={isProduction ? formatCurrency(totals?.actualTotal) : "Bid only"} />
        <Metric label="Variance" value={isProduction ? formatCurrency(totals?.variance) : "—"} danger={Boolean(totals?.overBudget)} good={Boolean(totals && totals.variance <= 0)} />
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

      <div className="fixed bottom-0 left-0 right-0 z-20 grid gap-1 border-t border-gray-200 bg-white px-3 py-2 text-xs shadow-sm md:left-13 md:grid-cols-4 md:text-sm">
        <span>Advances: £0.00</span>
        {mode === "internal" && <span>Internal Total: {formatCurrency(totals?.internalTotal)}</span>}
        <span>Fees Total: {formatCurrency(totals?.clientTotal)}</span>
        <span className="font-semibold">Subtotal: {formatCurrency(totals?.clientGrandTotal)}</span>
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

function BudgetTable({ revision, mode, selectedIds, onToggleSelected, onEdit, onAddLine, onBrowseCatalog, onDuplicate, onDelete }: {
  revision: BudgetRevision;
  mode: ViewMode;
  selectedIds: string[];
  onToggleSelected: (id: string) => void;
  onEdit: (line: BudgetLineItem) => void;
  onAddLine: (sectionId: string) => void;
  onBrowseCatalog: (sectionCode: string) => void;
  onDuplicate: (line: BudgetLineItem) => void;
  onDelete: (line: BudgetLineItem) => void;
}) {
  return (
    <div className="min-w-full">
      <div className={`sticky top-0 z-10 hidden h-9 border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 md:grid ${mode === "internal" ? "grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]" : "grid-cols-[minmax(320px,1fr)_100px_60px_60px_70px_110px]"}`}>
        {mode === "internal" ? ["", "Description", "Int. Rate", "Client Rate", "Qty", "Days", "Unit", "Markup", "Int. Total", "Client Total", "Actual", "Variance", "Inv."].map((h) => <div key={h} className="px-2 py-3 text-right first:text-left nth-[2]:text-left">{h}</div>) : ["Description", "Rate", "Qty", "Days", "Unit", "Total"].map((h) => <div key={h} className="px-2 py-3 text-right first:text-left">{h}</div>)}
      </div>
      {revision.sections.map((section) => {
        const sectionTotal = revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
        return (
          <div key={section.id}>
            <div className="flex min-h-11 items-center gap-3 border-t border-gray-200 px-3 text-sm font-semibold">
              <span>{section.code}) {section.name}</span>
              <span className="ml-auto text-sm text-gray-600">{formatCurrency(sectionTotal?.clientTotal)}</span>
              <button onClick={() => onBrowseCatalog(section.code)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><MoreHorizontal size={16} /></button>
            </div>
            {section.lineItems.length === 0 ? (
              <div className="min-h-20 p-4 text-center text-sm text-gray-400">
                No line items — <button onClick={() => onBrowseCatalog(section.code)} className="text-indigo-600">Browse catalog</button> or <button onClick={() => onAddLine(section.id)} className="text-indigo-600">+ Add line</button>
              </div>
            ) : section.lineItems.map((line) => (
              <LineRow key={line.id} line={line} mode={mode} checked={selectedIds.includes(line.id)} onCheck={() => onToggleSelected(line.id)} onEdit={() => onEdit(line)} onDuplicate={() => onDuplicate(line)} onDelete={() => onDelete(line)} />
            ))}
            {section.lineItems.length > 0 && (
              <div className="hidden min-h-9 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-600 md:grid md:grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]">
                <div /><div className="px-2 py-2">Section total</div><div /><div /><div /><div /><div /><div /><div className="px-2 py-2 text-right tabular-nums">{formatCurrency(sectionTotal?.internalTotal)}</div><div className="px-2 py-2 text-right tabular-nums">{formatCurrency(sectionTotal?.clientTotal)}</div><div className="px-2 py-2 text-right tabular-nums">{formatCurrency(sectionTotal?.actualTotal)}</div><div /><div />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineRow({ line, mode, checked, onCheck, onEdit, onDuplicate, onDelete }: {
  line: BudgetLineItem;
  mode: ViewMode;
  checked: boolean;
  onCheck: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group border-b border-gray-100 hover:bg-gray-50">
      <div className="flex min-h-[52px] items-center gap-3 px-3 md:hidden" onClick={onEdit}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900">{line.description}</p>
          {line.publicMemo && <p className="truncate text-xs italic text-gray-500">{line.publicMemo}</p>}
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatCurrency(line.clientSubtotal)}</p>
      </div>
      <div className={`hidden min-h-12 items-center text-[13px] tabular-nums md:grid ${mode === "internal" ? "grid-cols-[32px_minmax(260px,1fr)_90px_90px_60px_60px_70px_80px_100px_110px_100px_100px_48px]" : "grid-cols-[minmax(320px,1fr)_100px_60px_60px_70px_110px]"}`}>
        {mode === "internal" ? (
          <>
            <div className="px-2"><input type="checkbox" checked={checked} onChange={onCheck} className="opacity-0 group-hover:opacity-100" /></div>
            <button onClick={onEdit} className="min-w-0 px-2 text-left">
              <span className="truncate">{line.description}</span>
              {line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}
            </button>
            <Cell>{formatCurrency(line.internalUnitCost)}</Cell><Cell>{formatCurrency(line.clientUnitCost)}</Cell><Cell>{line.quantity}</Cell><Cell>{line.daysUnits}</Cell><Cell center>{line.unitLabel}</Cell><Cell>{formatCurrency(line.agencyMarkup)}</Cell><Cell muted>{formatCurrency(line.internalSubtotal)}</Cell><Cell strong>{formatCurrency(line.clientSubtotal)}</Cell><Cell>{formatCurrency(line.actualCost)}</Cell><Cell color={line.variance > 0 ? "red" : "green"}>{formatCurrency(line.variance)}</Cell>
            <button className="mx-auto rounded-full bg-gray-100 px-2 py-1 text-xs">{line.invoices.length}</button>
            <div className="absolute right-14 hidden gap-1 group-hover:flex"><button onClick={onDuplicate}><Copy size={15} /></button><button onClick={onDelete} className="text-red-500"><Trash2 size={15} /></button></div>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="min-w-0 px-2 text-left">{line.description}{line.publicMemo && <span className="block truncate text-xs italic text-gray-500">{line.publicMemo}</span>}</button>
            <Cell strong color="blue">{formatCurrency(line.clientUnitCost)}</Cell><Cell>{line.quantity}</Cell><Cell>{line.daysUnits}</Cell><Cell center>{line.unitLabel}</Cell><Cell strong>{formatCurrency(line.clientSubtotal)}</Cell>
          </>
        )}
      </div>
    </div>
  );
}

function Cell({ children, muted, strong, center, color }: { children: ReactNode; muted?: boolean; strong?: boolean; center?: boolean; color?: "red" | "green" | "blue" }) {
  const colorClass = color === "red" ? "text-red-600" : color === "green" ? "text-emerald-700" : color === "blue" ? "text-blue-700" : muted ? "text-gray-500" : "text-gray-800";
  return <div className={`px-2 ${center ? "text-center" : "text-right"} ${strong ? "font-medium" : ""} ${colorClass}`}>{children}</div>;
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
    <aside className="hidden w-64 shrink-0 border-l border-gray-200 bg-gray-50 p-3 lg:block">
      <div className="rounded-lg bg-white p-3">
        <h3 className="text-sm font-semibold text-gray-900">Info</h3>
        <p className="mt-2 text-sm text-gray-600">{entityLabel(entity)}</p>
        <p className="text-xs text-gray-400">{entity.type}</p>
      </div>
      <div className="mt-3 rounded-lg bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Revisions</h3>
          <button onClick={onNewRevision} className="text-xs text-indigo-600">New</button>
        </div>
        {revisions.map((revision) => (
          <button key={revision.id} onClick={() => onOpenRevision(revision.id)} className={`mb-1 w-full rounded-lg p-2 text-left text-xs ${revision.id === currentId ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}>
            R{revision.revisionNumber} · {revision.label}<span className="block opacity-70">{formatCurrency(revision.clientGrandTotal)}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Metric({ label, value, strong, danger, good }: { label: string; value: string; strong?: boolean; danger?: boolean; good?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-lg font-semibold" : "text-sm font-medium"} ${danger ? "text-red-600" : good ? "text-emerald-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block md:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm" /></label>;
}
