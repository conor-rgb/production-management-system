import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
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
} from "../../lib/types";

type Entity = { type: "production" | "opportunity"; id: string; label?: string; data?: unknown };
type ViewMode = "internal" | "client";
type Panel = "cover" | "advances" | "templates" | null;
type LineMutationResponse = { line: BudgetLineItem; revision: BudgetRevision | null };
type SubCostMutationResponse = { subCost: SubCost; revision: BudgetRevision | null };
type EditableKind = "text" | "number" | "money" | "percent";

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

const internalColumns = "28px 52px minmax(160px,1fr) 130px 110px 52px 52px 44px 80px 44px 64px 64px 56px 56px 92px 80px 84px 32px 32px 32px 32px 92px";
const clientColumns = "52px minmax(160px,1fr) 130px 44px 80px 44px 64px 92px 92px";

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

function remainingClass(value: number | null | undefined) {
  return Number(value ?? 0) < 0 ? "text-red-600" : "text-emerald-700";
}

function remainingPillClass(remaining: number, estimated: number) {
  if (remaining < 0) return "bg-red-500 text-white";
  if (estimated > 0 && remaining / estimated <= 0.2) return "bg-amber-500 text-white";
  return "bg-emerald-500 text-white";
}

function gridStyle(mode: ViewMode): CSSProperties {
  return { gridTemplateColumns: mode === "internal" ? internalColumns : clientColumns };
}

function statusSymbol(active: boolean) {
  return active ? <span className="font-semibold text-green-600">✓</span> : <span className="text-[#c8c8c4]">○</span>;
}

export default function BudgetView({ entity, onBack }: { entity: Entity; onBack: () => void }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [revision, setRevision] = useState<BudgetRevision | null>(null);
  const [revisions, setRevisions] = useState<BudgetRevisionSummary[]>([]);
  const [templates, setTemplates] = useState<SectionTemplate[]>([]);
  const [mode, setMode] = useState<ViewMode>("internal");
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [addingSubCostFor, setAddingSubCostFor] = useState<string | null>(null);
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
      rate: 0,
      multiplier: 1,
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
          <button onClick={() => setSelectedIds(new Set())} className="whitespace-nowrap hover:text-[#1a1a1f]">Unselect all</button>
          <span>·</span>
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
            selectedIds={selectedIds}
            addingSubCostFor={addingSubCostFor}
            onSetAddingSubCost={setAddingSubCostFor}
            onToggleSelected={(id) => {
              const next = new Set(selectedIds);
              if (next.has(id)) next.delete(id); else next.add(id);
              setSelectedIds(next);
            }}
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
  return (
    <div className="grid min-h-14 shrink-0 grid-cols-2 border-b border-t border-[#e8e8e4] bg-white px-4 py-2 md:grid-cols-5">
      <Metric label="Subtotal" value={money(totals.subtotal)} />
      <EditableMetric label={`Production fee ${percentLabel(revision.productionFeePercent)}`} value={money(totals.productionFee)} current={revision.productionFeePercent} onSubmit={(value) => onRevisionPatch({ productionFeePercent: value })} />
      <EditableMetric label={`Insurance ${percentLabel(revision.insurancePercent)}`} value={money(totals.insurance)} current={revision.insurancePercent} onSubmit={(value) => onRevisionPatch({ insurancePercent: value })} />
      <Metric label="Grand total" value={money(totals.grandTotal)} grand />
      <Metric label="Advance due" value={firstAdvance !== null ? money(firstAdvance) : "None"} />
    </div>
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
  selectedIds: Set<string>;
  addingSubCostFor: string | null;
  onSetAddingSubCost: (lineId: string | null) => void;
  onToggleSelected: (id: string) => void;
  onSaveLine: (line: BudgetLineItem, patch: Partial<BudgetLineItem>) => Promise<void>;
  onAddLine: (section: BudgetSection) => Promise<void>;
  onDuplicate: (line: BudgetLineItem) => Promise<void>;
  onDelete: (line: BudgetLineItem) => Promise<void>;
  onRevision: (revision: BudgetRevision) => void;
  onError: (message: string) => void;
  onOpenTemplates: () => void;
}) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedSubCosts, setCollapsedSubCosts] = useState<Set<string>>(new Set());
  const internal = props.mode === "internal";

  return (
    <div className="min-w-max">
      <div className="sticky top-0 z-20 grid h-7 border-b border-[#e8e8e4] bg-[#f8f8f6] text-[10px] uppercase tracking-[0.5px] text-[#aaa]" style={gridStyle(props.mode)}>
        {internal && <HeaderCell />}
        <HeaderCell>Code</HeaderCell>
        <HeaderCell>Description</HeaderCell>
        <HeaderCell>Client notes</HeaderCell>
        {internal && <HeaderCell>Int. notes</HeaderCell>}
        {internal && <HeaderCell right>Prep</HeaderCell>}
        {internal && <HeaderCell right>Shoot</HeaderCell>}
        <HeaderCell right>Qty</HeaderCell>
        <HeaderCell right>Rate</HeaderCell>
        <HeaderCell right>X</HeaderCell>
        <HeaderCell>Unit</HeaderCell>
        {internal && <HeaderCell right>OT£</HeaderCell>}
        {internal && <HeaderCell right>OT hrs</HeaderCell>}
        {internal && <HeaderCell right>Agy%</HeaderCell>}
        <HeaderCell right>{internal ? "Estimated" : "Budget"}</HeaderCell>
        {internal && <HeaderCell right>Actuals</HeaderCell>}
        {internal && <HeaderCell right>Remaining</HeaderCell>}
        {internal && <HeaderCell center title="Supplier agreed to rate">AGR</HeaderCell>}
        {internal && <HeaderCell center title="Line item closed">CLO</HeaderCell>}
        {internal && <HeaderCell center title="Invoice received">INV</HeaderCell>}
        {internal && <HeaderCell center title="All costs paid">PAID</HeaderCell>}
        <HeaderCell />
      </div>

      {props.revision.sections.filter((section) => section.isVisible).map((section) => {
        const collapsed = collapsedSections.has(section.id);
        return (
          <SectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            subCostsCollapsed={collapsedSubCosts}
            onToggleSection={() => {
              const next = new Set(collapsedSections);
              if (next.has(section.id)) next.delete(section.id); else next.add(section.id);
              setCollapsedSections(next);
            }}
            onToggleSubCosts={(lineId) => {
              const next = new Set(collapsedSubCosts);
              if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
              setCollapsedSubCosts(next);
            }}
            internal={internal}
            {...props}
          />
        );
      })}
    </div>
  );
}

function HeaderCell({ children, right, center, title }: { children?: ReactNode; right?: boolean; center?: boolean; title?: string }) {
  return <div title={title} className={`flex items-center px-2 ${right ? "justify-end text-right" : center ? "justify-center" : ""}`}>{children}</div>;
}

function SectionBlock({ section, collapsed, subCostsCollapsed, onToggleSection, onToggleSubCosts, internal, ...props }: {
  section: BudgetSection;
  collapsed: boolean;
  subCostsCollapsed: Set<string>;
  onToggleSection: () => void;
  onToggleSubCosts: (lineId: string) => void;
  internal: boolean;
} & Omit<Parameters<typeof BudgetTable>[0], "mode">) {
  const sectionTotal = props.revision.totals.sectionTotals.find((item) => item.sectionId === section.id);
  const estimated = sectionTotal?.estimatedTotal ?? 0;
  const actual = sectionTotal?.actualTotal ?? 0;
  const remaining = sectionTotal?.remainingBudget ?? 0;
  const topLevelLines = section.lineItems.filter((line) => !line.parentId);

  return (
    <section>
      <button onClick={onToggleSection} className="grid h-9 w-full bg-[#1a1a1f] text-left text-white" style={gridStyle(internal ? "internal" : "client")}>
        {internal && <div />}
        <div className="col-span-3 flex items-center gap-2 px-2">
          <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-white/15 text-[10px] font-medium">{section.code}</span>
          <span className="text-xs font-medium uppercase">{section.name}</span>
          {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        </div>
        <div className="col-span-full flex items-center justify-end gap-3 px-2 text-xs">
          <span className="font-medium tabular-nums">{money(estimated)}</span>
          {internal && <span className={`rounded-full px-2 py-0.5 text-[10px] ${remainingPillClass(remaining, estimated)}`}>Remaining {money(remaining)}</span>}
          <button
            onClick={(event) => { event.stopPropagation(); props.onAddLine(section).catch(console.error); }}
            className="grid h-8 w-8 place-items-center rounded hover:bg-white/10"
            title="Add line"
          >
            <Plus size={14} />
          </button>
          <span className="grid h-8 w-8 place-items-center text-base"><MoreHorizontal size={15} /></span>
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
          subCostsCollapsed={subCostsCollapsed.has(line.id)}
          onToggleSubCosts={() => onToggleSubCosts(line.id)}
          {...props}
        />
      ))}

      {internal && sectionTotal && estimated !== 0 && (
        <div className="grid h-[26px] bg-[#f8f8f6] text-[11px] text-gray-500" style={gridStyle("internal")}>
          <div />
          <div />
          <div className="flex items-center px-2 italic">Section total</div>
          <div className="col-span-11" />
          <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(estimated)}</div>
          <div className="flex items-center justify-end px-2 font-medium not-italic tabular-nums text-[#1a1a1f]">{money(actual)}</div>
          <div className={`flex items-center justify-end px-2 font-medium not-italic tabular-nums ${remainingClass(remaining)}`}>{money(remaining)}</div>
        </div>
      )}
    </section>
  );
}

function ParentLineRow({ line, internal, subCostsCollapsed, onToggleSubCosts, ...props }: {
  line: BudgetLineItem;
  internal: boolean;
  subCostsCollapsed: boolean;
  onToggleSubCosts: () => void;
} & Omit<Parameters<typeof BudgetTable>[0], "revision" | "mode">) {
  const hasSubCosts = line.subCosts.length > 0;
  const actualClass = hasSubCosts ? "text-blue-600" : moneyClass(line.actualTotal);
  const inv = line.subCosts.some((subCost) => Boolean(subCost.invoiceFileId));
  const paid = line.subCosts.length > 0 && line.subCosts.every((subCost) => Boolean(subCost.proofOfPayment));

  return (
    <>
      <div className="group grid min-h-[34px] border-b border-[#ebebea] bg-white text-xs hover:bg-[#f5f5f3]" style={gridStyle(internal ? "internal" : "client")}>
        {internal && (
          <button onClick={() => props.onToggleSelected(line.id)} className="grid min-h-[34px] place-items-center opacity-0 group-hover:opacity-100">
            <span className={`h-3.5 w-3.5 rounded border ${props.selectedIds.has(line.id) ? "border-[#1a1a1f] bg-[#1a1a1f]" : "border-gray-300"}`} />
          </button>
        )}
        <div className="flex items-center gap-1 px-2 text-[11px] text-[#888]">
          {internal && hasSubCosts && (
            <button onClick={onToggleSubCosts} className="grid h-5 w-4 place-items-center">{subCostsCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}</button>
          )}
          <span>{line.lineCode}</span>
        </div>
        <Cell><EditableCell value={line.description} onSave={(value) => props.onSaveLine(line, { description: String(value) })} className="font-medium text-[#1a1a1f]" /></Cell>
        <Cell><EditableCell value={line.clientNotes ?? ""} onSave={(value) => props.onSaveLine(line, { clientNotes: String(value) })} className="italic text-[#888]" /></Cell>
        {internal && <Cell><EditableCell value={line.internalNotes ?? ""} onSave={(value) => props.onSaveLine(line, { internalNotes: String(value) })} className="text-[#aaa]" /></Cell>}
        {internal && <NumberCell value={line.prepTravelDays} onSave={(value) => props.onSaveLine(line, { prepTravelDays: value })} />}
        {internal && <NumberCell value={line.shootDays} onSave={(value) => props.onSaveLine(line, { shootDays: value })} />}
        <NumberCell value={line.qty} onSave={(value) => props.onSaveLine(line, { qty: value ?? 0 })} />
        <MoneyCell value={line.rate} onSave={(value) => props.onSaveLine(line, { rate: value ?? 0 })} />
        <NumberCell value={line.multiplier} onSave={(value) => props.onSaveLine(line, { multiplier: value ?? 1 })} />
        <Cell><UnitDropdown value={line.unit} onSave={(unit) => props.onSaveLine(line, { unit })} /></Cell>
        {internal && <MoneyCell value={line.otRate} onSave={(value) => props.onSaveLine(line, { otRate: value })} />}
        {internal && <NumberCell value={line.otHours} onSave={(value) => props.onSaveLine(line, { otHours: value })} />}
        {internal && <PercentCell value={line.agencyFeePercent} onSave={(value) => props.onSaveLine(line, { agencyFeePercent: value })} />}
        <ReadMoney value={line.estimatedTotal} strong />
        {internal && <ReadMoney value={line.actualTotal} className={actualClass} />}
        {internal && <ReadMoney value={line.variance} className={remainingClass(line.variance)} />}
        {internal && <StatusButton active={line.isAgreed} onClick={() => props.onSaveLine(line, { isAgreed: !line.isAgreed }).catch(console.error)} title="Supplier agreed to rate" />}
        {internal && <StatusButton active={line.isClosed} onClick={() => props.onSaveLine(line, { isClosed: !line.isClosed }).catch(console.error)} title="Line item closed" />}
        {internal && <StatusButton active={inv} title="Invoice received" />}
        {internal && <StatusButton active={paid} title="All costs paid" />}
        <div className="flex items-center justify-end gap-1 px-2 opacity-0 group-hover:opacity-100">
          {internal && <button onClick={() => props.onSetAddingSubCost(line.id)} className="grid h-7 w-7 place-items-center rounded text-[#888] hover:bg-gray-100" title="+ sub-cost"><Plus size={14} /></button>}
          <button onClick={() => props.onDuplicate(line).catch(console.error)} className="grid h-7 w-7 place-items-center rounded text-[#888] hover:bg-gray-100" title="Duplicate"><Copy size={13} /></button>
          <button onClick={() => props.onDelete(line).catch(console.error)} className="grid h-7 w-7 place-items-center rounded text-[#888] hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={13} /></button>
        </div>
      </div>

      {internal && !subCostsCollapsed && line.subCosts.map((subCost) => (
        <SubCostRow key={subCost.id} subCost={subCost} onRevision={props.onRevision} onError={props.onError} />
      ))}
      {internal && props.addingSubCostFor === line.id && (
        <SubCostDraftRow lineId={line.id} onCancel={() => props.onSetAddingSubCost(null)} onRevision={(next) => { props.onRevision(next); props.onSetAddingSubCost(null); }} onError={props.onError} />
      )}
    </>
  );
}

function Cell({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={`flex min-h-[34px] items-center px-2 ${className}`}>{children}</div>;
}

function ReadMoney({ value, strong, className }: { value: number | null | undefined; strong?: boolean; className?: string }) {
  return <div className={`flex min-h-[34px] items-center justify-end px-2 text-right tabular-nums ${strong ? "font-medium" : ""} ${className ?? moneyClass(value)}`}>{money(value)}</div>;
}

function EditableCell({ value, onSave, className = "", kind = "text" }: { value: string | number | null | undefined; onSave: (value: string | number | null) => Promise<void>; className?: string; kind?: EditableKind }) {
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

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
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

function NumberCell({ value, onSave }: { value?: number | null; onSave: (value: number | null) => Promise<void> }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="number" /></Cell>;
}

function MoneyCell({ value, onSave }: { value?: number | null; onSave: (value: number | null) => Promise<void> }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="money" /></Cell>;
}

function PercentCell({ value, onSave }: { value?: number | null; onSave: (value: number | null) => Promise<void> }) {
  return <Cell><EditableCell value={value ?? ""} onSave={(next) => onSave(typeof next === "number" ? next : null)} kind="percent" /></Cell>;
}

function UnitDropdown({ value, onSave }: { value: string; onSave: (value: string) => Promise<void> }) {
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
    <div ref={ref} className="relative w-full">
      <button onClick={() => setOpen(!open)} className="flex min-h-[30px] w-full items-center justify-between text-left text-xs">
        <span>{value}</span><span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-40 w-32 rounded border border-[#e8e8e4] bg-white py-1 text-xs shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          {UNITS.map((unit) => (
            <button key={unit} onClick={() => { onSave(unit).catch(console.error); setOpen(false); }} className={`block h-[30px] w-full px-2 text-left hover:bg-[#f5f5f3] ${unit === value ? "bg-[#1a1a1f] text-white" : ""}`}>
              {unit}
            </button>
          ))}
        </div>
      )}
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

function SubCostRow({ subCost, onRevision, onError }: { subCost: SubCost; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
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
    await api.delete(`/api/budgets/subcosts/${subCost.id}`);
    onError("Sub-cost deleted. Refreshing totals...");
    window.location.reload();
  }

  return (
    <div className="grid min-h-[30px] border-b border-[#ebebea] bg-[#fafaf8] text-xs" style={gridStyle("internal")}>
      <div />
      <div className="flex items-center justify-end pr-1 text-[#ccc]">{subCost.receiptCaptureId ? <Camera size={12} /> : "└"}</div>
      <Cell><EditableCell value={subCost.description} onSave={(value) => patch({ description: String(value) })} className="text-[#555]" /></Cell>
      <Cell><EditableCell value={subCost.supplierName ?? ""} onSave={(value) => patch({ supplierName: String(value) })} className="text-[11px] text-[#888]" /></Cell>
      <div className="col-span-10" />
      <div />
      <Cell><EditableCell value={subCost.amount} onSave={(value) => patch({ amount: Number(value ?? 0) })} kind="money" /></Cell>
      <div className="flex min-h-[30px] items-center justify-end px-2 text-[11px] text-[#aaa] tabular-nums">{subCost.vatAmount && subCost.vatAmount > 0 ? money(subCost.vatAmount) : ""}</div>
      <div />
      <div />
      <div className="grid min-h-[30px] place-items-center"><Paperclip size={14} className={subCost.invoiceFileId ? "text-[#1a1a1f]" : "text-[#888]"} /></div>
      <div className="grid min-h-[30px] place-items-center">{subCost.proofOfPayment ? <Check size={14} className="text-green-600" /> : <span className="text-[#aaa]">✓</span>}</div>
      <button onClick={remove} className="grid min-h-[30px] place-items-center text-[#aaa] hover:text-red-600"><X size={12} /></button>
    </div>
  );
}

function SubCostDraftRow({ lineId, onCancel, onRevision, onError }: { lineId: string; onCancel: () => void; onRevision: (revision: BudgetRevision) => void; onError: (message: string) => void }) {
  const [description, setDescription] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [amount, setAmount] = useState("");

  async function save() {
    try {
      const response = await api.post<SubCostMutationResponse>(`/api/budgets/lines/${lineId}/subcosts`, {
        description: description || "Sub-cost",
        supplierName: supplierName || null,
        amount: Number(amount || 0),
        status: "AGREED",
      });
      if (response.revision) onRevision(response.revision);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="grid min-h-[30px] border-b border-[#ebebea] bg-[#fafaf8] text-xs" style={gridStyle("internal")}>
      <div />
      <div className="flex items-center justify-end pr-1 text-[#ccc]">└</div>
      <Cell><input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description..." className="h-7 w-full border-0 bg-transparent text-xs outline-none" /></Cell>
      <Cell><input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier..." className="h-7 w-full border-0 bg-transparent text-xs outline-none" /></Cell>
      <div className="col-span-11" />
      <Cell><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" placeholder="£" className="h-7 w-full border-0 bg-transparent text-right text-xs tabular-nums outline-none" /></Cell>
      <div />
      <div />
      <button onClick={save} className="min-h-[30px] text-[11px] font-medium text-[#1a1a1f]">Save</button>
      <button onClick={onCancel} className="grid min-h-[30px] place-items-center text-red-600"><X size={12} /></button>
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
