import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import BudgetView from "../components/budgets/BudgetView";
import FileBrowser from "../components/files/FileBrowser";
import CalendarView from "../components/calendar/CalendarView";
import OptionsBoardView from "../components/options/OptionsBoardView";
import type {
  ActivityNote,
  ActivityTask,
  Contact,
  CrewMember,
  CrewRole,
  CrewStatus,
  EmailThread,
  EmailThreadsResponse,
  FreeAgentInvoiceStatus,
  PmsJobType,
  Production,
  ProductionDate,
  ProductionDateType,
  PurchaseOrderContext,
  PurchaseOrderGroup,
  PurchaseOrderStatus,
  ProductionStatus,
} from "../lib/types";
import {
  ACTIVE_PRODUCTION_STATUSES,
  CREW_STATUS_LABELS,
  DATE_TYPE_LABELS,
  PRODUCTION_STATUS_LABELS,
  formatCurrency,
} from "../lib/types";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Film,
  Mail,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

const JOB_TYPES: PmsJobType[] = ["STILLS", "MOTION", "EVENTS"];
const DATE_TYPES: ProductionDateType[] = ["PPM", "RECCE", "FITTING", "MEETING", "SHOOT_DAY", "POST_DELIVERY", "OTHER"];
const CREW_STATUSES: CrewStatus[] = ["REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "CONFIRMED", "RELEASED"];
const INVOICE_STATUSES: FreeAgentInvoiceStatus[] = ["NOT_RAISED", "DRAFT", "SENT", "VIEWED", "PAID", "OVERDUE"];
const TABS = ["Overview", "Dates", "Crew", "Options", "Budget", "POs", "Comms", "Files"] as const;
type Tab = typeof TABS[number];
const PO_STATUSES: PurchaseOrderStatus[] = ["DRAFT", "SENT", "ACCEPTED", "PART_BILLED", "BILLED", "PAID", "CANCELLED"];
const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  PART_BILLED: "Part-billed",
  BILLED: "Billed",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

function tabFromQuery(value: string | null): Tab {
  const normalized = value?.toLowerCase();
  if (normalized === "dates") return "Dates";
  if (normalized === "crew") return "Crew";
  if (normalized === "comms") return "Comms";
  if (normalized === "files") return "Files";
  if (normalized === "budget") return "Budget";
  if (normalized === "options") return "Options";
  if (normalized === "pos" || normalized === "purchase-orders") return "POs";
  return "Overview";
}

function statusClass(status: ProductionStatus) {
  if (status === "WRAPPED" || status === "CLOSED" || status === "INVOICED") return "bg-gray-100 text-gray-600";
  if (status === "SHOOT" || status === "IN_PRODUCTION") return "bg-amber-100 text-amber-800";
  if (status === "POST" || status === "DELIVERED") return "bg-blue-100 text-blue-800";
  return "bg-emerald-100 text-emerald-800";
}

function formatDate(date?: string) {
  if (!date) return "No date";
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fullName(contact?: Contact) {
  if (!contact) return "";
  return `${contact.firstName}${contact.lastName ? " " + contact.lastName : ""}`;
}

export default function Productions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [productions, setProductions] = useState<Production[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("production"));
  const [loading, setLoading] = useState(true);
  const [includeWrapped, setIncludeWrapped] = useState(searchParams.get("archive") === "true");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [invoicePrompt, setInvoicePrompt] = useState<Production | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (includeWrapped) qs.set("includeWrapped", "true");
      if (search.trim()) qs.set("search", search.trim());
      const data = await api.get<Production[]>(`/api/productions${qs.toString() ? `?${qs}` : ""}`);
      setProductions(data);
      const requested = searchParams.get("production");
      if (requested && data.some((p) => p.id === requested)) setSelectedId(requested);
      else if (selectedId && !data.some((p) => p.id === selectedId)) setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [includeWrapped, search, searchParams, selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = productions.find((p) => p.id === selectedId) ?? null;
  const budgetViewOpen = searchParams.get("view") === "budget" && Boolean(selectedId);
  const optionsViewOpen = searchParams.get("tab")?.toLowerCase() === "options" && Boolean(selectedId);

  function selectProduction(id: string | null) {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    if (id) next.set("production", id);
    else next.delete("production");
    if (includeWrapped) next.set("archive", "true");
    setSearchParams(next, { replace: true });
  }

  function toggleArchive() {
    const nextValue = !includeWrapped;
    setIncludeWrapped(nextValue);
    const next = new URLSearchParams(searchParams);
    if (nextValue) next.set("archive", "true");
    else next.delete("archive");
    setSearchParams(next, { replace: true });
  }

  function openBudget(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("production", id);
    next.set("view", "budget");
    setSearchParams(next, { replace: true });
  }

  function closeBudget() {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    next.set("tab", "Budget");
    setSearchParams(next, { replace: true });
  }

  function openOptions(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("production", id);
    next.delete("view");
    next.delete("optionGroup");
    next.set("tab", "options");
    setSearchParams(next, { replace: true });
  }

  function closeOptions() {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "Overview");
    next.delete("optionGroup");
    setSearchParams(next, { replace: true });
  }

  if (budgetViewOpen && selectedId) {
    return (
      <BudgetView
        entity={{ type: "production", id: selectedId, data: selected ?? undefined }}
        onBack={closeBudget}
      />
    );
  }

  if (optionsViewOpen && selectedId) {
    return <OptionsBoardView productionId={selectedId} onBack={closeOptions} />;
  }

  return (
    <div className="flex h-full bg-gray-50">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="bg-white border-b border-gray-200 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h1 className="font-semibold text-gray-900">Productions</h1>
            <button
              onClick={() => setShowNew(true)}
              className="min-h-11 flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
            >
              <Plus size={16} /> New
            </button>
          </div>
          <div className="flex gap-2">
            <label className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search productions"
                className="min-h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400"
              />
            </label>
            <button
              onClick={toggleArchive}
              className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${includeWrapped ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              Archive
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 grid place-items-center text-sm text-gray-400">Loading…</div>
        ) : productions.length === 0 ? (
          <div className="flex-1 grid place-items-center p-8 text-center text-gray-400">
            <div>
              <Film size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No productions found.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
            {productions.map((production) => (
              <button
                key={production.id}
                onClick={() => selectProduction(production.id)}
                className={`min-h-44 rounded-lg border bg-white p-4 text-left shadow-sm transition ${selectedId === production.id ? "border-gray-900" : "border-gray-200 hover:border-gray-300"}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-indigo-700">{production.jobCode ?? "No code"}</p>
                    <h2 className="mt-1 truncate text-base font-semibold text-gray-900">{production.title}</h2>
                    <p className="truncate text-sm text-gray-500">{production.clientName ?? "No client"}{production.brand ? ` · ${production.brand}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${statusClass(production.status)}`}>
                    {PRODUCTION_STATUS_LABELS[production.status]}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Next date</span>
                    <span className="truncate text-gray-800">{production.nextDate ? `${DATE_TYPE_LABELS[production.nextDate.dateType]} · ${formatDate(production.nextDate.date)}` : "None"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Quoted / actual</span>
                    <span className="font-medium text-gray-900">{formatCurrency(production.quotedValue)} / {formatCurrency(production.actualSpend)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Variance</span>
                    <span className={`font-semibold ${production.overBudget ? "text-red-600" : "text-emerald-700"}`}>
                      {formatCurrency(production.variance)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="hidden w-[520px] border-l border-gray-200 bg-white md:flex">
          <ProductionDetail
            productionId={selected.id}
            onClose={() => selectProduction(null)}
            onSaved={load}
            onInvoicePrompt={setInvoicePrompt}
            initialTab={tabFromQuery(searchParams.get("tab"))}
            onOpenBudget={() => openBudget(selected.id)}
            onOpenOptions={() => openOptions(selected.id)}
          />
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 bg-white md:hidden">
          <ProductionDetail
            productionId={selected.id}
            onClose={() => selectProduction(null)}
            onSaved={load}
            onInvoicePrompt={setInvoicePrompt}
            initialTab={tabFromQuery(searchParams.get("tab"))}
            onOpenBudget={() => openBudget(selected.id)}
            onOpenOptions={() => openOptions(selected.id)}
          />
        </div>
      )}

      {showNew && (
        <ProductionForm
          onClose={() => setShowNew(false)}
          onSaved={(production) => {
            setShowNew(false);
            load();
            selectProduction(production.id);
          }}
        />
      )}

      {invoicePrompt && (
        <InvoicePrompt
          production={invoicePrompt}
          onClose={() => setInvoicePrompt(null)}
        />
      )}
    </div>
  );
}

function ProductionForm({ onClose, onSaved }: { onClose: () => void; onSaved: (production: Production) => void }) {
  const [form, setForm] = useState({ title: "", clientName: "", brand: "", jobType: "STILLS" as PmsJobType, value: "", notes: "" });

  async function save() {
    if (!form.title.trim()) return;
    const production = await api.post<Production>("/api/productions", {
      ...form,
      value: form.value || undefined,
    });
    onSaved(production);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-3 md:grid md:place-items-center">
      <div className="max-h-full overflow-auto rounded-lg bg-white p-4 shadow-xl md:w-[420px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">New production</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Input label="Production name" value={form.title} onChange={(title) => setForm({ ...form, title })} />
          <Input label="Client" value={form.clientName} onChange={(clientName) => setForm({ ...form, clientName })} />
          <Input label="Brand" value={form.brand} onChange={(brand) => setForm({ ...form, brand })} />
          <Select label="Job type" value={form.jobType} options={JOB_TYPES.map((v) => ({ value: v, label: v[0] + v.slice(1).toLowerCase() }))} onChange={(jobType) => setForm({ ...form, jobType: jobType as PmsJobType })} />
          <Input label="Quoted value" type="number" value={form.value} onChange={(value) => setForm({ ...form, value })} />
          <Textarea label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
          <button onClick={save} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Create production</button>
        </div>
      </div>
    </div>
  );
}

function ProductionDetail({ productionId, onClose, onSaved, onInvoicePrompt, initialTab = "Overview", onOpenBudget, onOpenOptions }: {
  productionId: string;
  onClose: () => void;
  onSaved: () => void;
  onInvoicePrompt: (production: Production) => void;
  initialTab?: Tab;
  onOpenBudget: () => void;
  onOpenOptions: () => void;
}) {
  const [production, setProduction] = useState<Production | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  const reload = useCallback(() => {
    api.get<Production>(`/api/productions/${productionId}`).then(setProduction).catch(console.error);
  }, [productionId]);

  useEffect(() => { reload(); setTab(initialTab); }, [reload, initialTab]);

  if (!production) return <div className="flex-1 grid place-items-center text-sm text-gray-400">Loading…</div>;

  async function saveOverview(data: Partial<Production>) {
    const res = await api.patch<{ production: Production; invoicePrompt: boolean }>(`/api/productions/${productionId}`, data);
    setProduction(res.production);
    if (res.invoicePrompt) onInvoicePrompt(res.production);
    onSaved();
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-indigo-700">{production.jobCode}</p>
            <h2 className="truncate text-lg font-semibold text-gray-900">{production.title}</h2>
            <p className="truncate text-sm text-gray-500">{production.clientName ?? "No client"}{production.brand ? ` · ${production.brand}` : ""}</p>
          </div>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-50">
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((item) => (
            <button
              key={item}
              onClick={() => item === "Budget" ? onOpenBudget() : item === "Options" ? onOpenOptions() : setTab(item)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium ${tab === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tab === "Overview" && <OverviewTab production={production} onSave={saveOverview} onStatusSaved={(p) => { setProduction(p); onSaved(); }} onInvoicePrompt={onInvoicePrompt} onOpenBudget={onOpenBudget} />}
        {tab === "Dates" && <DatesTab production={production} onReload={reload} />}
        {tab === "Crew" && <CrewTab production={production} onReload={reload} />}
        {tab === "Comms" && <CommsTab production={production} onReload={reload} />}
        {tab === "Files" && <FileBrowser productionId={production.id} />}
        {tab === "Budget" && <ProductionBudgetSummary production={production} onOpenBudget={onOpenBudget} />}
        {tab === "Options" && <OptionsBoardView productionId={production.id} onBack={() => setTab("Overview")} />}
        {tab === "POs" && <PurchaseOrdersTab production={production} />}
      </div>
    </div>
  );
}

function poStatusClass(status: PurchaseOrderStatus) {
  if (status === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "BILLED" || status === "PART_BILLED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "SENT" || status === "ACCEPTED") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "CANCELLED") return "border-gray-200 bg-gray-50 text-gray-400";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function PurchaseOrdersTab({ production }: { production: Production }) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderGroup[]>([]);
  const [context, setContext] = useState<PurchaseOrderContext | null>(null);
  const [creating, setCreating] = useState(false);
  const [billPo, setBillPo] = useState<PurchaseOrderGroup | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, nextContext] = await Promise.all([
        api.get<PurchaseOrderGroup[]>(`/api/budgets/production/${production.id}/purchase-orders`),
        api.get<PurchaseOrderContext>(`/api/budgets/production/${production.id}/purchase-order-context`),
      ]);
      setPurchaseOrders(orders);
      setContext(nextContext);
    } finally {
      setLoading(false);
    }
  }, [production.id]);

  useEffect(() => { load().catch(console.error); }, [load]);

  async function updateStatus(po: PurchaseOrderGroup, status: PurchaseOrderStatus) {
    const updated = await api.patch<PurchaseOrderGroup>(`/api/budgets/purchase-orders/${po.id}`, { status });
    setPurchaseOrders((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function deletePo(po: PurchaseOrderGroup) {
    if (!window.confirm(`Delete ${po.poNumber} and its budget allocations?`)) return;
    await api.delete(`/api/budgets/purchase-orders/${po.id}`);
    await load();
  }

  const totals = purchaseOrders.reduce((sum, po) => sum + po.total, 0);
  const openCount = purchaseOrders.filter((po) => !["PAID", "CANCELLED"].includes(po.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Purchase orders</h3>
          <p className="mt-1 text-xs text-gray-500">Manage supplier commitments across budget lines.</p>
        </div>
        <button onClick={() => setCreating(true)} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
          + Multi-line PO
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="PO total" value={formatCurrency(totals)} />
        <Metric label="Open POs" value={String(openCount)} />
        <Metric label="PO count" value={String(purchaseOrders.length)} />
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-[110px_1.2fr_1.4fr_100px_130px_120px_40px] items-center border-b border-gray-200 bg-[#f8f8f6] px-3 py-2 text-[10px] uppercase tracking-[0.05em] text-gray-400">
          <div>PO</div>
          <div>Supplier</div>
          <div>Lines</div>
          <div className="text-right">Total</div>
          <div>Status</div>
          <div>Bill</div>
          <div />
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Loading POs...</div>
        ) : purchaseOrders.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-gray-900">No purchase orders yet.</p>
            <p className="mt-1 text-xs text-gray-500">Create one PO across multiple budget lines while keeping each line clear.</p>
            <button onClick={() => setCreating(true)} className="mt-4 min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">+ Create PO</button>
          </div>
        ) : purchaseOrders.map((po) => (
          <div key={po.id} className="grid grid-cols-[110px_1.2fr_1.4fr_100px_130px_120px_40px] items-start border-b border-gray-100 px-3 py-3 text-xs last:border-b-0 hover:bg-gray-50">
            <div className="font-mono font-semibold text-gray-900">{po.poNumber}</div>
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-900">{po.supplierName}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-400">{[po.supplierEmail, po.blackbookEntry ? "Blackbook" : null, po.optionCandidate ? po.optionCandidate.group?.name : null].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="space-y-1">
              {po.allocations.map((allocation) => (
                <div key={allocation.id} className="grid grid-cols-[1fr_78px] gap-2 text-[11px]">
                  <span className="truncate text-gray-600">{allocation.lineItem.lineCode} {allocation.lineItem.description}</span>
                  <span className="text-right tabular-nums text-gray-900">{formatCurrency(allocation.amount)}</span>
                </div>
              ))}
            </div>
            <div className="text-right font-semibold tabular-nums text-gray-900">{formatCurrency(po.total)}</div>
            <div>
              <select value={po.status} onChange={(event) => updateStatus(po, event.target.value as PurchaseOrderStatus).catch(console.error)} className={`h-8 rounded-md border px-2 text-[11px] font-medium outline-none ${poStatusClass(po.status)}`}>
                {PO_STATUSES.map((status) => <option key={status} value={status}>{PO_STATUS_LABELS[status]}</option>)}
              </select>
            </div>
            <div>
              <button
                onClick={() => setBillPo(po)}
                className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] font-medium ${po.allocations.some((allocation) => allocation.invoiceFileId) ? "border-blue-100 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
              >
                <FileText size={12} />
                {po.allocations.some((allocation) => allocation.invoiceFileId) ? "Bill linked" : "Add bill"}
              </button>
            </div>
            <button onClick={() => deletePo(po).catch(console.error)} className="grid h-7 w-7 place-items-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600" title="Delete PO"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {creating && context && (
        <PurchaseOrderCreatePanel
          production={production}
          context={context}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load().catch(console.error); }}
        />
      )}
      {billPo && (
        <PurchaseOrderBillPanel
          po={billPo}
          onClose={() => setBillPo(null)}
          onSaved={(updated) => {
            setPurchaseOrders((items) => items.map((item) => item.id === updated.id ? updated : item));
            setBillPo(null);
          }}
        />
      )}
    </div>
  );
}

function PurchaseOrderBillPanel({ po, onClose, onSaved }: {
  po: PurchaseOrderGroup;
  onClose: () => void;
  onSaved: (po: PurchaseOrderGroup) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(po.allocations.map((allocation) => [allocation.id, String(allocation.amount ?? 0)])));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const form = new FormData();
      if (invoiceNumber.trim()) form.append("invoiceNumber", invoiceNumber.trim());
      if (invoiceDate) form.append("invoiceDate", invoiceDate);
      if (file) form.append("invoiceFile", file);
      form.append("allocations", JSON.stringify(po.allocations.map((allocation) => ({
        id: allocation.id,
        amount: Number(amounts[allocation.id] || allocation.amount || 0),
      }))));
      const res = await fetch(`/api/budgets/purchase-orders/${po.id}/convert-to-bill`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Failed to add bill" }));
        throw new Error(typeof body.error === "string" ? body.error : "Failed to add bill");
      }
      onSaved(await res.json() as PurchaseOrderGroup);
    } finally {
      setSaving(false);
    }
  }

  const total = po.allocations.reduce((sum, allocation) => sum + Number(amounts[allocation.id] || allocation.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/10" onMouseDown={onClose}>
      <div className="h-full w-full max-w-2xl overflow-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add bill to {po.poNumber}</h3>
            <p className="text-xs text-gray-500">{po.supplierName} · converts selected PO allocations to bills</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-50"><X size={16} /></button>
        </div>

        <div className="space-y-5 p-4">
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Invoice details</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input label="Invoice number" value={invoiceNumber} onChange={setInvoiceNumber} placeholder="INV-001" />
              <Input label="Invoice date" value={invoiceDate} onChange={setInvoiceDate} type="date" />
            </div>
            <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center hover:border-gray-500">
              <FileText size={18} className="text-gray-400" />
              <span className="mt-2 text-sm font-medium text-gray-800">{file ? file.name : "Choose invoice file"}</span>
              <span className="mt-1 text-xs text-gray-400">PDF or image. The file is saved to the job Receipts folder and linked to every allocation below.</span>
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
          </section>

          <section className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Bill allocations</h4>
              <span className="text-xs font-medium tabular-nums text-gray-900">Total {formatCurrency(total)}</span>
            </div>
            {po.allocations.map((allocation) => (
              <div key={allocation.id} className="grid grid-cols-[1fr_120px] items-center gap-3 border-b border-gray-50 px-3 py-2 text-xs last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{allocation.lineItem.lineCode} {allocation.lineItem.description}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{allocation.lineItem.section.code} {allocation.lineItem.section.name}</p>
                  {allocation.invoiceFile && <p className="mt-0.5 truncate text-[11px] text-blue-600">{allocation.invoiceFile.originalFilename}</p>}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={amounts[allocation.id] ?? ""}
                  onChange={(event) => setAmounts((current) => ({ ...current, [allocation.id]: event.target.value }))}
                  className="h-9 rounded-lg border border-gray-200 px-2 text-right text-sm tabular-nums text-gray-900 outline-none focus:border-gray-500"
                />
              </div>
            ))}
          </section>

          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
            This does not merge the budget lines. It keeps each estimate pot clear, marks the linked PO cost lines as bills, and attaches the same invoice file to those bill rows.
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="min-h-10 rounded-lg px-4 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button onClick={() => save().catch((err: unknown) => window.alert(err instanceof Error ? err.message : "Failed to add bill"))} disabled={saving} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Saving..." : "Convert to bill"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseOrderCreatePanel({ production, context, onClose, onCreated }: {
  production: Production;
  context: PurchaseOrderContext;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [blackbookEntryId, setBlackbookEntryId] = useState<string | null>(null);
  const [optionCandidateId, setOptionCandidateId] = useState("");
  const [createBlackbook, setCreateBlackbook] = useState(true);
  const [query, setQuery] = useState("");
  const [blackbookResults, setBlackbookResults] = useState<Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setBlackbookResults([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: "8" });
      api.get<Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>>(`/api/options/blackbook?${params.toString()}`)
        .then(setBlackbookResults)
        .catch(() => setBlackbookResults([]));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  function selectCandidate(candidateId: string) {
    setOptionCandidateId(candidateId);
    const candidate = context.optionCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    setSupplierName(candidate.blackbookEntry?.displayName ?? candidate.name);
    setSupplierEmail(candidate.contactEmail ?? candidate.blackbookEntry?.email ?? "");
    setSupplierPhone(candidate.contactPhone ?? candidate.blackbookEntry?.phone ?? "");
    setBlackbookEntryId(candidate.blackbookEntryId ?? null);
    if (candidate.blackbookEntryId) setCreateBlackbook(false);
  }

  function selectedAllocations() {
    return Object.entries(allocations)
      .map(([lineItemId, amount]) => ({ lineItemId, amount: Number(amount || 0) }))
      .filter((allocation) => allocation.amount > 0);
  }

  async function save() {
    setSaving(true);
    try {
      await api.post<PurchaseOrderGroup>(`/api/budgets/production/${production.id}/purchase-orders`, {
        supplierName,
        supplierEmail: supplierEmail || null,
        supplierPhone: supplierPhone || null,
        blackbookEntryId,
        optionCandidateId: optionCandidateId || null,
        createBlackbook: createBlackbook && !blackbookEntryId,
        allocations: selectedAllocations(),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const allocationTotal = selectedAllocations().reduce((sum, allocation) => sum + allocation.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/10" onMouseDown={onClose}>
      <div className="h-full w-full max-w-3xl overflow-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">New multi-line PO</h3>
            <p className="text-xs text-gray-500">{production.jobCode ?? "Job"} · {production.title}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-50"><X size={16} /></button>
        </div>

        <div className="space-y-5 p-4">
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Supplier</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">From job options
                <select value={optionCandidateId} onChange={(event) => selectCandidate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900">
                  <option value="">No option candidate</option>
                  {context.optionCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.group.name} · {candidate.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-gray-500">Search Blackbook
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search supplier..." className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900" />
              </label>
            </div>
            {blackbookResults.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-100">
                {blackbookResults.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => {
                      setBlackbookEntryId(entry.id);
                      setSupplierName(entry.displayName);
                      setSupplierEmail(entry.email ?? "");
                      setSupplierPhone(entry.phone ?? "");
                      setCreateBlackbook(false);
                      setBlackbookResults([]);
                      setQuery(entry.displayName);
                    }}
                    className="block w-full border-b border-gray-50 px-3 py-2 text-left text-xs hover:bg-gray-50 last:border-b-0"
                  >
                    <span className="font-medium text-gray-900">{entry.displayName}</span>
                    <span className="ml-2 text-gray-400">{entry.email}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Input label="Supplier name" value={supplierName} onChange={setSupplierName} />
              <Input label="Email" value={supplierEmail} onChange={setSupplierEmail} />
              <Input label="Phone" value={supplierPhone} onChange={setSupplierPhone} />
            </div>
            {!blackbookEntryId && (
              <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={createBlackbook} onChange={(event) => setCreateBlackbook(event.target.checked)} />
                Create a Blackbook supplier record when saving
              </label>
            )}
          </section>

          <section className="rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Budget allocations</h4>
              <span className="text-xs font-medium tabular-nums text-gray-900">Total {formatCurrency(allocationTotal)}</span>
            </div>
            <div className="max-h-[460px] overflow-auto">
              {context.lines.map((line) => (
                <div key={line.id} className="grid grid-cols-[1fr_120px] items-center gap-3 border-b border-gray-50 px-3 py-2 text-xs last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{line.lineCode} {line.description}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{line.section.code} {line.section.name} · estimate {formatCurrency(line.estimatedTotal)}</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={allocations[line.id] ?? ""}
                    onChange={(event) => setAllocations((current) => ({ ...current, [line.id]: event.target.value }))}
                    placeholder="£"
                    className="h-9 rounded-lg border border-gray-200 px-2 text-right text-sm tabular-nums text-gray-900 outline-none focus:border-gray-500"
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="min-h-10 rounded-lg px-4 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving || !supplierName.trim() || selectedAllocations().length === 0} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Creating..." : "Create PO"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ production, onSave, onStatusSaved, onInvoicePrompt, onOpenBudget }: {
  production: Production;
  onSave: (data: Partial<Production>) => void;
  onStatusSaved: (production: Production) => void;
  onInvoicePrompt: (production: Production) => void;
  onOpenBudget: () => void;
}) {
  const [notes, setNotes] = useState(production.notes ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState<FreeAgentInvoiceStatus>(production.freeAgentInvoiceStatus);

  useEffect(() => {
    setNotes(production.notes ?? "");
    setInvoiceStatus(production.freeAgentInvoiceStatus);
  }, [production]);

  async function updateStatus(status: ProductionStatus) {
    if (status === production.status) return;
    const ok = window.confirm(`Move this production to ${PRODUCTION_STATUS_LABELS[status]}?`);
    if (!ok) return;
    const res = await api.post<{ production: Production; invoicePrompt: boolean }>(`/api/productions/${production.id}/status`, { status });
    onStatusSaved(res.production);
    if (res.invoicePrompt) onInvoicePrompt(res.production);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Quoted" value={formatCurrency(production.quotedValue)} />
        <Metric label="Actual" value={formatCurrency(production.actualSpend)} />
        <Metric label="Variance" value={formatCurrency(production.variance)} danger={production.overBudget} />
        <Metric label="Variance %" value={`${production.variancePercent.toFixed(1)}%`} danger={production.overBudget} />
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-900">Budget summary</p>
          <button onClick={onOpenBudget} className="min-h-11 rounded-lg px-2 text-sm font-medium text-indigo-700">Open budget →</button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-gray-500">Client estimate</p><p className="mt-1 font-semibold tabular-nums text-gray-900">{formatCurrency(production.quotedValue)}</p></div>
          <div><p className="text-gray-500">Actual spend</p><p className="mt-1 font-semibold tabular-nums text-gray-900">{formatCurrency(production.actualSpend)}</p></div>
          <div><p className="text-gray-500">Variance</p><p className={`mt-1 font-semibold tabular-nums ${production.overBudget ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(production.variance)}</p></div>
        </div>
      </div>
      <StatusPicker current={production.status} onChange={updateStatus} />
      <Select label="FreeAgent invoice" value={invoiceStatus} options={INVOICE_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ").toLowerCase() }))} onChange={(value) => setInvoiceStatus(value as FreeAgentInvoiceStatus)} />
      <Textarea label="Notes" value={notes} onChange={setNotes} />
      <button onClick={() => onSave({ notes, freeAgentInvoiceStatus: invoiceStatus })} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
        Save overview
      </button>
    </div>
  );
}

function StatusPicker({ current, onChange }: { current: ProductionStatus; onChange: (status: ProductionStatus) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-700">Status</p>
      <div className="relative">
        <button onClick={() => setOpen(!open)} className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-sm font-medium ${statusClass(current)}`}>
          {PRODUCTION_STATUS_LABELS[current]}
          <ChevronDown size={16} />
        </button>
        {open && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
            {ACTIVE_PRODUCTION_STATUSES.map((status) => (
              <button key={status} onClick={() => { setOpen(false); onChange(status); }} className="min-h-11 w-full px-3 text-left text-sm hover:bg-gray-50">
                {PRODUCTION_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProductionBudgetSummary({ production, onOpenBudget }: { production: Production; onOpenBudget: () => void }) {
  return (
    <div className="space-y-4">
      {production.overBudget && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          This production is over budget by {formatCurrency(production.variance)}.
        </div>
      )}
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Client estimate</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums text-gray-900">{formatCurrency(production.quotedValue)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Actual spend" value={formatCurrency(production.actualSpend)} />
          <Metric label="Variance" value={formatCurrency(production.variance)} danger={production.overBudget} />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Current budget figures are calculated from the active budget revision.
        </p>
      </div>
      <button onClick={onOpenBudget} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
        Open full budget →
      </button>
      <div className="rounded-lg border border-gray-200 p-3">
        <p className="mb-2 text-sm font-medium text-gray-900">Recent line items</p>
        <p className="text-sm text-gray-400">Open the full budget to manage line items, revisions, invoices, and exports.</p>
      </div>
    </div>
  );
}

function DatesTab({ production, onReload }: { production: Production; onReload: () => void }) {
  const [editing, setEditing] = useState<ProductionDate | "new" | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");

  async function remove(dateId: string) {
    if (!window.confirm("Delete this production date?")) return;
    await api.delete(`/api/productions/${production.id}/dates/${dateId}`);
    onReload();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex flex-1 rounded-lg bg-gray-100 p-1">
          <button onClick={() => setView("list")} className={`min-h-10 flex-1 rounded-md text-sm font-medium ${view === "list" ? "bg-white shadow-sm" : "text-gray-600"}`}>List view</button>
          <button onClick={() => setView("calendar")} className={`min-h-10 flex-1 rounded-md text-sm font-medium ${view === "calendar" ? "bg-white shadow-sm" : "text-gray-600"}`}>Calendar view</button>
        </div>
        {view === "list" && (
          <button onClick={() => setEditing("new")} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
            Add date
          </button>
        )}
      </div>
      {view === "calendar" && (
        <div className="h-[640px] overflow-hidden rounded-xl border border-gray-200">
          <CalendarView mode="full" initialView="month" productionId={production.id} />
        </div>
      )}
      {view === "list" && (
        <>
      {production.dates.length === 0 ? <Empty text="No dates yet." /> : production.dates.map((date) => (
        <div key={date.id} className="rounded-lg border border-gray-200 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">{DATE_TYPE_LABELS[date.dateType]}</p>
              <p className="text-sm text-gray-600">{formatDate(date.date)}{date.time ? ` · ${date.time}` : ""}</p>
              {date.location && <p className="text-sm text-gray-500">{date.location}</p>}
              {date.people.length > 0 && <p className="mt-1 text-xs text-gray-500">{date.people.map((p) => fullName(p.contact)).join(", ")}</p>}
            </div>
            <div className="flex gap-1">
              {date.zoomLink && (
                <a href={date.zoomLink} target="_blank" rel="noreferrer" className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                  <ExternalLink size={16} />
                </a>
              )}
              <button onClick={() => setEditing(date)} className="min-h-11 rounded-lg px-3 text-sm text-gray-700">Edit</button>
              <button onClick={() => remove(date.id)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-500"><Trash2 size={16} /></button>
            </div>
          </div>
          {date.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{date.notes}</p>}
        </div>
      ))}
        </>
      )}
      {editing && <DateForm productionId={production.id} date={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onReload(); }} />}
    </div>
  );
}

function DateForm({ productionId, date, onClose, onSaved }: { productionId: string; date: ProductionDate | null; onClose: () => void; onSaved: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [form, setForm] = useState({
    dateType: date?.dateType ?? "MEETING" as ProductionDateType,
    date: date?.date?.slice(0, 10) ?? "",
    time: date?.time ?? "",
    location: date?.location ?? "",
    zoomLink: date?.zoomLink ?? "",
    notes: date?.notes ?? "",
    peopleIds: date?.people.map((p) => p.contactId) ?? [] as string[],
  });

  useEffect(() => {
    api.get<Contact[]>(`/api/contacts${contactSearch ? `?search=${encodeURIComponent(contactSearch)}` : ""}`).then(setContacts).catch(console.error);
  }, [contactSearch]);

  async function save() {
    if (!form.date) return;
    if (date) await api.patch(`/api/productions/${productionId}/dates/${date.id}`, form);
    else await api.post(`/api/productions/${productionId}/dates`, form);
    onSaved();
  }

  return (
    <Modal title={date ? "Edit date" : "Add date"} onClose={onClose}>
      <Select label="Type" value={form.dateType} options={DATE_TYPES.map((v) => ({ value: v, label: DATE_TYPE_LABELS[v] }))} onChange={(dateType) => setForm({ ...form, dateType: dateType as ProductionDateType })} />
      <Input label="Date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
      <Input label="Time" type="time" value={form.time} onChange={(time) => setForm({ ...form, time })} />
      <Input label="Location or platform" value={form.location} onChange={(location) => setForm({ ...form, location })} />
      <Input label="Zoom link" value={form.zoomLink} onChange={(zoomLink) => setForm({ ...form, zoomLink })} />
      <Input label="Attach people" value={contactSearch} onChange={setContactSearch} placeholder="Search contacts" />
      <div className="max-h-40 overflow-auto rounded-lg border border-gray-200">
        {contacts.slice(0, 8).map((contact) => {
          const checked = form.peopleIds.includes(contact.id);
          return (
            <button key={contact.id} onClick={() => setForm({ ...form, peopleIds: checked ? form.peopleIds.filter((id) => id !== contact.id) : [...form.peopleIds, contact.id] })} className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm">
              <span>{fullName(contact)}{contact.company ? ` · ${contact.company.name}` : ""}</span>
              {checked && <Check size={16} />}
            </button>
          );
        })}
      </div>
      <Textarea label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
      <button onClick={save} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Save date</button>
    </Modal>
  );
}

function CrewTab({ production, onReload }: { production: Production; onReload: () => void }) {
  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => { api.get<CrewRole[]>("/api/settings/crew-roles").then(setRoles).catch(console.error); }, []);

  async function updateCrew(crew: CrewMember, patch: Partial<CrewMember>) {
    await api.patch(`/api/productions/${production.id}/crew/${crew.id}`, patch);
    onReload();
  }

  async function remove(crewId: string) {
    if (!window.confirm("Remove this crew member?")) return;
    await api.delete(`/api/productions/${production.id}/crew/${crewId}`);
    onReload();
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setAdding(true)} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Add crew</button>
      {production.crewMembers.length === 0 ? <Empty text="No crew yet." /> : production.crewMembers.map((crew) => (
        <div key={crew.id} className="rounded-lg border border-gray-200 p-3">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{crew.name}</p>
              <p className="text-sm text-gray-500">{crew.role?.name ?? "No role"}</p>
            </div>
            <button onClick={() => remove(crew.id)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-500"><Trash2 size={16} /></button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Select label="Status" value={crew.status} options={CREW_STATUSES.map((s) => ({ value: s, label: CREW_STATUS_LABELS[s] }))} onChange={(status) => updateCrew(crew, { status: status as CrewStatus })} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Day rate" type="number" value={crew.dayRate ?? ""} onChange={(dayRate) => updateCrew(crew, { dayRate })} />
              <Input label="Days" type="number" value={crew.numberOfDays ?? "1"} onChange={(numberOfDays) => updateCrew(crew, { numberOfDays })} />
            </div>
          </div>
        </div>
      ))}
      {adding && <CrewForm productionId={production.id} roles={roles} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onReload(); }} />}
    </div>
  );
}

function CrewForm({ productionId, roles, onClose, onSaved }: { productionId: string; roles: CrewRole[]; onClose: () => void; onSaved: () => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ contactId: "", name: "", email: "", roleId: roles[0]?.id ?? "", status: "REQUESTED" as CrewStatus, dayRate: "", numberOfDays: "1", notes: "" });

  useEffect(() => {
    api.get<Contact[]>(`/api/contacts?type=SUPPLIER${query ? `&search=${encodeURIComponent(query)}` : ""}`).then(setContacts).catch(console.error);
  }, [query]);

  async function save() {
    if (!form.contactId && !form.name.trim()) return;
    await api.post(`/api/productions/${productionId}/crew`, form);
    onSaved();
  }

  return (
    <Modal title="Add crew" onClose={onClose}>
      <Input label="Search suppliers" value={query} onChange={setQuery} placeholder="Search existing suppliers" />
      <div className="max-h-36 overflow-auto rounded-lg border border-gray-200">
        {contacts.slice(0, 6).map((contact) => (
          <button key={contact.id} onClick={() => setForm({ ...form, contactId: contact.id, name: fullName(contact), email: contact.email ?? "" })} className={`min-h-11 w-full px-3 text-left text-sm ${form.contactId === contact.id ? "bg-gray-900 text-white" : ""}`}>
            {fullName(contact)}{contact.company ? ` · ${contact.company.name}` : ""}
          </button>
        ))}
      </div>
      <Input label="Name" value={form.name} onChange={(name) => setForm({ ...form, name, contactId: "" })} placeholder="Create new supplier if not found" />
      <Input label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <Select label="Role" value={form.roleId} options={roles.map((role) => ({ value: role.id, label: role.name }))} onChange={(roleId) => setForm({ ...form, roleId })} />
      <Select label="Status" value={form.status} options={CREW_STATUSES.map((s) => ({ value: s, label: CREW_STATUS_LABELS[s] }))} onChange={(status) => setForm({ ...form, status: status as CrewStatus })} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Day rate" type="number" value={form.dayRate} onChange={(dayRate) => setForm({ ...form, dayRate })} />
        <Input label="Days" type="number" value={form.numberOfDays} onChange={(numberOfDays) => setForm({ ...form, numberOfDays })} />
      </div>
      <Textarea label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
      <button onClick={save} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Save crew</button>
    </Modal>
  );
}

function CommsTab({ production, onReload }: { production: Production; onReload: () => void }) {
  const [mode, setMode] = useState<"note" | "task">("note");
  const [body, setBody] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailResults, setEmailResults] = useState<EmailThread[]>([]);

  const timeline = useMemo(() => {
    const notes = (production.activityNotes ?? []).map((item) => ({ kind: "note" as const, at: item.createdAt, item }));
    const tasks = (production.activityTasks ?? []).map((item) => ({ kind: "task" as const, at: item.createdAt, item }));
    const emails = production.emailThreads.map((thread) => ({ kind: "email" as const, at: thread.lastMessageAt ?? thread.messages.at(-1)?.sentAt ?? thread.updatedAt, item: thread }));
    return [...notes, ...tasks, ...emails].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [production]);

  useEffect(() => {
    if (!linkOpen || !emailSearch.trim()) {
      setEmailResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.get<EmailThreadsResponse>(`/api/email/threads?search=${encodeURIComponent(emailSearch)}`).then((data) => setEmailResults(data.threads)).catch(console.error);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [linkOpen, emailSearch]);

  async function add() {
    if (!body.trim()) return;
    await api.post(`/api/productions/${production.id}/${mode === "note" ? "notes" : "tasks"}`, { body: body.trim() });
    setBody("");
    onReload();
  }

  async function toggleTask(task: ActivityTask) {
    await api.patch(`/api/productions/${production.id}/tasks/${task.id}`, { completed: !task.completed });
    onReload();
  }

  async function removeNote(note: ActivityNote) {
    await api.delete(`/api/productions/${production.id}/notes/${note.id}`);
    onReload();
  }

  async function linkThread(threadId: string) {
    await api.patch(`/api/email/threads/${threadId}/link`, { productionId: production.id });
    setLinkOpen(false);
    setEmailSearch("");
    onReload();
  }

  async function unlinkThread(threadId: string) {
    await api.patch(`/api/email/threads/${threadId}/unlink`, {});
    onReload();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex flex-1 rounded-lg bg-gray-100 p-1">
            {(["note", "task"] as const).map((item) => (
              <button key={item} onClick={() => setMode(item)} className={`min-h-11 flex-1 rounded-md text-sm font-medium ${mode === item ? "bg-white shadow-sm" : "text-gray-600"}`}>
                {item === "note" ? "Note" : "Task"}
              </button>
            ))}
          </div>
          <button onClick={() => setLinkOpen(!linkOpen)} className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs text-gray-700">Link email</button>
        </div>
        {linkOpen && (
          <div className="mb-3 rounded-lg bg-gray-50 p-3">
            <input value={emailSearch} onChange={(e) => setEmailSearch(e.target.value)} placeholder="Search subject or sender" className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" />
            <div className="mt-2 divide-y divide-gray-100">
              {emailResults.map((thread) => (
                <button key={thread.id} onClick={() => linkThread(thread.id)} className="min-h-11 w-full text-left text-sm">
                  <span className="block truncate font-medium text-gray-900">{thread.subject}</span>
                  <span className="block truncate text-xs text-gray-500">{thread.latestPreview}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none" placeholder={mode === "note" ? "Add a note" : "Add a task"} />
        <button onClick={add} className="mt-2 min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Add {mode}</button>
      </div>
      {timeline.length === 0 ? <Empty text="No timeline activity yet." /> : timeline.map((entry) => {
        if (entry.kind === "note") return <TimelineShell key={`n-${entry.item.id}`} icon={<FileText size={14} />} at={entry.at}><p className="whitespace-pre-wrap text-sm text-gray-700">{entry.item.body}</p><button onClick={() => removeNote(entry.item)} className="mt-1 text-xs text-red-500">Delete</button></TimelineShell>;
        if (entry.kind === "task") return <TimelineShell key={`t-${entry.item.id}`} icon={<Check size={14} />} at={entry.at}><button onClick={() => toggleTask(entry.item)} className={`flex min-h-11 items-center gap-2 text-left text-sm ${entry.item.completed ? "text-gray-400 line-through" : "text-gray-800"}`}><span className={`grid h-5 w-5 place-items-center rounded border ${entry.item.completed ? "bg-gray-900 text-white" : "border-gray-300"}`}>{entry.item.completed && <Check size={12} />}</span>{entry.item.body}</button></TimelineShell>;
        return <TimelineShell key={`e-${entry.item.id}`} icon={<Mail size={14} />} at={entry.at}>
          <button onClick={() => { window.location.href = `/email?thread=${entry.item.id}`; }} className="block w-full rounded-lg border border-gray-100 bg-white p-3 text-left">
            <div className="flex items-start gap-2">
              {!entry.item.isRead && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{entry.item.subject || "Email"}</p>
                <p className="truncate text-xs text-gray-500">{entry.item.latestPreview ?? entry.item.messages.at(-1)?.bodyText?.slice(0, 60)}</p>
              </div>
              <span onClick={(event) => { event.stopPropagation(); unlinkThread(entry.item.id); }} className="grid min-h-8 min-w-8 place-items-center text-gray-400 hover:text-red-500"><X size={14} /></span>
            </div>
          </button>
        </TimelineShell>;
      })}
    </div>
  );
}

function TimelineShell({ icon, at, children }: { icon: ReactNode; at: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500">{icon}</div>
      <div className="min-w-0 flex-1 border-b border-gray-100 pb-3">
        {children}
        <p className="mt-1 text-xs text-gray-400">{new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
      </div>
    </div>
  );
}

function InvoicePrompt({ production, onClose }: { production: Production; onClose: () => void }) {
  return (
    <Modal title="Raise FreeAgent invoice?" onClose={onClose}>
      <p className="text-sm text-gray-600">{production.jobCode} is now Wrapped. Raise Invoice is a placeholder until the FreeAgent phase.</p>
      <button onClick={onClose} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Raise Invoice</button>
      <button onClick={onClose} className="min-h-11 w-full rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700">Dismiss</button>
    </Modal>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">{text}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-3 md:grid md:place-items-center">
      <div className="max-h-full overflow-auto rounded-lg bg-white p-4 shadow-xl md:w-[440px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400" />
    </label>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
