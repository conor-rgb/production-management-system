import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Download, FileText, MoreHorizontal, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";
import type {
  AdvanceCalcType,
  AdvanceInvoice,
  Budget,
  BudgetLineItem,
  BudgetRevision,
  BudgetRevisionSummary,
  BudgetSection,
  SectionTemplate,
  SubCost,
  SubCostStatus,
} from "../../lib/types";

type Entity = { type: "production" | "opportunity"; id: string; label?: string; data?: unknown };
type ViewMode = "internal" | "client";
type Panel = "cover" | "advances" | "templates" | null;
type LineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };
type SubCostMutationResponse = { subCost: SubCost; revision: BudgetRevision | null };

const UNITS = ["Days", "Flat Fee", "Cars", "Drives", "Weeks", "Hours", "Items", "People", "Other"];
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

function money(value: number | null | undefined) {
  return `£${Number(value ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function zeroClass(value: number | null | undefined) {
  return Number(value ?? 0) === 0 ? "text-gray-300" : "text-gray-900";
}

function varianceClass(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (n < 0) return "text-red-600";
  if (n === 0) return "text-gray-400";
  return "text-emerald-700";
}

function percentLabel(value: number | null | undefined) {
  return `${Number(value ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

export default function BudgetView({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [revision, setRevision] = useState<BudgetRevision | null>(null);
  const [revisions, setRevisions] = useState<BudgetRevisionSummary[]>([]);
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [mode, setMode] = useState<ViewMode>("internal");
  const [panel, setPanel] = useState<Panel>(null);
  const [expandedSubCosts, setExpandedSubCosts] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function load() {
    const loaded = entity.type === "production"
      ? await api.get<Budget>(`/api/budgets/production/${entity.id}`)
      : await api.get<Budget>(`/api/budgets/opportunity/${entity.id}`);
    setBudget(loaded);
    setRevision(loaded.currentRevision ?? null);
    setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${loaded.id}/revisions`));
    setTemplates(await api.get<SectionTemplate[]>("/api/budgets/templates"));
  }

  useEffect(() => {
    load().catch((err: Error) => setToast(err.message));
  }, [entity.id, entity.type]);

  async function openRevision(revisionId: string) {
    const next = await api.get<BudgetRevision>(`/api/budgets/revisions/${revisionId}`);
    setRevision(next);
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
    setRevision(updated);
    if (budget) setRevisions(await api.get<BudgetRevisionSummary[]>(`/api/budgets/${budget.id}/revisions`));
  }

  async function saveLine(line: BudgetLineItem, patch: Partial<BudgetLineItem>) {
    const response = await api.patch<LineMutationResponse>(`/api/budgets/lines/${line.id}`, patch);
    if (response.revision) setRevision(response.revision);
  }

  async function addLine(section: BudgetSection) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/sections/${section.id}/lines`, {
      description: "New line item",
      qty: 1,
      rate: 0,
      multiplier: 1,
      unit: "Days",
    });
    if (response.revision) setRevision(response.revision);
  }

  async function addSubItem(line: BudgetLineItem) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/lines/${line.id}/sub-item`, {
      description: "Sub-item",
      qty: 1,
      rate: 0,
      multiplier: 1,
      unit: "Flat Fee",
    });
    if (response.revision) setRevision(response.revision);
  }

  async function duplicateLine(line: BudgetLineItem) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/lines/${line.id}/duplicate`, {});
    if (response.revision) setRevision(response.revision);
  }

  async function deleteLine(line: BudgetLineItem) {
    if (!window.confirm(`Delete ${line.description}?`)) return;
    await api.delete(`/api/budgets/lines/${line.id}`);
    await load();
  }

  async function addSection() {
    if (!revision) return;
    const code = window.prompt("Section code");
    const name = window.prompt("Section name");
    if (!code || !name) return;
    await api.post(`/api/budgets/revisions/${revision.id}/sections`, { code, name });
    await openRevision(revision.id);
  }

  async function applyTemplate(templateId: string) {
    if (!revision || !window.confirm("Apply this template? Existing sections in this revision will be replaced.")) return;
    const updated = await api.post<BudgetRevision>(`/api/budgets/revisions/${revision.id}/apply-template`, { templateId });
    setRevision(updated);
    setPanel(null);
  }

  async function exportPdf(exportMode: "client" | "internal") {
    if (!revision) return;
    await api.post(`/api/budgets/revisions/${revision.id}/export-pdf`, { mode: exportMode });
    setToast("PDF exported to Estimates.");
  }

  const firstAdvance = useMemo(() => {
    if (!budget || !revision?.totals) return null;
    const advance = budget.advanceInvoices[0];
    if (!advance) return null;
    return revision.totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? advance.calculatedAmount ?? 0;
  }, [budget, revision]);

  const entityLabel = entity.label ?? budget?.jobName ?? (entity.type === "production" ? "Production" : "Opportunity");

  if (!budget || !revision) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading budget...</div>;
  }

  const hasSections = revision.sections.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-gray-900">
      {toast && (
        <button onClick={() => setToast(null)} className="fixed right-4 top-4 z-[60] rounded-md bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
          {toast}
        </button>
      )}

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 px-3">
        <button onClick={onBack} className="flex min-h-11 items-center gap-1 text-sm text-gray-700">
          <ArrowLeft size={16} /> {entityLabel}
        </button>
        <select value={revision.id} onChange={(e) => openRevision(e.target.value).catch(console.error)} className="mx-auto h-9 max-w-[220px] rounded-md border border-gray-200 bg-white px-2 text-sm">
          {revisions.map((item) => <option key={item.id} value={item.id}>{item.label} — {STATUS_LABELS[item.status]}</option>)}
        </select>
        <button onClick={() => patchBudget({ status: budget.status === "DRAFT" ? "SENT" : budget.status }).catch(console.error)} className="hidden rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white sm:block">
          {STATUS_LABELS[budget.status]}
        </button>
        <div className="flex rounded-full bg-gray-100 p-1 text-xs">
          <button onClick={() => setMode("internal")} className={`min-h-8 rounded-full px-3 ${mode === "internal" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Internal</button>
          <button onClick={() => setMode("client")} className={`min-h-8 rounded-full px-3 ${mode === "client" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Client</button>
        </div>
        <button onClick={() => exportPdf(mode).catch((err: Error) => setToast(err.message))} className="grid h-9 w-9 place-items-center rounded-md bg-gray-900 text-white" title="Export PDF">
          <Download size={16} />
        </button>
      </header>

      <div className="flex h-9 shrink-0 items-center gap-4 border-b border-gray-100 px-3 text-xs">
        <button onClick={() => setSelectedIds(new Set())} className="text-gray-500">Unselect all</button>
        <button onClick={() => exportPdf("client").catch(console.error)} className="text-gray-700">Print estimate</button>
        <button onClick={() => exportPdf("client").catch(console.error)} className="text-gray-700">Email estimate</button>
        <button onClick={() => createRevision(budget.id, load).catch(console.error)} className="text-gray-700">Revision history</button>
        <button onClick={addSection} className="text-gray-700">+ Add section</button>
        <button onClick={() => setPanel("templates")} className="text-gray-700">Templates</button>
        <button onClick={() => setPanel("cover")} className="ml-auto text-gray-700">Cover page</button>
        <button onClick={() => setPanel("advances")} className="text-gray-700">Advances</button>
      </div>

      <SummaryBar budget={budget} revision={revision} firstAdvance={firstAdvance} onRevisionPatch={patchRevision} />

      <main className="min-h-0 flex-1 overflow-auto">
        {!hasSections ? (
          <TemplatePicker templates={templates} onApply={applyTemplate} />
        ) : (
          <BudgetTable
            revision={revision}
            mode={mode}
            selectedIds={selectedIds}
            onToggleSelected={(id) => {
              const next = new Set(selectedIds);
              if (next.has(id)) next.delete(id); else next.add(id);
              setSelectedIds(next);
            }}
            onSaveLine={saveLine}
            onAddLine={addLine}
            onAddSubItem={addSubItem}
            onDuplicate={duplicateLine}
            onDelete={deleteLine}
            expandedSubCosts={expandedSubCosts}
            onToggleSubCosts={(id) => setExpandedSubCosts(expandedSubCosts === id ? null : id)}
            onRevision={(next) => setRevision(next)}
            onError={(message) => setToast(message)}
          />
        )}
      </main>

      {panel === "cover" && <CoverPanel budget={budget} onClose={() => setPanel(null)} onSave={patchBudget} />}
      {panel === "advances" && <AdvancesPanel budget={budget} totals={revision.totals} onClose={() => setPanel(null)} onChanged={load} />}
      {panel === "templates" && <TemplatePanel templates={templates} onClose={() => setPanel(null)} onApply={applyTemplate} />}
    </div>
  );
}

async function createRevision(budgetId: string, onDone: () => Promise<void>) {
  await api.post(`/api/budgets/${budgetId}/revisions`, {});
  await onDone();
}

function SummaryBar({ budget, revision, firstAdvance, onRevisionPatch }: {
  budget: Budget;
  revision: BudgetRevision;
  firstAdvance: number | null;
  onRevisionPatch: (patch: Partial<BudgetRevision>) => Promise<void>;
}) {
  const totals = revision.totals;
  return (
    <div className="grid min-h-14 shrink-0 grid-cols-2 gap-3 border-b border-gray-200 bg-white px-4 py-2 text-xs md:grid-cols-5">
      <Metric label="Subtotal" value={money(totals.subtotal)} />
      <EditableMetric label={`Production fee ${percentLabel(revision.productionFeePercent)}`} value={money(totals.productionFee)} onSubmit={(value) => onRevisionPatch({ productionFeePercent: value })} />
      <EditableMetric label={`Insurance ${percentLabel(revision.insurancePercent)}`} value={money(totals.insurance)} onSubmit={(value) => onRevisionPatch({ insurancePercent: value })} />
      <Metric label="Grand total" value={money(totals.grandTotal)} strong />
      <Metric label="Advance due" value={firstAdvance !== null ? money(firstAdvance) : "None"} />
      {budget.currencySecondary && totals.currencyConverted && (
        <div className="col-span-2 text-right text-xs text-gray-500 md:col-span-5">
          {budget.currencySecondary}: {totals.currencyConverted.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @ {budget.currencyRate}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`tabular-nums ${strong ? "text-lg font-semibold" : "text-sm font-medium"}`}>{value}</p>
    </div>
  );
}

function EditableMetric({ label, value, onSubmit }: { label: string; value: string; onSubmit: (value: number) => Promise<void> }) {
  return (
    <button
      onClick={() => {
        const next = window.prompt("Percentage", label.match(/([\d.]+)%/)?.[1] ?? "0");
        if (next !== null) onSubmit(Number(next)).catch(console.error);
      }}
      className="text-left"
    >
      <Metric label={label} value={value} />
    </button>
  );
}

function BudgetTable(props: {
  revision: BudgetRevision;
  mode: ViewMode;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onSaveLine: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onAddLine: (section: BudgetSection) => Promise<void>;
  onAddSubItem: (line: BudgetLineItem) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => Promise<void>;
  onDelete: (line: BudgetLineItem) => Promise<void>;
  expandedSubCosts: string | null;
  onToggleSubCosts: (lineId: string) => void;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
}) {
  const internal = props.mode === "internal";
  const grid = internal
    ? "grid-cols-[28px_56px_minmax(180px,1fr)_160px_140px_72px_64px_52px_88px_52px_72px_72px_64px_64px_100px_90px_90px_36px_36px_36px_36px_112px]"
    : "grid-cols-[56px_minmax(180px,1fr)_180px_52px_88px_52px_72px_110px_112px]";

  return (
    <div className="min-w-max">
      <div className={`sticky top-0 z-10 grid h-7 ${grid} border-b border-gray-300 bg-[#f8f8f6] text-[10px] uppercase tracking-wide text-gray-500`}>
        {internal && <HeaderCell />}
        <HeaderCell>Code</HeaderCell>
        <HeaderCell>Description</HeaderCell>
        <HeaderCell>Client notes</HeaderCell>
        {internal && <HeaderCell>Int. notes</HeaderCell>}
        {internal && <HeaderCell right>Prep/trvl</HeaderCell>}
        {internal && <HeaderCell right>Shoot</HeaderCell>}
        <HeaderCell right>Qty</HeaderCell>
        <HeaderCell right>Rate</HeaderCell>
        <HeaderCell right>X</HeaderCell>
        <HeaderCell>Unit</HeaderCell>
        {internal && <HeaderCell right>O/T rate</HeaderCell>}
        {internal && <HeaderCell right>O/T hrs</HeaderCell>}
        {internal && <HeaderCell right>Agency%</HeaderCell>}
        <HeaderCell right>{internal ? "Estimated" : "Budget"}</HeaderCell>
        {internal && <HeaderCell right>Actuals</HeaderCell>}
        {internal && <HeaderCell right>Variance</HeaderCell>}
        {internal && <HeaderCell center>AGR</HeaderCell>}
        {internal && <HeaderCell center>CLO</HeaderCell>}
        {internal && <HeaderCell center>INV</HeaderCell>}
        {internal && <HeaderCell center>PAID</HeaderCell>}
        <HeaderCell />
      </div>

      {props.revision.sections.filter((section) => section.isVisible).map((section) => (
        <SectionBlock key={section.id} section={section} grid={grid} internal={internal} {...props} />
      ))}
    </div>
  );
}

function HeaderCell({ children, right, center }: { children?: React.ReactNode; right?: boolean; center?: boolean }) {
  return <div className={`flex items-center px-2 ${right ? "justify-end" : center ? "justify-center" : ""}`}>{children}</div>;
}

function SectionBlock({ section, grid, internal, ...props }: {
  section: BudgetSection;
  grid: string;
  internal: boolean;
} & Omit<Parameters<typeof BudgetTable>[0], "mode">) {
  const sectionTotal = props.revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
  const remaining = sectionTotal?.remainingBudget ?? 0;
  return (
    <section>
      <div className={`grid h-9 ${grid} bg-[#1a1a1f] text-white`}>
        {internal && <div />}
        <div className="col-span-2 flex items-center gap-2 px-2">
          <span className="grid h-5 min-w-6 place-items-center rounded bg-white/15 px-1 text-[11px] font-semibold">{section.code}</span>
          <span className="text-xs font-semibold uppercase">{section.name}</span>
        </div>
        <div className="col-span-full flex items-center justify-end gap-3 px-3 text-xs">
          <span>{money(sectionTotal?.estimatedTotal)}</span>
          {internal && <span className={`rounded-full bg-white px-2 py-0.5 ${varianceClass(remaining)}`}>remaining {money(remaining)}</span>}
          <button onClick={() => props.onAddLine(section).catch(console.error)} className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"><Plus size={14} /></button>
          <button className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"><MoreHorizontal size={14} /></button>
        </div>
      </div>
      {section.lineItems.filter((line) => !line.parentId).map((line) => (
        <LineRow key={line.id} line={line} grid={grid} internal={internal} {...props} />
      ))}
      {sectionTotal && sectionTotal.estimatedTotal !== 0 && (
        <div className={`grid h-7 ${grid} bg-[#f8f8f6] text-[11px] italic text-gray-500`}>
          {internal && <div />}
          <div className="col-span-2 flex items-center px-2">Section total</div>
          <div className="col-span-full grid grid-cols-3 items-center gap-6 px-3 text-right not-italic tabular-nums">
            <span>{money(sectionTotal.estimatedTotal)}</span>
            {internal && <span>{money(sectionTotal.actualTotal)}</span>}
            {internal && <span className={varianceClass(sectionTotal.variance)}>{money(sectionTotal.variance)}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function LineRow({ line, grid, internal, ...props }: {
  line: BudgetLineItem;
  grid: string;
  internal: boolean;
} & Omit<Parameters<typeof BudgetTable>[0], "revision" | "mode">) {
  const invoiced = line.subCosts.some((item) => item.status === "INVOICED" || item.status === "PAID");
  const paid = line.subCosts.length > 0 && line.subCosts.every((item) => item.status === "PAID");
  const rowClass = line.isSubItem ? "bg-[#fcfcfa] text-xs" : "bg-white text-xs";

  return (
    <>
      <div className={`group grid min-h-9 ${grid} border-b border-gray-100 ${rowClass} hover:bg-gray-50`}>
        {internal && (
          <button onClick={() => props.onToggleSelected(line.id)} className="grid min-h-9 place-items-center">
            <span className={`h-3.5 w-3.5 rounded border ${props.selectedIds.has(line.id) ? "border-gray-900 bg-gray-900" : "border-gray-300"}`} />
          </button>
        )}
        <Cell>{line.lineCode}</Cell>
        <Cell>
          <div className="flex items-center gap-1">
            {line.isSubItem && <span className="text-gray-400">└</span>}
            <EditableText value={line.description} className={line.estimatedTotal === 0 ? "font-normal text-gray-400" : "font-medium text-gray-900"} onSave={(description) => props.onSaveLine(line, { description })} />
          </div>
        </Cell>
        <Cell><EditableText value={line.clientNotes ?? ""} muted onSave={(clientNotes) => props.onSaveLine(line, { clientNotes })} /></Cell>
        {internal && <Cell><EditableText value={line.internalNotes ?? ""} muted onSave={(internalNotes) => props.onSaveLine(line, { internalNotes })} /></Cell>}
        {internal && <NumberCell value={line.prepTravelDays} onSave={(prepTravelDays) => props.onSaveLine(line, { prepTravelDays })} />}
        {internal && <NumberCell value={line.shootDays} onSave={(shootDays) => props.onSaveLine(line, { shootDays })} />}
        <NumberCell value={line.qty} onSave={(qty) => props.onSaveLine(line, { qty: qty ?? 0 })} />
        <MoneyEditCell value={line.rate} onSave={(rate) => props.onSaveLine(line, { rate: rate ?? 0 })} />
        <NumberCell value={line.multiplier} onSave={(multiplier) => props.onSaveLine(line, { multiplier: multiplier ?? 1 })} />
        <Cell><UnitSelect value={line.unit} onSave={(unit) => props.onSaveLine(line, { unit })} /></Cell>
        {internal && <MoneyEditCell value={line.otRate} onSave={(otRate) => props.onSaveLine(line, { otRate })} />}
        {internal && <NumberCell value={line.otHours} onSave={(otHours) => props.onSaveLine(line, { otHours })} />}
        {internal && <NumberCell value={line.agencyFeePercent} suffix onSave={(agencyFeePercent) => props.onSaveLine(line, { agencyFeePercent })} />}
        <Cell right className={`font-medium tabular-nums ${zeroClass(line.estimatedTotal)}`}>{money(line.estimatedTotal)}</Cell>
        {internal && <button onClick={() => props.onToggleSubCosts(line.id)} className={`px-2 text-right tabular-nums ${zeroClass(line.actualTotal)}`}>{money(line.actualTotal)}</button>}
        {internal && <Cell right className={`font-medium tabular-nums ${varianceClass(line.variance)}`}>{money(line.variance)}</Cell>}
        {internal && <StatusToggle active={line.isAgreed} onClick={() => props.onSaveLine(line, { isAgreed: !line.isAgreed })} />}
        {internal && <StatusToggle active={line.isClosed} onClick={() => props.onSaveLine(line, { isClosed: !line.isClosed })} />}
        {internal && <StatusToggle active={invoiced} />}
        {internal && <StatusToggle active={paid} />}
        <div className="flex items-center justify-end gap-1 px-2 opacity-0 group-hover:opacity-100">
          {internal && <button onClick={() => props.onAddSubItem(line).catch(console.error)} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100" title="Add sub-item"><Plus size={14} /></button>}
          {internal && <button onClick={() => props.onToggleSubCosts(line.id)} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100" title="Sub-costs"><ReceiptText size={14} /></button>}
          <button onClick={() => props.onDuplicate(line).catch(console.error)} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100"><Copy size={14} /></button>
          <button onClick={() => props.onDelete(line).catch(console.error)} className="grid h-8 w-8 place-items-center rounded text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
      </div>
      {props.expandedSubCosts === line.id && <SubCostsPanel line={line} onRevision={props.onRevision} onError={props.onError} />}
      {line.children?.map((child) => <LineRow key={child.id} line={child} grid={grid} internal={internal} {...props} />)}
    </>
  );
}

function Cell({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <div className={`flex min-h-9 items-center px-2 ${right ? "justify-end text-right" : ""} ${className}`}>{children}</div>;
}

function EditableText({ value, onSave, muted, className = "" }: { value: string; onSave: (value: string) => Promise<void>; muted?: boolean; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== value) onSave(draft).catch(console.error); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`h-8 w-full border-0 bg-transparent p-0 text-xs outline-none ${className}`}
      />
    );
  }
  return <button onClick={() => setEditing(true)} className={`w-full truncate text-left hover:underline ${muted ? "text-gray-500" : ""} ${className}`}>{value || "—"}</button>;
}

function NumberCell({ value, onSave, suffix }: { value?: number | null; onSave: (value: number | null) => Promise<void>; suffix?: boolean }) {
  return <EditableNumber value={value} onSave={onSave} render={(v) => suffix ? percentLabel(v) : String(v ?? "")} />;
}

function MoneyEditCell({ value, onSave }: { value?: number | null; onSave: (value: number | null) => Promise<void> }) {
  return <EditableNumber value={value} onSave={onSave} render={(v) => money(v)} />;
}

function EditableNumber({ value, onSave, render }: { value?: number | null; onSave: (value: number | null) => Promise<void>; render: (value?: number | null) => string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === null || value === undefined ? "" : String(value)), [value]);
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const next = draft === "" ? null : Number(draft);
          if (next !== value) onSave(next).catch(console.error);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value === null || value === undefined ? "" : String(value)); setEditing(false); }
        }}
        className="h-8 w-full border-0 bg-transparent p-0 text-right text-xs tabular-nums outline-none"
      />
    );
  }
  return <button onClick={() => setEditing(true)} className={`min-h-9 w-full px-2 text-right tabular-nums ${zeroClass(value)}`}>{render(value)}</button>;
}

function UnitSelect({ value, onSave }: { value: string; onSave: (value: string) => Promise<void> }) {
  return (
    <select value={value} onChange={(e) => onSave(e.target.value).catch(console.error)} className="h-8 w-full appearance-none border-0 bg-transparent text-xs outline-none">
      {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
    </select>
  );
}

function StatusToggle({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="grid min-h-9 place-items-center text-xs">
      {active ? <Check size={15} className="text-emerald-700" /> : <span className="h-3.5 w-3.5 rounded-full border border-gray-300" />}
    </button>
  );
}

function SubCostsPanel({ line, onRevision, onError }: { line: BudgetLineItem; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const [form, setForm] = useState({ description: "", supplierName: "", amount: "", vatRate: "" });
  async function addSubCost() {
    try {
      const response = await api.post<SubCostMutationResponse>(`/api/budgets/lines/${line.id}/subcosts`, {
        description: form.description || "Sub-cost",
        supplierName: form.supplierName || null,
        amount: Number(form.amount || 0),
        vatRate: form.vatRate ? Number(form.vatRate) : null,
        vatAmount: form.vatRate ? Number(form.amount || 0) * (Number(form.vatRate) / 100) : null,
        status: "AGREED" as SubCostStatus,
      });
      if (response.revision) onRevision(response.revision);
      setForm({ description: "", supplierName: "", amount: "", vatRate: "" });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add sub-cost");
    }
  }

  return (
    <div className="ml-8 border-l-4 border-gray-300 bg-[#fafaf8] px-4 py-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold">Sub-costs / Expenses <span className="ml-2 text-gray-500">Total: {money(line.actualTotal)}</span></p>
        <button onClick={addSubCost} className="min-h-9 rounded bg-gray-900 px-3 text-white">+ Add sub-cost</button>
      </div>
      <div className="space-y-1">
        {line.subCosts.map((subCost) => <SubCostRow key={subCost.id} subCost={subCost} onRevision={onRevision} onError={onError} />)}
        {line.subCosts.length === 0 && <p className="py-2 text-gray-500">No sub-costs yet.</p>}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_120px_80px_90px]">
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="h-9 rounded border border-gray-200 px-2" />
        <input value={form.supplierName} onChange={(e) => setForm({ ...form, supplierName: e.target.value })} placeholder="Supplier" className="h-9 rounded border border-gray-200 px-2" />
        <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount ex-VAT" type="number" className="h-9 rounded border border-gray-200 px-2" />
        <input value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} placeholder="VAT%" type="number" className="h-9 rounded border border-gray-200 px-2" />
        <button onClick={addSubCost} className="min-h-9 rounded bg-gray-900 px-3 text-white">Save</button>
      </div>
    </div>
  );
}

function SubCostRow({ subCost, onRevision, onError }: { subCost: SubCost; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  async function cycleStatus() {
    const order: SubCostStatus[] = ["PENDING", "AGREED", "INVOICED", "PAID"];
    const next = order[(order.indexOf(subCost.status) + 1) % order.length];
    try {
      const response = await api.patch<SubCostMutationResponse>(`/api/budgets/subcosts/${subCost.id}/status`, { status: next });
      if (response.revision) onRevision(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update sub-cost");
    }
  }
  return (
    <div className="grid min-h-8 grid-cols-[90px_1fr_140px_110px_80px_44px] items-center gap-2 border-b border-gray-100">
      <button onClick={cycleStatus} className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusClass(subCost.status)}`}>{subCost.status}</button>
      <span>{subCost.receiptCaptureId && <ReceiptText size={12} className="mr-1 inline" />}{subCost.description}</span>
      <span className="text-gray-500">{subCost.supplierName}</span>
      <span className="text-right tabular-nums">{money(subCost.amount)}</span>
      <span className="text-right text-gray-400">{subCost.vatAmount ? money(subCost.vatAmount) : ""}</span>
      <FileText size={14} className="text-gray-400" />
    </div>
  );
}

function statusClass(status: SubCostStatus) {
  if (status === "PAID") return "bg-emerald-100 text-emerald-800";
  if (status === "INVOICED") return "bg-amber-100 text-amber-800";
  if (status === "AGREED") return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-600";
}

function TemplatePicker({ templates, onApply }: { templates: SectionTemplate[]; onApply: (templateId: string) => Promise<void> }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h2 className="text-lg font-semibold">Choose a template to start</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {templates.map((template) => (
          <button key={template.id} onClick={() => onApply(template.id).catch(console.error)} className="min-h-28 rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-gray-900">
            <p className="text-sm font-semibold">{template.name}</p>
            <p className="mt-2 text-xs text-gray-500">{template.description}</p>
            <p className="mt-3 text-xs text-gray-400">{template.sections.length} sections</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplatePanel({ templates, onClose, onApply }: { templates: SectionTemplate[]; onClose: () => void; onApply: (templateId: string) => Promise<void> }) {
  return (
    <SidePanel title="Section templates" onClose={onClose}>
      <div className="space-y-3">
        {templates.map((template) => (
          <div key={template.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold">{template.name}</p>
            <p className="text-xs text-gray-500">{template.description}</p>
            <button onClick={() => onApply(template.id).catch(console.error)} className="mt-3 min-h-10 rounded bg-gray-900 px-3 text-sm text-white">Apply template</button>
          </div>
        ))}
      </div>
    </SidePanel>
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
    ["comments", "Comments", "textarea"],
    ["caveats", "Caveats", "textarea"],
    ["usages", "Usages", "textarea"],
  ];
  return (
    <SidePanel title="Cover page" onClose={onClose}>
      <div className="space-y-3">
        {fields.map(([key, label, kind]) => (
          <label key={String(key)} className="block text-xs font-medium text-gray-500">
            {label}
            {kind === "textarea" ? (
              <textarea defaultValue={String(budget[key] ?? "")} onBlur={(e) => onSave({ [key]: e.target.value } as Partial<Budget>).catch(console.error)} className="mt-1 min-h-20 w-full rounded border border-gray-200 p-2 text-sm text-gray-900" />
            ) : (
              <input defaultValue={String(budget[key] ?? "")} onBlur={(e) => onSave({ [key]: e.target.value } as Partial<Budget>).catch(console.error)} className="mt-1 h-10 w-full rounded border border-gray-200 px-2 text-sm text-gray-900" />
            )}
          </label>
        ))}
      </div>
    </SidePanel>
  );
}

function AdvancesPanel({ budget, totals, onClose, onChanged }: { budget: Budget; totals: BudgetRevision["totals"]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ label: "75% Advance", calculationType: "PERCENT_OF_TOTAL" as AdvanceCalcType, percent: "75", amount: "", dueDate: "" });
  async function addAdvance() {
    await api.post(`/api/budgets/${budget.id}/advances`, {
      label: form.label,
      calculationType: form.calculationType,
      percent: form.calculationType === "FIXED_AMOUNT" ? null : Number(form.percent || 0),
      amount: form.calculationType === "FIXED_AMOUNT" ? Number(form.amount || 0) : null,
      dueDate: form.dueDate || null,
    });
    await onChanged();
  }
  return (
    <SidePanel title="Advance invoices" onClose={onClose}>
      <div className="space-y-2">
        {budget.advanceInvoices.map((advance) => (
          <AdvanceRow key={advance.id} advance={advance} calculated={totals.advances.find((item) => item.id === advance.id)?.calculatedAmount ?? advance.calculatedAmount ?? 0} onChanged={onChanged} />
        ))}
      </div>
      <div className="mt-5 space-y-2 border-t border-gray-200 pt-4">
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="h-10 w-full rounded border border-gray-200 px-2 text-sm" />
        <select value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value as AdvanceCalcType })} className="h-10 w-full rounded border border-gray-200 px-2 text-sm">
          <option value="PERCENT_OF_TOTAL">% of Grand Total</option>
          <option value="PERCENT_OF_PRODUCTION">% of Production Subtotal</option>
          <option value="FIXED_AMOUNT">Fixed £ amount</option>
        </select>
        <input value={form.calculationType === "FIXED_AMOUNT" ? form.amount : form.percent} onChange={(e) => form.calculationType === "FIXED_AMOUNT" ? setForm({ ...form, amount: e.target.value }) : setForm({ ...form, percent: e.target.value })} type="number" className="h-10 w-full rounded border border-gray-200 px-2 text-sm" />
        <input value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} type="date" className="h-10 w-full rounded border border-gray-200 px-2 text-sm" />
        <button onClick={addAdvance} className="min-h-11 w-full rounded bg-gray-900 text-sm text-white">Add advance</button>
      </div>
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
    <div className="grid grid-cols-[1fr_auto] gap-2 rounded border border-gray-200 p-3 text-sm">
      <div>
        <p className="font-medium">{advance.label}</p>
        <p className="text-xs text-gray-500">{advance.calculationType.replace(/_/g, " ")} {advance.percent ?? advance.amount ?? ""}</p>
      </div>
      <div className="text-right">
        <p className="font-medium tabular-nums">{money(calculated)}</p>
        <button onClick={togglePaid} className={`mt-1 rounded-full px-2 py-1 text-[10px] ${advance.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{advance.isPaid ? "paid" : "unpaid"}</button>
        <button onClick={remove} className="ml-2 text-red-600"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

function SidePanel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <aside className="fixed inset-y-0 right-0 z-[55] w-full max-w-[420px] overflow-auto border-l border-gray-200 bg-white p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded hover:bg-gray-100"><X size={18} /></button>
      </div>
      {children}
    </aside>
  );
}
