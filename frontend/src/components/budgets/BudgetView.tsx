import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronRight, Copy, Download, MoreHorizontal, Paperclip, Plus, Trash2, X } from "lucide-react";
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
  SubCostLineType,
} from "../../lib/types";
import { BUDGET_GRID_CLIENT, BUDGET_GRID_INTERNAL, BUDGET_TABLE_CLIENT_WIDTH, BUDGET_TABLE_INTERNAL_WIDTH } from "./budgetLayout";
import { COST_LINE_BACKGROUNDS, DOT_COLORS, STATE_BADGES, getDotState, type DotState } from "./budgetStatus";

type Entity = { type: "production" | "opportunity"; id: string; label?: string; data?: unknown };
type ViewMode = "internal" | "client";
type Panel = "cover" | "advances" | "templates" | null;
type LineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };
type SubCostMutationResponse = { subCost: SubCost; revision: BudgetRevision | null };
type EditableKind = "text" | "number" | "money" | "percent";
type AddingCostLine = { lineId: string; lineType: SubCostLineType };
type ParentContextMenu = { lineId: string; x: number; y: number } | null;

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

function gridStyle(mode: ViewMode): CSSProperties {
  return { gridTemplateColumns: mode === "internal" ? BUDGET_GRID_INTERNAL : BUDGET_GRID_CLIENT };
}

function statusSymbol(active: boolean) {
  return active ? <span className="font-semibold text-[#16a34a]">✓</span> : <span className="text-[#d4d4d0]">○</span>;
}

function lineTypeClass(lineType: SubCostLineType) {
  if (lineType === "BILL") return "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb]";
  if (lineType === "RECEIPT") return "border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]";
  return "border-[#ddd6fe] bg-[#f5f3ff] text-[#7c3aed]";
}

function lineTypeLabel(lineType: SubCostLineType) {
  return lineType;
}

function stateCounts(revision: BudgetRevision) {
  const counts: Record<DotState, number> = { YELLOW: 0, PURPLE: 0, BLUE: 0, LIGHT_GREEN: 0, DARK_GREEN: 0, GRAY: 0 };
  for (const section of revision.sections) {
    for (const line of section.lineItems) {
      if (!line.parentId) counts[getDotState(line)] += 1;
    }
  }
  return counts;
}

export default function BudgetView({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [revision, setRevision] = useState<BudgetRevision | null>(null);
  const [revisions, setRevisions] = useState<BudgetRevisionSummary[]>([]);
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [mode, setMode] = useState<ViewMode>("internal");
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addingCostLine, setAddingCostLine] = useState<AddingCostLine | null>(null);
  const [blankStarted, setBlankStarted] = useState(false);

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
      days: 1,
      rate: 0,
      unit: "Days",
    });
    if (response.revision) setRevision(response.revision);
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

  async function duplicateLine(line: BudgetLineItem) {
    const response = await api.post<LineMutationResponse>(`/api/budgets/lines/${line.id}/duplicate`, {});
    if (response.revision) setRevision(response.revision);
  }

  async function deleteLine(line: BudgetLineItem) {
    if (!window.confirm(`Delete ${line.description}?`)) return;
    await api.delete(`/api/budgets/lines/${line.id}`);
    await load();
  }

  async function applyTemplate(templateId: string) {
    if (!revision) return;
    const updated = await api.post<BudgetRevision>(`/api/budgets/revisions/${revision.id}/apply-template`, { templateId });
    setRevision(updated);
    setBlankStarted(false);
    setPanel(null);
  }

  async function exportPdf(exportMode: "client" | "internal") {
    if (!revision) return;
    await api.post(`/api/budgets/revisions/${revision.id}/export-pdf`, { mode: exportMode });
    setToast("PDF exported.");
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

  const showTemplatePicker = revision.sections.length === 0 && !blankStarted;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-[#1a1a1f]">
      {toast && (
        <button onClick={() => setToast(null)} className="fixed bottom-4 right-4 z-[70] rounded-md bg-[#1a1a1f] px-3 py-2 text-xs text-white shadow-lg">
          {toast}
        </button>
      )}

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#e8e8e4] bg-white px-3">
        <button onClick={onBack} className="flex min-h-11 items-center gap-1 text-[13px] text-gray-700">
          <ArrowLeft size={15} /> {entityLabel}
        </button>
        <select value={revision.id} onChange={(e) => openRevision(e.target.value).catch(console.error)} className="mx-auto h-8 max-w-[220px] rounded-full border border-[#e8e8e4] bg-white px-3 text-xs">
          {revisions.map((item) => <option key={item.id} value={item.id}>{item.label} — {STATUS_LABELS[item.status]}</option>)}
        </select>
        <button onClick={() => patchBudget({ status: budget.status === "DRAFT" ? "SENT" : budget.status }).catch(console.error)} className="hidden rounded-full bg-[#1a1a1f] px-3 py-1 text-[11px] font-medium text-white sm:block">
          {STATUS_LABELS[budget.status]}
        </button>
        <div className="flex rounded-full bg-[#f5f5f3] p-0.5 text-[11px]">
          <button onClick={() => setMode("internal")} className={`min-h-8 rounded-full px-3 ${mode === "internal" ? "bg-[#1a1a1f] text-white" : "text-gray-500"}`}>Internal</button>
          <button onClick={() => setMode("client")} className={`min-h-8 rounded-full px-3 ${mode === "client" ? "bg-[#1a1a1f] text-white" : "text-gray-500"}`}>Client</button>
        </div>
        <button onClick={() => exportPdf(mode).catch((err: Error) => setToast(err.message))} className="grid h-9 w-9 place-items-center rounded-md bg-[#1a1a1f] text-white" title="Export PDF">
          <Download size={15} />
        </button>
      </header>

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#e8e8e4] bg-[#f8f8f6] px-3 text-[11px] text-gray-500">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <button onClick={() => exportPdf("client").catch(console.error)} className="whitespace-nowrap hover:text-[#1a1a1f]">Print estimate</button>
          <span>·</span>
          <button onClick={() => exportPdf("client").catch(console.error)} className="whitespace-nowrap hover:text-[#1a1a1f]">Email estimate</button>
          <span>·</span>
          <button onClick={() => createRevision(budget.id, load).catch(console.error)} className="whitespace-nowrap hover:text-[#1a1a1f]">Revision history</button>
        </div>
        <div className="ml-4 flex min-w-max items-center gap-2">
          <button onClick={addSection} className="hover:text-[#1a1a1f]">+ Add section</button>
          <span>·</span>
          <button onClick={() => revision.sections[0] && addLine(revision.sections[0]).catch(console.error)} className="hover:text-[#1a1a1f]">+ Add line</button>
          <span>·</span>
          <button onClick={() => setPanel("templates")} className="hover:text-[#1a1a1f]">Templates</button>
          <span>·</span>
          <button onClick={() => setPanel("cover")} className="hover:text-[#1a1a1f]">Cover page</button>
          <span>·</span>
          <button onClick={() => setPanel("advances")} className="hover:text-[#1a1a1f]">Advances</button>
        </div>
      </div>

      <SummaryBar revision={revision} firstAdvance={firstAdvance} onRevisionPatch={patchRevision} />

      <main className="min-h-0 flex-1 overflow-auto">
        {showTemplatePicker ? (
          <TemplatePicker templates={templates} onApply={applyTemplate} onBlank={() => setBlankStarted(true)} />
        ) : (
          <BudgetTable
            revision={revision}
            mode={mode}
            addingCostLine={addingCostLine}
            onSetAddingCostLine={setAddingCostLine}
            onSaveLine={saveLine}
            onAddLine={addLine}
            onDuplicate={duplicateLine}
            onDelete={deleteLine}
            onRevision={(next) => setRevision(next)}
            onError={(message) => setToast(message)}
            onOpenTemplates={() => setPanel("templates")}
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

function SummaryBar({ revision, firstAdvance, onRevisionPatch }: {
  revision: BudgetRevision;
  firstAdvance: number | null;
  onRevisionPatch: (patch: Partial<BudgetRevision>) => Promise<void>;
}) {
  const totals = revision.totals;
  const counts = stateCounts(revision);
  const hasOpenCounts = counts.YELLOW + counts.PURPLE + counts.BLUE + counts.LIGHT_GREEN > 0;
  return (
    <div className="shrink-0 border-b border-t border-[#e8e8e4] bg-white px-4 py-2">
      <div className="grid grid-cols-2 gap-y-2 md:grid-cols-5">
        <Metric label="Subtotal" value={money(totals.subtotal)} />
        <EditableMetric label={`Production fee ${percentLabel(revision.productionFeePercent)}`} value={money(totals.productionFee)} current={revision.productionFeePercent} onSubmit={(value) => onRevisionPatch({ productionFeePercent: value })} />
        <EditableMetric label={`Insurance ${percentLabel(revision.insurancePercent)}`} value={money(totals.insurance)} current={revision.insurancePercent} onSubmit={(value) => onRevisionPatch({ insurancePercent: value })} />
        <Metric label="Grand total" value={money(totals.grandTotal)} grand />
        <Metric label="Advance due" value={firstAdvance !== null ? money(firstAdvance) : "None"} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        {counts.YELLOW > 0 && <StateCount color={DOT_COLORS.YELLOW} className="text-[#d97706]" label={`${counts.YELLOW} need POs`} />}
        {counts.PURPLE > 0 && <StateCount color={DOT_COLORS.PURPLE} className="text-[#8b5cf6]" label={`${counts.PURPLE} POs outstanding`} />}
        {counts.BLUE > 0 && <StateCount color={DOT_COLORS.BLUE} className="text-[#3b82f6]" label={`${counts.BLUE} invoices to pay`} />}
        {counts.LIGHT_GREEN > 0 && <StateCount color={DOT_COLORS.LIGHT_GREEN} className="text-[#16a34a]" label={`${counts.LIGHT_GREEN} unreconciled`} />}
        {!hasOpenCounts && <span className="text-[#16a34a]">All lines reconciled ✓</span>}
      </div>
    </div>
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

function Metric({ label, value, grand = false }: { label: string; value: string; grand?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] uppercase tracking-[0.5px] text-[#aaa]">{label}</p>
      <p className={`tabular-nums ${grand ? "text-xl font-semibold text-[#1a1a1f]" : "text-base font-medium text-[#1a1a1f]"}`}>{value}</p>
    </div>
  );
}

function EditableMetric({ label, value, current, onSubmit }: { label: string; value: string; current: number; onSubmit: (value: number) => Promise<void> }) {
  return (
    <button
      onClick={() => {
        const next = window.prompt("Percentage", String(current));
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
  addingCostLine: AddingCostLine | null;
  onSetAddingCostLine: (costLine: AddingCostLine | null) => void;
  onSaveLine: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onAddLine: (section: BudgetSection) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => Promise<void>;
  onDelete: (line: BudgetLineItem) => Promise<void>;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
  onOpenTemplates: () => void;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [toggledCostLines, setToggledCostLines] = useState<Set<string>>(new Set());
  const [parentMenu, setParentMenu] = useState<ParentContextMenu>(null);
  const internal = props.mode === "internal";
  const tableWidth = internal ? BUDGET_TABLE_INTERNAL_WIDTH : BUDGET_TABLE_CLIENT_WIDTH;
  const menuLine = parentMenu
    ? props.revision.sections.flatMap((section) => section.lineItems).find((line) => line.id === parentMenu.lineId)
    : null;

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

  return (
    <div className="budget-table w-full overflow-x-auto">
      <div className="budget-table-inner" style={{ width: tableWidth, minWidth: tableWidth }}>
      <div className="sticky top-0 z-20 grid h-7 items-center border-b border-[#e8e8e4] bg-[#f8f8f6] text-[10px] uppercase tracking-[0.5px] text-[#aaa]" style={gridStyle(props.mode)}>
        {internal && <HeaderCell center />}
        <HeaderCell>Code</HeaderCell>
        <HeaderCell>Description</HeaderCell>
        <HeaderCell>Client notes</HeaderCell>
        {internal && <HeaderCell>Int. notes</HeaderCell>}
        <HeaderCell right>Qty</HeaderCell>
        <HeaderCell>Unit</HeaderCell>
        <HeaderCell right>Rate</HeaderCell>
        {internal && <HeaderCell right>Agy%</HeaderCell>}
        <HeaderCell right>{internal ? "Estimated" : "Budget"}</HeaderCell>
        {internal && <HeaderCell right>Actuals</HeaderCell>}
        {internal && <HeaderCell right>Remaining</HeaderCell>}
        {internal && <HeaderCell center title="Close this line when fully settled">CLO</HeaderCell>}
      </div>

      {props.revision.sections.filter((section) => section.isVisible).map((section) => {
        const collapsed = collapsedSections.has(section.id);
        return (
          <SectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            toggledCostLines={toggledCostLines}
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
            internal={internal}
            {...props}
          />
        );
      })}
      {internal && parentMenu && menuLine && !menuLine.isClosed && (
        <div
          className="fixed z-[80] flex items-center gap-1 rounded-md border border-[#e8e8e4] bg-white p-1 shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          style={{ left: parentMenu.x, top: parentMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <CostLineAddButton lineType="PO" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "PO" }); setParentMenu(null); }} />
          <CostLineAddButton lineType="BILL" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "BILL" }); setParentMenu(null); }} />
          <CostLineAddButton lineType="RECEIPT" onClick={() => { props.onSetAddingCostLine({ lineId: menuLine.id, lineType: "RECEIPT" }); setParentMenu(null); }} />
        </div>
      )}
      </div>
    </div>
  );
}

function HeaderCell({ children, right, center, title }: { children?: ReactNode; right?: boolean; center?: boolean; title?: string }) {
  return <div title={title} className={`flex items-center px-2 ${right ? "justify-end text-right" : center ? "justify-center" : ""}`}>{children}</div>;
}

function SectionBlock({ section, collapsed, toggledCostLines, onToggleSection, onToggleCostLines, internal, ...props }: {
  section: BudgetSection;
  collapsed: boolean;
  toggledCostLines: Set<string>;
  onToggleSection: () => void;
  onToggleCostLines: (lineId: string) => void;
  onOpenParentMenu: (line: BudgetLineItem, x: number, y: number) => void;
  internal: boolean;
} & Omit<Parameters<typeof BudgetTable>[0], "mode">) {
  const sectionTotal = props.revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
  const estimated = sectionTotal?.estimatedTotal ?? 0;
  const actual = sectionTotal?.actualTotal ?? 0;
  const remaining = sectionTotal?.remainingBudget ?? 0;
  const topLevelLines = section.lineItems.filter((line) => !line.parentId);
  const dots = topLevelLines.slice(0, 10).map((line) => getDotState(line));
  const overflowCount = Math.max(0, topLevelLines.length - dots.length);

  return (
    <section>
      <button onClick={onToggleSection} className="flex h-9 w-full items-center bg-[#1a1a1f] px-3 text-left text-white">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-white/15 text-[10px] font-medium">{section.code}</span>
          <span className="truncate text-xs font-medium uppercase">{section.name}</span>
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
          {internal && (
            <div className="ml-3 flex items-center gap-[3px]">
              {dots.map((state, index) => <span key={`${section.id}-${index}`} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOT_COLORS[state] }} title={state.toLowerCase()} />)}
              {overflowCount > 0 && <span className="ml-1 text-[10px] text-white/70">+{overflowCount}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 text-xs">
          <span className="font-medium tabular-nums">{money(estimated)}</span>
          {internal && <span className={`rounded-full px-2 py-0.5 text-[10px] ${remainingPillClass(remaining, estimated)}`}>Remaining {money(remaining)}</span>}
          <button
            onClick={(event) => { event.stopPropagation(); props.onAddLine(section).catch(console.error); }}
            className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"
            title="Add line"
          >
            <Plus size={14} />
          </button>
          <button onClick={(event) => event.stopPropagation()} className="grid h-8 w-8 place-items-center text-base" title="Section menu"><MoreHorizontal size={15} /></button>
        </div>
      </button>

      {!collapsed && topLevelLines.length === 0 && (
        <div className="flex h-9 items-center justify-center gap-2 bg-[#fafaf8] text-[11px] text-gray-500">
          <span>No items —</span>
          <button onClick={props.onOpenTemplates} className="text-[#1a1a1f] underline">Browse templates</button>
          <span>or</span>
          <button onClick={() => props.onAddLine(section).catch(console.error)} className="text-[#1a1a1f] underline">+ Add line</button>
        </div>
      )}

      {!collapsed && topLevelLines.map((line) => (
        <ParentLineRow
          key={line.id}
          line={line}
          internal={internal}
          toggledCostLines={toggledCostLines.has(line.id)}
          onToggleCostLines={() => onToggleCostLines(line.id)}
          {...props}
        />
      ))}

      {internal && sectionTotal && estimated !== 0 && (
        <div className="grid h-7 items-center border-t border-[#e0e0dc] bg-[#f0f0ee] text-[11px] text-gray-500" style={gridStyle("internal")}>
          <div />
          <div />
          <div className="flex items-center px-2 italic">Section total</div>
          <div className="col-span-6" />
          <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(estimated)}</div>
          <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(actual)}</div>
          <div className={`flex items-center justify-end px-2 font-medium not-italic tabular-nums ${remainingClass(remaining, estimated)}`}>{money(remaining)}</div>
          <div />
        </div>
      )}
    </section>
  );
}

function ParentLineRow({ line, internal, toggledCostLines, onToggleCostLines, ...props }: {
  line: BudgetLineItem;
  internal: boolean;
  toggledCostLines: boolean;
  onToggleCostLines: () => void;
  onOpenParentMenu: (line: BudgetLineItem, x: number, y: number) => void;
} & Omit<Parameters<typeof BudgetTable>[0], "revision" | "mode">) {
  const state = getDotState(line);
  const hasSubCosts = line.subCosts.length > 0;
  const actualClass = hasSubCosts ? "text-blue-600" : moneyClass(line.actualTotal);
  const autoExpanded = state === "PURPLE" || state === "BLUE";
  const costLinesExpanded = hasSubCosts && (autoExpanded ? !toggledCostLines : toggledCostLines);
  const rowStyle = internal
    ? { ...gridStyle("internal"), background: state === "GRAY" ? "var(--color-background-secondary, #f8f8f6)" : "var(--color-background-primary, #ffffff)", opacity: state === "GRAY" ? 0.55 : 1 }
    : gridStyle("client");
  const closed = state === "GRAY";

  return (
    <div className="group/line">
      <div
        className="group relative grid min-h-[34px] items-center border-b border-[#ebebea] text-xs hover:bg-[#f5f5f3]"
        style={rowStyle}
        onContextMenu={(event) => {
          if (!internal || closed) return;
          event.preventDefault();
          props.onOpenParentMenu(line, event.clientX, event.clientY);
        }}
      >
        {internal && <StatusDot state={state} />}
        <div className="flex items-center gap-1 px-2 text-[11px] text-[#888]">
          {internal && (
            <button onClick={(event) => { event.stopPropagation(); onToggleCostLines(); }} className={`grid h-5 w-4 place-items-center text-[#888] ${hasSubCosts ? "" : "opacity-0 group-hover:opacity-100"}`}>
              {costLinesExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          )}
          <span>{line.lineCode}</span>
        </div>
        <LineDescriptionCell line={line} state={state} internal={internal} readOnly={closed} onSave={(description) => props.onSaveLine(line, { description })} />
        <Cell><EditableCell value={line.clientNotes ?? ""} onSave={(value) => props.onSaveLine(line, { clientNotes: String(value) })} className="italic text-[#888]" readOnly={closed} /></Cell>
        {internal && <Cell><EditableCell value={line.internalNotes ?? ""} onSave={(value) => props.onSaveLine(line, { internalNotes: String(value) })} className="text-[#aaa]" readOnly={closed} /></Cell>}
        <NumberCell value={line.qty} onSave={(value) => props.onSaveLine(line, { qty: value ?? 0 })} readOnly={closed} />
        <Cell>
          <UnitDaysCell
            days={line.days}
            unit={line.unit}
            readOnly={closed}
            onSaveDays={(days) => props.onSaveLine(line, { days })}
            onSaveUnit={(unit) => props.onSaveLine(line, { unit, days: unit === "Flat Fee" ? 1 : line.days })}
          />
        </Cell>
        <MoneyCell value={line.rate} onSave={(value) => props.onSaveLine(line, { rate: value ?? 0 })} readOnly={closed} />
        {internal && <PercentCell value={line.agencyFeePercent} onSave={(value) => props.onSaveLine(line, { agencyFeePercent: value ?? 0 })} readOnly={closed} className={Number(line.agencyFeePercent ?? 0) > 0 ? "text-[#d97706]" : ""} />}
        <EstimatedCell line={line} />
        {internal && <ReadMoney value={line.actualTotal} className={actualClass} />}
        {internal && <ReadMoney value={line.variance} className={remainingClass(line.variance, line.estimatedTotal)} />}
        {internal && <StatusButton active={line.isClosed} onClick={() => props.onSaveLine(line, { isClosed: !line.isClosed }).catch(console.error)} title="Close this line when fully settled" />}
        {internal && (
          <div className="absolute inset-y-0 right-0 flex items-center justify-end gap-1 bg-[#f5f5f3]/95 px-2 opacity-0 group-hover:opacity-100">
            <button onClick={() => props.onDuplicate(line).catch(console.error)} className="grid h-7 w-7 place-items-center rounded text-[#888] hover:bg-gray-100" title="Duplicate"><Copy size={13} /></button>
            <button onClick={() => props.onDelete(line).catch(console.error)} className="grid h-7 w-7 place-items-center rounded text-[#888] hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
          </div>
        )}
      </div>

      {internal && costLinesExpanded && line.subCosts.map((subCost) => (
        <SubCostRow key={subCost.id} subCost={subCost} closed={closed} onRevision={props.onRevision} onError={props.onError} />
      ))}
      {internal && props.addingCostLine?.lineId === line.id && (
        <SubCostDraftRow lineId={line.id} initialLineType={props.addingCostLine.lineType} onCancel={() => props.onSetAddingCostLine(null)} onRevision={(next) => { props.onRevision(next); props.onSetAddingCostLine(null); }} onError={props.onError} />
      )}
    </div>
  );
}

function Cell({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`flex min-h-[34px] items-center px-2 ${className}`}>{children}</div>;
}

function ReadMoney({ value, strong, className }: { value: number | null | undefined; strong?: boolean; className?: string }) {
  return <div className={`flex min-h-[34px] items-center justify-end px-2 text-right tabular-nums ${strong ? "font-medium" : ""} ${className ?? moneyClass(value)}`}>{money(value)}</div>;
}

function StatusDot({ state }: { state: DotState }) {
  return (
    <div className="flex min-h-[34px] w-6 items-center justify-center">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DOT_COLORS[state] }} />
    </div>
  );
}

function LineDescriptionCell({ line, state, internal, readOnly, onSave }: { line: BudgetLineItem; state: DotState; internal: boolean; readOnly: boolean; onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(line.description);
  useEffect(() => setDraft(line.description), [line.description]);
  const badge = STATE_BADGES[state];
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
          className="h-7 w-full border-0 border-b border-blue-500 bg-transparent p-0 text-xs font-medium outline-none"
        />
      </Cell>
    );
  }

  return (
    <Cell>
      <button disabled={readOnly} onClick={() => setEditing(true)} className={`flex min-w-0 items-center text-left text-xs font-medium ${textClass}`}>
        <span className="truncate">{line.description || "—"}</span>
        {internal && (
          <span
            className="ml-2 inline-block whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: badge.bg, color: badge.color, borderColor: badge.border }}
          >
            {badge.text}
          </span>
        )}
      </button>
    </Cell>
  );
}

function EditableCell({ value, onSave, className = "", kind = "text", readOnly = false }: { value: string | number | null | undefined; onSave: (value: string | number | null) => Promise<void>; className?: string; kind?: EditableKind; readOnly?: boolean }) {
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
        className={`h-7 w-full border-0 border-b border-blue-500 bg-transparent p-0 text-xs outline-none ${kind === "text" ? "text-left" : "text-right tabular-nums"} ${className}`}
      />
    );
  }

  const display = kind === "money" ? money(Number(value ?? 0)) : kind === "percent" ? percentLabel(Number(value ?? 0)) : kind === "number" ? numeric(Number(value ?? 0)) : String(value || "");
  if (readOnly) {
    return <div className={`min-h-[30px] w-full truncate text-left ${kind !== "text" ? "text-right tabular-nums" : ""} ${Number(value ?? 1) === 0 && kind !== "text" ? "text-[#c8c8c4]" : ""} ${className}`}>{display || (kind === "text" ? "—" : "")}</div>;
  }
  return (
    <button
      data-budget-editable="true"
      onClick={() => setEditing(true)}
      className={`min-h-[30px] w-full truncate text-left ${kind !== "text" ? "text-right tabular-nums" : ""} ${flash ? "bg-[#eef5ff]" : ""} ${Number(value ?? 1) === 0 && kind !== "text" ? "text-[#c8c8c4]" : ""} ${className}`}
    >
      {display || (kind === "text" ? "—" : "")}
    </button>
  );
}

function NumberCell({ value, onSave, readOnly = false }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="number" readOnly={readOnly} /></Cell>;
}

function MoneyCell({ value, onSave, readOnly = false }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="money" readOnly={readOnly} /></Cell>;
}

function PercentCell({ value, onSave, readOnly = false, className = "" }: { value?: number | null; onSave: (value: number | null) => Promise<void>; readOnly?: boolean; className?: string }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="percent" readOnly={readOnly} className={className} /></Cell>;
}

function UnitDaysCell({ days, unit, onSaveDays, onSaveUnit, readOnly = false }: {
  days: number;
  unit: string;
  onSaveDays: (value: number) => Promise<void>;
  onSaveUnit: (value: string) => Promise<void>;
  readOnly?: boolean;
}) {
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
            className="h-7 w-8 border-0 border-b border-blue-500 bg-transparent p-0 text-right text-xs outline-none"
          />
        ) : (
          <button disabled={readOnly} data-budget-editable="true" onClick={() => setEditingDays(true)} className={Number(days ?? 0) === 0 ? "text-[#c8c8c4]" : ""}>
            {numeric(days) || "0"}
          </button>
        )
      )}
      <button disabled={readOnly} onClick={() => setOpen(!open)} className="flex min-h-[30px] items-center gap-1 text-xs">
        <span>{unit}</span><span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-40 w-32 rounded border border-[#e8e8e4] bg-white py-1 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          {UNITS.map((option) => (
            <button
              key={option}
              onClick={() => { onSaveUnit(option).catch(console.error); setOpen(false); }}
              className={`block h-[30px] w-full px-2 text-left hover:bg-[#f5f5f3] ${option === unit ? "bg-[#1a1a1f] text-white" : ""}`}
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
      <div className="pointer-events-none absolute bottom-8 right-1 z-40 hidden w-max min-w-48 rounded border border-[#e8e8e4] bg-white px-3 py-2 text-left text-[11px] leading-[1.6] text-[#1a1a1f] shadow-[0_4px_12px_rgba(0,0,0,0.1)] group-hover/estimated:block">
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
    <button title={title} onClick={onClick} disabled={!onClick} className="grid min-h-[34px] place-items-center text-[11px]">
      {statusSymbol(active)}
    </button>
  );
}

function CostLineAddButton({ lineType, onClick }: { lineType: SubCostLineType; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`min-h-7 rounded border px-2 text-[11px] font-medium ${lineTypeClass(lineType)}`} title={`Add ${lineTypeLabel(lineType)}`}>
      + {lineTypeLabel(lineType)}
    </button>
  );
}

function CostLineTypePill({ lineType, onChange }: { lineType: SubCostLineType; onChange: (lineType: SubCostLineType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative flex items-center justify-center">
      <button onClick={() => setOpen(!open)} className={`max-w-[44px] truncate rounded border px-1 py-1 text-[10px] font-medium ${lineTypeClass(lineType)}`}>
        {lineTypeLabel(lineType)} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-40 w-24 rounded border border-[#e8e8e4] bg-white py-1 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          {(["PO", "BILL", "RECEIPT"] as SubCostLineType[]).map((type) => (
            <button key={type} onClick={() => { onChange(type); setOpen(false); }} className={`block w-full px-2 py-1 text-left text-[11px] hover:bg-[#f5f5f3] ${type === lineType ? "font-semibold" : ""}`}>
              {type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubCostRow({ subCost, closed, onRevision, onError }: { subCost: SubCost; closed: boolean; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const background = subCost.lineType === "RECEIPT" && subCost.freeAgentTransactionId ? "#dcfce7" : COST_LINE_BACKGROUNDS[subCost.lineType];
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

  return (
    <div className="grid min-h-[32px] border-b border-[#ebebea] text-xs" style={{ ...gridStyle("internal"), background, opacity: closed ? 0.55 : 1 }}>
      <div />
      <div />
      <div className="flex min-h-[32px] min-w-0 items-center gap-2 overflow-hidden pl-8 pr-2">
        <span className="shrink-0 text-[#b8b8b4]">{subCost.receiptCaptureId ? <Camera size={12} /> : "└─"}</span>
        <CostLineTypePill lineType={subCost.lineType} onChange={(lineType) => patch({ lineType }).catch(console.error)} />
        {reference && <span className="shrink-0 whitespace-nowrap text-xs font-medium" style={{ color: DOT_COLORS[subCost.lineType === "PO" ? "PURPLE" : "BLUE" ] }}>{reference}</span>}
        <EditableCell value={subCost.description} onSave={(value) => patch({ description: String(value) })} className="min-w-0 text-[#555]" />
        {subCost.supplierName && <span className="shrink-0 truncate text-[11px] italic text-[#888]">{subCost.supplierName}</span>}
      </div>
      <div className="col-span-7" />
      <div className="flex min-h-[32px] items-center justify-end gap-1 px-2 text-right tabular-nums">
        <EditableCell value={subCost.amount} onSave={(value) => patch({ amount: Number(value ?? 0) })} kind="money" className={subCost.lineType === "PO" ? "text-[#8b5cf6]" : subCost.lineType === "BILL" ? "text-[#3b82f6]" : "text-[#16a34a]"} />
      </div>
      <CostLineLifecycleCell subCost={subCost} onPatch={patch} />
      <div className="flex min-h-[30px] items-center justify-end gap-1 px-1">
        <Paperclip size={14} className={subCost.invoiceFileId ? "text-[#1a1a1f]" : "text-[#888]"} />
        {subCost.proofOfPayment ? <Check size={14} className="text-green-600" /> : <span className="text-[#aaa]">✓</span>}
        <button onClick={remove} className="grid h-7 w-7 place-items-center text-[#aaa] hover:text-red-600"><X size={12} /></button>
      </div>
    </div>
  );
}

function CostLineLifecycleCell({ subCost, onPatch }: { subCost: SubCost; onPatch: (patchData: Partial<SubCost>) => Promise<void> }) {
  if (subCost.lineType === "PO") {
    return (
      <div className="flex min-h-[32px] items-center justify-end px-2">
        <button
          onClick={() => onPatch({ lineType: "BILL" }).catch(console.error)}
          className="min-h-7 rounded border border-[#bfdbfe] bg-[#eff6ff] px-2 text-[11px] font-medium text-[#2563eb]"
          title="Convert this PO to a Bill"
        >
          + Bill
        </button>
      </div>
    );
  }

  if (subCost.lineType === "RECEIPT") {
    return (
      <div className="flex min-h-[32px] items-center justify-end px-2 text-[11px] font-medium text-[#16a34a]">
        Paid ✓
      </div>
    );
  }

  return (
    <button
      onClick={() => onPatch({ isPaid: !subCost.isPaid }).catch(console.error)}
      className="flex min-h-[32px] items-center justify-end gap-1 px-2 text-[11px] font-medium"
      title="Mark bill as paid"
    >
      {subCost.isPaid ? <span className="text-[#16a34a]">Paid ✓</span> : <span className="text-[#d4d4d0]">○ Paid</span>}
    </button>
  );
}

function SubCostDraftRow({ lineId, initialLineType, onCancel, onRevision, onError }: { lineId: string; initialLineType: SubCostLineType; onCancel: () => void; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
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

  return (
    <div className="grid min-h-[30px] border-b border-[#ebebea] bg-[#fafaf8] text-xs" style={gridStyle("internal")}>
      <div />
      <div className="flex min-h-[30px] items-center gap-1 overflow-hidden px-1">
      </div>
      <div className="flex min-h-[30px] items-center gap-2 pl-8 pr-2">
        <span className="shrink-0 text-[#b8b8b4]">└─</span>
        <CostLineTypePill lineType={lineType} onChange={setLineType} />
        <input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description..." className="h-7 min-w-0 flex-1 border-0 bg-transparent text-xs outline-none" />
        <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier..." className="h-7 w-28 border-0 bg-transparent text-[11px] italic text-[#888] outline-none" />
      </div>
      <div className="col-span-7" />
      <Cell><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" placeholder="£" className="h-7 w-full border-0 bg-transparent text-right text-xs tabular-nums outline-none" /></Cell>
      <div />
      <div className="flex items-center justify-end gap-2 px-2">
        <button onClick={save} className="min-h-[28px] rounded bg-[#1a1a1f] px-2 text-[11px] font-medium text-white">Save</button>
        <button onClick={onCancel} className="grid min-h-[28px] w-7 place-items-center text-red-600"><X size={12} /></button>
      </div>
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
    <aside className="fixed inset-y-0 right-0 z-[60] w-full overflow-auto border-l border-[#e8e8e4] bg-white p-5 shadow-xl md:w-auto" style={{ maxWidth: width }}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded hover:bg-gray-100"><X size={18} /></button>
      </div>
      {children}
    </aside>
  );
}
