import ProductionBookings from "../components/productions/ProductionBookings";
import type { ProjectSummary } from "../lib/workspace";
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TiptapImage from "@tiptap/extension-image";
import { api } from "../lib/api";
import { useDrafts, type Draft } from "../store/draftStore";
import Actions from "./Actions";
import ProjectOverview from "../components/productions/ProjectOverview";
import ProjectCosts from "../components/budgets/ProjectCosts";
import FileBrowser from "../components/files/FileBrowser";
import CalendarView from "../components/calendar/CalendarView";
import OptionsBoardView from "../components/options/OptionsBoardView";
import ProductionWorkbookView from "../components/productions/ProductionWorkbookView";
import ProductionTimelineView from "../components/timeline/ProductionTimelineView";
import SelectsPortal from "../components/selects/SelectsPortal";
import SkuSheetBuilder from "../components/selects/SkuSheetBuilder";
import type {
  ActivityNote,
  ActivityTask,
  Contact,
  CrewItinerary,
  CrewItineraryAppendixPage,
  CrewItineraryItem,
  CrewItineraryItemType,
  CrewMember,
  CrewRole,
  CrewStatus,
  EmailThread,
  EmailThreadsResponse,
  FreeAgentInvoiceStatus,
  JobFile,
  Production,
  ProductionDate,
  ProductionDateType,
  PurchaseOrderContext,
  PurchaseOrderGroup,
  PurchaseOrderStatus,
  ProjectAction,
  ProjectActionStatus,
  ProjectWorkstream,
  ProductionStatus,
} from "../lib/types";
import {
  ACTIVE_PRODUCTION_STATUSES,
  CREW_STATUS_LABELS,
  DATE_TYPE_LABELS,
  PRODUCTION_STATUS_LABELS,
  formatCurrency,
} from "../lib/types";

type PurchaseOrderSendFlowResponse =
  | { mode: "onboarding"; purchaseOrder: PurchaseOrderGroup; onboardingUrl: string; draft?: Draft | null }
  | { mode: "draft"; purchaseOrder: PurchaseOrderGroup; draft: Draft | null };
type PurchaseOrderCreateResponse = PurchaseOrderGroup & {
  revision?: unknown;
  sendFlow?: { mode: "onboarding"; onboardingUrl: string; draft: Draft | null } | { mode: "draft"; draft: Draft | null } | null;
  sendFlowError?: string | null;
};
import {
  ArrowLeft,
  Bed,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Mail,
  Plane,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Train,
  Upload,
  X,
} from "lucide-react";


const DATE_TYPES: ProductionDateType[] = ["PPM", "RECCE", "FITTING", "MEETING", "SHOOT_DAY", "POST_DELIVERY", "OTHER"];
const CREW_STATUSES: CrewStatus[] = ["REQUESTED", "FIRST_OPTION", "SECOND_OPTION", "CONFIRMED", "RELEASED"];
const ITINERARY_ITEM_TYPES: CrewItineraryItemType[] = ["CAR", "TRAIN", "FLIGHT", "HOTEL", "EVENT"];
const INVOICE_STATUSES: FreeAgentInvoiceStatus[] = ["NOT_RAISED", "DRAFT", "SENT", "VIEWED", "PAID", "OVERDUE"];
const TABS = ["Overview", "Actions", "Status Doc", "Options", "Budget", "Timeline", "Dates", "Crew", "POs", "Comms", "SKU Sheet", "Selects", "Files"] as const;
type Tab = typeof TABS[number];
const PO_STATUSES: PurchaseOrderStatus[] = ["DRAFT", "SENT", "ACCEPTED", "PART_BILLED", "BILLED", "PAID", "CANCELLED"];
type ParsedBill = {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  amountNet: number | null;
  amountGross: number | null;
  vatAmount: number | null;
  vatRate: number | null;
  currency: string;
  description: string | null;
  confidence: "high" | "medium" | "low";
  rawText: string | null;
  lineItems: Array<{ description: string | null; amountNet: number | null; amountGross: number | null; vatAmount: number | null }>;
  allocations: Array<{ id: string; amount: number; matchedLineItems?: string[] }>;
};
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
  if (normalized === "status-doc" || normalized === "status doc" || normalized === "status") return "Status Doc";
  if (normalized === "actions") return "Actions";
  if (normalized === "overview") return "Overview";
  if (normalized === "dates") return "Dates";
  if (normalized === "crew") return "Crew";
  if (normalized === "comms") return "Comms";
  if (normalized === "files") return "Files";
  if (normalized === "selects") return "Selects";
  if (normalized === "sku-sheet" || normalized === "sku sheet" || normalized === "skus") return "SKU Sheet";
  if (normalized === "budget") return "Budget";
  if (normalized === "options") return "Options";
  if (normalized === "timeline") return "Timeline";
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

function displayItineraryTitle(title: string | null | undefined, crewName: string) {
  const cleaned = (title ?? "").replace(/\s+travel itinerary\s*$/i, "").trim();
  return cleaned || crewName;
}

export default function Productions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [productions, setProductions] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("production"));
  const [loading, setLoading] = useState(true);
  const [includeWrapped, setIncludeWrapped] = useState(searchParams.get("archive") === "true");
  const [search, setSearch] = useState("");
  const listRequest = useRef(0);
  const [listError, setListError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [invoicePrompt, setInvoicePrompt] = useState<Production | null>(null);

  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setListError("");
    try {
      const qs = new URLSearchParams();
      if (includeWrapped) qs.set("includeWrapped", "true");
      if (search.trim()) qs.set("search", search.trim());
      const data = await api.get<ProjectSummary[]>(`/api/productions/summary${qs.toString() ? `?${qs}` : ""}`);
      if (request === listRequest.current) setProductions(data);
    } catch {
      if (request === listRequest.current) setListError("Could not load projects. Try again.");
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [includeWrapped, search]);

  useEffect(() => { const timer = setTimeout(() => { void load().catch(() => setListError("Could not load projects. Try again.")); }, 200); return () => clearTimeout(timer); }, [load]);
  const requestedProject = searchParams.get("production");
  useEffect(() => setSelectedId(requestedProject), [requestedProject]);

  const selected = productions.find((p) => p.id === selectedId) ?? null;
  const activeProductions = productions.filter((production) => ACTIVE_PRODUCTION_STATUSES.includes(production.status));
  const upcomingProductions = productions
    .filter((production) => production.nextDate)
    .sort((a, b) => String(a.nextDate?.date ?? "").localeCompare(String(b.nextDate?.date ?? "")))
    .slice(0, 5);
  const overBudgetCount = productions.filter((production) => production.overBudget).length;
  const crewCount = productions.reduce((sum, production) => sum + production.crewCount, 0);

  function selectProduction(id: string | null) {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams);
    next.delete("workbook");
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

  function openOptions(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("production", id);
    next.delete("view");
    next.delete("optionGroup");
    next.set("tab", "options");
    setSearchParams(next, { replace: true });
  }

  if (selectedId) {
    return (
      <ProductionWorkspace
        productionId={selectedId}
        key={selectedId}
        initialTab={tabFromQuery(searchParams.get("tab"))}
        onClose={() => selectProduction(null)}
        onSaved={load}
        onInvoicePrompt={setInvoicePrompt}
      />
    );
  }

  return (
    <div className="flex h-full bg-[#f5f6f4]">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="border-b border-gray-200 bg-white px-4 py-4 lg:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-950">Projects</h1>
              {listError && <p role="alert" className="text-red-700">{listError} <button className="underline" onClick={() => void load()}>Retry</button></p>}
              <p className="mt-1 text-sm text-gray-500">Status docs, open actions, crew holds, dates, files, and job health.</p>
            </div>
            <button
              onClick={() => setShowNew(true)}
              className="min-h-10 flex items-center gap-1.5 rounded-md bg-gray-950 px-3 text-sm font-medium text-white"
            >
              <Plus size={16} /> New
            </button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <ProductionIndexMetric label="Active" value={String(activeProductions.length)} />
            <ProductionIndexMetric label="Next dates" value={String(upcomingProductions.length)} />
            <ProductionIndexMetric label="Crew rows" value={String(crewCount)} />
            <ProductionIndexMetric label="Over budget" value={String(overBudgetCount)} tone={overBudgetCount ? "red" : "green"} />
          </div>
          <div className="mt-4 flex gap-2">
            <label className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search job code, client, brand, notes"
                className="min-h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400"
              />
            </label>
            <button
              onClick={toggleArchive}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium ${includeWrapped ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
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
          <div className="min-h-0 flex-1 overflow-auto p-3 lg:p-5">
            <div className="min-w-[860px] overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="grid grid-cols-[minmax(250px,1.5fr)_140px_220px_100px_130px] border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <span>Production</span>
                <span>Status</span>
                <span>Next date</span>
                <span className="text-right">Crew</span>
                <span className="text-right">Variance</span>
              </div>
              {productions.map((production) => (
                <button
                  key={production.id}
                  onClick={() => selectProduction(production.id)}
                  className="grid min-h-16 w-full grid-cols-[minmax(250px,1.5fr)_140px_220px_100px_130px] items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-teal-700">{production.jobCode ?? "No code"}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-gray-950">{production.title}</p>
                    <p className="truncate text-xs text-gray-500">{production.clientName ?? "No client"}{production.brand ? ` · ${production.brand}` : ""}</p>
                  </div>
                  <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${statusClass(production.status)}`}>
                    {PRODUCTION_STATUS_LABELS[production.status]}
                  </span>
                  <span className="truncate text-sm text-gray-700">{production.nextDate ? `${DATE_TYPE_LABELS[production.nextDate.dateType]} · ${formatDate(production.nextDate.date)}` : "None"}</span>
                  <span className="text-right text-sm font-medium tabular-nums text-gray-900">{production.crewCount}</span>
                  <span className={`text-right text-sm font-semibold tabular-nums ${production.overBudget ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(production.variance)}</span>
                </button>
              ))}
            </div>
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
            setSearchParams({production:production.id,tab:"Budget"});
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

function ProductionIndexMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "red" }) {
  const toneClass = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-600" : "text-gray-950";
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ProductionForm({ onClose, onSaved }: { onClose: () => void; onSaved: (production: Production) => void }) {
  const [form,setForm]=useState({title:"",clientName:"",brand:"",template:"STILLS",currency:"GBP",createDrive:true});
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [request,setRequest]=useState({signature:"",id:crypto.randomUUID()});
  async function save(){if(!form.title.trim()||busy)return;setBusy(true);setError("");const signature=JSON.stringify(form);const id=request.signature===signature?request.id:crypto.randomUUID();setRequest({signature,id});try{const p=await api.post<Production>("/api/project-workspace",{...form,requestId:id});onSaved(p);}catch(e){setError(e instanceof Error?e.message:"Could not create project.");}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-[800] bg-black/30 p-3 md:grid md:place-items-center"><div role="dialog" aria-modal="true" aria-label="New project" className="max-h-full overflow-auto rounded-xl bg-white p-5 shadow-xl md:w-[480px]"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-medium">Start a new project</h2><button aria-label="Close new project" disabled={busy} onClick={onClose} className="p-2"><X size={18}/></button></div><p className="mb-5 text-sm text-stone-500">A starter estimate and organised Drive folders, ready to build from.</p>{error&&<p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="space-y-4"><Input label="Project name" value={form.title} onChange={title=>setForm({...form,title})}/><Input label="Client" value={form.clientName} onChange={clientName=>setForm({...form,clientName})}/><Input label="Brand" value={form.brand} onChange={brand=>setForm({...form,brand})}/><Select label="Start from" value={form.template} options={[{value:"STILLS",label:"Stills shoot"},{value:"MOTION",label:"Motion campaign"},{value:"EVENTS",label:"Event"},{value:"BLANK",label:"Simple project"}]} onChange={template=>setForm({...form,template})}/><Select label="Project currency" value={form.currency} options={["GBP","EUR","USD","CHF","CAD","AUD"].map(value=>({value,label:value}))} onChange={currency=>setForm({...form,currency})}/><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={form.createDrive} onChange={e=>setForm({...form,createDrive:e.target.checked})}/><span>Create the project folder in Google Drive<span className="mt-1 block text-xs text-stone-500">Includes estimates, internal finance, supplier invoices and deliverables. Existing folders stay as they are.</span></span></label><button disabled={busy||!form.title.trim()} onClick={save} className="min-h-11 w-full rounded-md bg-stone-900 px-4 text-sm font-medium text-white disabled:opacity-40">{busy?"Creating project…":"Create project & estimate"}</button></div></div></div>;
}

function ProductionWorkspace({ productionId, initialTab, onClose, onSaved, onInvoicePrompt }: {
  productionId: string;
  initialTab: Tab;
  onClose: () => void;
  onSaved: () => void;
  onInvoicePrompt: (production: Production) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [production, setProduction] = useState<Production | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);

  const reload = useCallback(() => {
    api.get<Production>(`/api/productions/${productionId}`).then(setProduction).catch(console.error);
  }, [productionId]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => setTab(initialTab), [initialTab]);

  if (!production) return <div className="grid h-full place-items-center text-sm text-gray-400">Loading project...</div>;
  if (searchParams.get("workbook") === "true") {
    return <ProductionWorkbookView production={production} onBack={onClose} />;
  }

  async function saveOverview(data: Partial<Production>) {
    const res = await api.patch<{ production: Production; invoicePrompt: boolean }>(`/api/productions/${productionId}`, data);
    setProduction(res.production);
    if (res.invoicePrompt) onInvoicePrompt(res.production);
    onSaved();
  }

  function selectModule(nextTab: Tab) {
    const next = new URLSearchParams(searchParams);
    next.set("production", productionId);
    next.set("tab", nextTab);
    if (nextTab !== "Options") next.delete("optionGroup");
    next.delete("view");
    setTab(nextTab);
    setSearchParams(next);
  }

  const projectName = production.title || [production.brand, production.clientName].filter(Boolean).join(" x ") || production.jobCode || "Project";
  const projectMeta = [
    production.jobCode,
    production.clientName,
    PRODUCTION_STATUS_LABELS[production.status],
  ].filter(Boolean).join(" · ");
  const modules: Tab[] = ["Overview", "Actions", "Options", "Crew", "Timeline", "Budget", "Files"];
  const moduleLabel: Record<Tab, string> = {
    "Status Doc": "Status Doc",
    Overview: "Overview",
    Actions: "Actions",
    Options: "Casting & options",
    Budget: "Costs",
    Timeline: "Schedule",
    Dates: "Dates",
    Crew: "Crew List",
    POs: "POs",
    Comms: "Comms",
    "SKU Sheet": "SKU Sheet",
    Selects: "Selects",
    Files: "Files",
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#1f1f1f]">
      <div className="shrink-0 border-b border-[#dcdfe3] bg-white">
        <div className="flex min-h-[62px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 lg:flex-nowrap lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="Back to projects">
              <ArrowLeft size={17} />
            </button>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#0f8f7f] text-sm font-bold text-white shadow-sm">◆</div>
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold text-[#1f1f1f]">{projectName}</h1>
              <p className="truncate text-xs text-gray-500">{projectMeta}</p>
            </div>
          </div>
          <div className="order-last flex h-10 min-w-0 basis-full items-center gap-5 overflow-x-auto text-[14px] font-medium text-gray-600 lg:order-none lg:basis-auto lg:flex-1">
            {modules.map((item) => (
              <button
                key={item}
                onClick={() => selectModule(item)}
                className={`relative h-full shrink-0 whitespace-nowrap px-0.5 hover:text-gray-900 ${
                  tab === item ? "text-[#111827]" : ""
                }`}
              >
                {moduleLabel[item]}
                {tab === item && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[#0f8f7f]" />}
              </button>
            ))}
          </div>
          <select aria-label="Additional project modules" className="workspace-select max-w-32" value={modules.includes(tab) ? "" : tab} onChange={e => selectModule(e.target.value as Tab)}><option value="" disabled>More</option>{TABS.filter(item => !modules.includes(item)).map(item => <option key={item} value={item}>{item}</option>)}</select>
          <button className="text-xs text-stone-500 hover:underline" onClick={() => { const next = new URLSearchParams(searchParams); next.set("workbook", "true"); setSearchParams(next); }}>Workbook ↗</button>
          <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(production.status)}`}>
            {PRODUCTION_STATUS_LABELS[production.status]}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "Options" ? (
          <OptionsBoardView productionId={production.id} onBack={() => selectModule("Overview")} embedded />
        ) : tab === "Budget" ? (
          <ProjectCosts key={production.id} production={production} onBack={() => selectModule("Overview")} />
        ) : (
          <div className="flex h-full min-h-0 bg-white">
            <div className="min-w-0 flex-1 overflow-auto p-4 lg:p-5">
              {tab === "Actions" && <Actions productionId={production.id} />}
              {tab === "Overview" && <><ProjectOverview key={production.id} production={production} onActions={() => selectModule("Actions")} onCrew={() => selectModule("Crew")} /><details className="max-w-5xl mx-auto mt-8 border-t border-stone-200 pt-4"><summary className="text-sm text-stone-500 cursor-pointer">Project settings, notes & financial summary</summary><div className="mt-4"><OverviewTab production={production} onSave={saveOverview} onStatusSaved={(p) => { setProduction(p); onSaved(); }} onInvoicePrompt={onInvoicePrompt} onOpenBudget={() => selectModule("Budget")} /></div></details></>}
              {tab === "Status Doc" && <StatusDocTab production={production} onReloadProduction={reload} onOpenTimeline={() => selectModule("Timeline")} onOpenCrew={() => selectModule("Crew")} onOpenFiles={() => selectModule("Files")} onOpenComms={() => selectModule("Comms")} />}
              {tab === "Timeline" && <><ProductionBookings productionId={production.id} schedule/><ProductionTimelineView productionId={production.id} /></>}
              {tab === "Dates" && <DatesTab production={production} onReload={reload} />}
              {tab === "Crew" && <><ProductionBookings productionId={production.id} onChanged={reload}/><CrewTab production={production} onReload={reload} /></>}
              {tab === "Comms" && <CommsTab production={production} onReload={reload} />}
              {tab === "SKU Sheet" && <SkuSheetBuilder productionId={production.id} />}
              {tab === "Selects" && <SelectsPortal productionId={production.id} />}
              {tab === "Files" && <FileBrowser productionId={production.id} />}
              {tab === "POs" && (production.workspaceVersion===2?<ProjectCosts production={production} initialTab="pos" onBack={()=>setTab("Budget")}/>:<PurchaseOrdersTab production={production} />)}
            </div>
          </div>
        )}
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
        {tab === "Actions" && <Actions productionId={production.id} />}
              {tab === "Overview" && <OverviewTab production={production} onSave={saveOverview} onStatusSaved={(p) => { setProduction(p); onSaved(); }} onInvoicePrompt={onInvoicePrompt} onOpenBudget={onOpenBudget} />}
        {tab === "Status Doc" && <StatusDocTab production={production} onReloadProduction={reload} onOpenTimeline={() => setTab("Timeline")} onOpenCrew={() => setTab("Crew")} onOpenFiles={() => setTab("Files")} onOpenComms={() => setTab("Comms")} />}
        {tab === "Dates" && <DatesTab production={production} onReload={reload} />}
        {tab === "Timeline" && <><ProductionBookings productionId={production.id} schedule/><ProductionTimelineView productionId={production.id} /></>}
        {tab === "Crew" && <><ProductionBookings productionId={production.id} onChanged={reload}/><CrewTab production={production} onReload={reload} /></>}
        {tab === "Comms" && <CommsTab production={production} onReload={reload} />}
        {tab === "SKU Sheet" && <SkuSheetBuilder productionId={production.id} />}
        {tab === "Selects" && <SelectsPortal productionId={production.id} />}
        {tab === "Files" && <FileBrowser productionId={production.id} />}
        {tab === "Budget" && <ProductionBudgetSummary production={production} onOpenBudget={onOpenBudget} />}
        {tab === "Options" && <OptionsBoardView productionId={production.id} onBack={() => setTab("Overview")} />}
        {tab === "POs" && (production.workspaceVersion===2?<ProjectCosts production={production} initialTab="pos" onBack={()=>setTab("Budget")}/>:<PurchaseOrdersTab production={production} />)}
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
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null);
  const [parsing, setParsing] = useState(false);
  const [lineAssignments, setLineAssignments] = useState<Record<number, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(po.allocations.map((allocation) => [allocation.id, String(allocation.amount ?? 0)])));
  const [saving, setSaving] = useState(false);

  function parsedLineAmount(lineItem: ParsedBill["lineItems"][number]) {
    return lineItem.amountNet ?? lineItem.amountGross ?? 0;
  }

  function inferLineAssignments(parsed: ParsedBill) {
    const inferred: Record<number, string> = {};
    parsed.lineItems.forEach((lineItem, index) => {
      if (!lineItem.description) return;
      const matchedAllocation = parsed.allocations.find((allocation) =>
        allocation.matchedLineItems?.some((match) => match === lineItem.description)
      );
      if (matchedAllocation) inferred[index] = matchedAllocation.id;
    });
    return inferred;
  }

  function allocationAmountsFromLines(assignments: Record<number, string>, parsed: ParsedBill) {
    const next = Object.fromEntries(po.allocations.map((allocation) => [allocation.id, "0"]));
    parsed.lineItems.forEach((lineItem, index) => {
      const allocationId = assignments[index];
      if (!allocationId) return;
      const current = Number(next[allocationId] ?? 0);
      next[allocationId] = String(Math.round((current + parsedLineAmount(lineItem)) * 100) / 100);
    });
    return next;
  }

  function updateLineAssignment(index: number, allocationId: string) {
    if (!parsedBill) return;
    const nextAssignments = { ...lineAssignments, [index]: allocationId };
    if (!allocationId) delete nextAssignments[index];
    setLineAssignments(nextAssignments);
    setAmounts(allocationAmountsFromLines(nextAssignments, parsedBill));
  }

  async function parseInvoice(nextFile: File) {
    setParsing(true);
    setParsedBill(null);
    try {
      const form = new FormData();
      form.append("invoiceFile", nextFile);
      const res = await fetch(`/api/budgets/purchase-orders/${po.id}/parse-bill`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Invoice parse failed" }));
        throw new Error(typeof body.error === "string" ? body.error : "Invoice parse failed");
      }
      const parsed = await res.json() as ParsedBill;
      const inferredAssignments = inferLineAssignments(parsed);
      setParsedBill(parsed);
      setLineAssignments(inferredAssignments);
      if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
      if (parsed.invoiceDate) setInvoiceDate(parsed.invoiceDate.slice(0, 10));
      if (parsed.allocations.length) {
        setAmounts((current) => ({
          ...current,
          ...Object.fromEntries(parsed.allocations.map((allocation) => [allocation.id, String(allocation.amount)])),
        }));
      }
    } finally {
      setParsing(false);
    }
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    if (nextFile) parseInvoice(nextFile).catch((err: unknown) => window.alert(err instanceof Error ? err.message : "Invoice parse failed"));
    else {
      setParsedBill(null);
      setLineAssignments({});
    }
  }

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
              <span className="mt-1 text-xs text-gray-400">
                {parsing ? "Reading invoice with AI..." : "PDF or image. AI will prefill invoice fields and allocation suggestions."}
              </span>
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {parsedBill && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">
                <p className="font-medium">AI parsed {parsedBill.confidence} confidence</p>
                <p>
                  {[parsedBill.supplierName, parsedBill.amountNet !== null ? `net ${formatCurrency(parsedBill.amountNet)}` : null, parsedBill.vatAmount !== null ? `VAT ${formatCurrency(parsedBill.vatAmount)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {parsedBill.lineItems.length > 0 && (
                  <p className="mt-1 text-blue-700">{parsedBill.lineItems.length} invoice line item{parsedBill.lineItems.length === 1 ? "" : "s"} matched where possible</p>
                )}
                {parsedBill.description && <p className="mt-1 text-blue-700">{parsedBill.description}</p>}
              </div>
            )}
          </section>

          {parsedBill?.lineItems.length ? (
            <section className="rounded-lg border border-gray-200">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Invoice line review</h4>
                <span className="text-[11px] text-gray-400">Assign lines to budget allocations</span>
              </div>
              <div className="divide-y divide-gray-50">
                {parsedBill.lineItems.map((lineItem, index) => (
                  <div key={`${lineItem.description ?? "line"}-${index}`} className="grid grid-cols-[1fr_92px_180px] items-center gap-3 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">{lineItem.description || "Invoice line"}</p>
                      {lineItem.vatAmount !== null && <p className="mt-0.5 text-[11px] text-gray-400">VAT {formatCurrency(lineItem.vatAmount)}</p>}
                    </div>
                    <div className="text-right font-medium tabular-nums text-gray-900">{formatCurrency(parsedLineAmount(lineItem))}</div>
                    <select
                      value={lineAssignments[index] ?? ""}
                      onChange={(event) => updateLineAssignment(index, event.target.value)}
                      className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 outline-none focus:border-gray-500"
                    >
                      <option value="">Unassigned</option>
                      {po.allocations.map((allocation) => (
                        <option key={allocation.id} value={allocation.id}>
                          {allocation.lineItem.lineCode} {allocation.lineItem.description}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

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
                  {parsedBill?.allocations.find((item) => item.id === allocation.id)?.matchedLineItems?.length ? (
                    <p className="mt-0.5 truncate text-[11px] text-blue-600">
                      Matched: {parsedBill.allocations.find((item) => item.id === allocation.id)?.matchedLineItems?.join(", ")}
                    </p>
                  ) : null}
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
  const { refreshDrafts, maximizeDraft } = useDrafts();
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [blackbookEntryId, setBlackbookEntryId] = useState<string | null>(null);
  const [optionCandidateId, setOptionCandidateId] = useState("");
  const [query, setQuery] = useState("");
  const [blackbookResults, setBlackbookResults] = useState<Array<{ id: string; displayName: string; email?: string | null; phone?: string | null }>>([]);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [createdPoNumber, setCreatedPoNumber] = useState("");

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
  }

  function selectedAllocations() {
    return Object.entries(allocations)
      .map(([lineItemId, amount]) => ({ lineItemId, amount: Number(amount || 0) }))
      .filter((allocation) => allocation.amount > 0);
  }

  async function save() {
    setSaving(true);
    try {
      const created = await api.post<PurchaseOrderCreateResponse>(`/api/budgets/production/${production.id}/purchase-orders`, {
        supplierName,
        supplierEmail: supplierEmail || null,
        supplierPhone: supplierPhone || null,
        blackbookEntryId,
        optionCandidateId: optionCandidateId || null,
        allocations: selectedAllocations(),
      });
      if (created.sendFlowError) window.alert(`PO created, but follow-up draft failed: ${created.sendFlowError}`);
      const result = created.sendFlow ?? await api.post<PurchaseOrderSendFlowResponse>(`/api/budgets/purchase-orders/${created.id}/send-flow`, {
        supplierEmail: supplierEmail || null,
        requireOnboarding: !blackbookEntryId,
      });
      if (result.mode === "onboarding") {
        setOnboardingUrl(result.onboardingUrl);
        setCreatedPoNumber(created.poNumber);
        await navigator.clipboard?.writeText(result.onboardingUrl).catch(() => undefined);
        await refreshDrafts();
        if (result.draft?.id) maximizeDraft(result.draft.id);
        return;
      }
      await refreshDrafts();
      if (result.draft?.id) maximizeDraft(result.draft.id);
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
          {onboardingUrl ? (
            <>
              <section className="rounded-lg border border-[#caeee9] bg-[#e9fbf8] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#166f64]">Supplier onboarding link</p>
                <h3 className="mt-2 text-sm font-semibold text-gray-900">{createdPoNumber} is ready for supplier onboarding</h3>
                <p className="mt-2 text-xs leading-5 text-[#166f64]">Send this link to the supplier. When they complete the form, Blackbook is updated and the attached PO email draft is created.</p>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-[#b9e8e1] bg-white p-2">
                  <input readOnly value={onboardingUrl} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-gray-900 outline-none" />
                  <button onClick={() => navigator.clipboard?.writeText(onboardingUrl).catch(console.error)} className="min-h-8 rounded-md bg-gray-900 px-3 text-xs font-medium text-white">Copy</button>
                </div>
              </section>
              <div className="flex justify-end">
                <button onClick={onCreated} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Done</button>
              </div>
            </>
          ) : (
          <>
          <section className="rounded-lg border border-gray-200 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-gray-400">Supplier</h4>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">From Crew & Suppliers
                <select value={optionCandidateId} onChange={(event) => selectCandidate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900">
                  <option value="">No linked record</option>
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
            <button onClick={save} disabled={saving || !supplierName.trim() || !supplierEmail.trim() || selectedAllocations().length === 0} className="min-h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">
              {saving ? "Creating..." : blackbookEntryId ? "Create PO draft" : "Create onboarding link"}
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

type ProjectActionsResponse = {
  workstreams: ProjectWorkstream[];
  actions: ProjectAction[];
  dates: ProductionDate[];
};

type StatusDocPage =
  | "Dashboard"
  | "To Do"
  | "Crew List"
  | "Holds"
  | "Timeline"
  | "Run Of Show"
  | "Travel"
  | "Hotels"
  | "Cars"
  | "Equipment"
  | "Deliveries"
  | "Locations"
  | "Casting"
  | "Files & Comms"
  | "Meeting Notes";

const STATUS_DOC_PAGES: StatusDocPage[] = [
  "Dashboard",
  "To Do",
  "Crew List",
  "Holds",
  "Timeline",
  "Run Of Show",
  "Travel",
  "Hotels",
  "Cars",
  "Equipment",
  "Deliveries",
  "Locations",
  "Casting",
  "Files & Comms",
  "Meeting Notes",
];

const PROJECT_ACTION_STATUS_LABELS: Record<ProjectActionStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  DONE: "Done",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

function projectActionStatusClass(status: ProjectActionStatus) {
  if (status === "DONE") return "bg-emerald-50 text-emerald-700";
  if (status === "BLOCKED") return "bg-red-50 text-red-700";
  if (status === "WAITING") return "bg-amber-50 text-amber-700";
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "CANCELLED") return "bg-gray-50 text-gray-400";
  return "bg-gray-100 text-gray-700";
}

function isUpcoming(value?: string | null, days = 7) {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const date = new Date(value);
  return date >= today && date <= end;
}

function StatusDocTab({
  production,
  onReloadProduction,
  onOpenTimeline,
  onOpenCrew,
  onOpenFiles,
  onOpenComms,
}: {
  production: Production;
  onReloadProduction: () => void;
  onOpenTimeline: () => void;
  onOpenCrew: () => void;
  onOpenFiles: () => void;
  onOpenComms: () => void;
}) {
  const [projectData, setProjectData] = useState<ProjectActionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [newActionWorkstreamId, setNewActionWorkstreamId] = useState("");
  const [newActionDate, setNewActionDate] = useState("");
  const [newWorkstreamName, setNewWorkstreamName] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [savingWorkstream, setSavingWorkstream] = useState(false);
  const [statusPage, setStatusPage] = useState<StatusDocPage>("Dashboard");

  const loadProjectData = useCallback(async () => {
    const data = await api.get<ProjectActionsResponse>(`/api/project-actions/production/${production.id}`);
    setProjectData(data);
    setLoadError(null);
  }, [production.id]);

  useEffect(() => {
    let cancelled = false;
    api.get<ProjectActionsResponse>(`/api/project-actions/production/${production.id}`)
      .then((data) => {
        if (!cancelled) {
          setProjectData(data);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load project actions");
      });
    return () => { cancelled = true; };
  }, [production.id]);

  async function createAction() {
    const title = newActionTitle.trim();
    if (!title) return;
    setSavingAction(true);
    try {
      await api.post<ProjectAction>(`/api/project-actions/production/${production.id}/actions`, {
        title,
        workstreamId: newActionWorkstreamId || null,
        startAt: newActionDate || null,
        actionType: newActionDate ? "DEADLINE" : "TASK",
        status: "TODO",
        visibility: "INTERNAL",
        isAllDay: true,
      });
      setNewActionTitle("");
      setNewActionDate("");
      await loadProjectData();
    } finally {
      setSavingAction(false);
    }
  }

  async function createWorkstream() {
    const name = newWorkstreamName.trim();
    if (!name) return;
    setSavingWorkstream(true);
    try {
      const workstream = await api.post<ProjectWorkstream>(`/api/project-actions/production/${production.id}/workstreams`, { name });
      setNewWorkstreamName("");
      setNewActionWorkstreamId(workstream.id);
      await loadProjectData();
    } finally {
      setSavingWorkstream(false);
    }
  }

  async function updateActionStatus(action: ProjectAction, status: ProjectActionStatus) {
    await api.patch<ProjectAction>(`/api/project-actions/actions/${action.id}`, { status });
    await loadProjectData();
  }

  async function patchAction(action: ProjectAction, patch: Partial<ProjectAction>) {
    await api.patch<ProjectAction>(`/api/project-actions/actions/${action.id}`, patch);
    await loadProjectData();
  }

  async function patchCrew(crew: CrewMember, patch: Partial<CrewMember>) {
    await api.patch<CrewMember>(`/api/productions/${production.id}/crew/${crew.id}`, patch);
    onReloadProduction();
  }

  const actions = projectData?.actions ?? [];
  const workstreams = projectData?.workstreams ?? [];
  const productionDates = (projectData?.dates?.length ? projectData.dates : production.dates).slice()
    .sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`));
  const upcomingDates = productionDates.filter((date) => isUpcoming(date.date, 14)).slice(0, 8);
  const openActions = actions
    .filter((action) => action.status !== "DONE" && action.status !== "CANCELLED")
    .sort((a, b) => (a.startAt ?? a.updatedAt).localeCompare(b.startAt ?? b.updatedAt))
    .slice(0, 10);
  const nextActions = openActions.filter((action) => isUpcoming(action.startAt, 14)).slice(0, 6);
  const runOfShowActions = actions
    .filter((action) => action.startAt && ["EVENT", "MEETING", "TRAVEL", "SHOOT"].includes(action.actionType))
    .sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)))
    .slice(0, 10);
  const visibleCrew = production.crewMembers.filter((crew) => !crew.hiddenFromCrewList);
  const crewByStatus = CREW_STATUSES.map((status) => ({
    status,
    count: visibleCrew.filter((crew) => crew.status === status).length,
  }));
  const confirmedCrew = visibleCrew.filter((crew) => crew.status === "CONFIRMED").slice(0, 8);
  const holdingCrew = visibleCrew.filter((crew) => crew.status !== "CONFIRMED" && crew.status !== "RELEASED").slice(0, 8);
  const itineraryRows = visibleCrew.reduce((sum, crew) => sum + (crew.itinerary?._count?.items ?? 0), 0);
  const recentFiles = (production.jobFiles ?? []).slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 5);
  const recentThreads = (production.emailThreads ?? []).slice()
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, 5);
  const actionCounts = actions.reduce<Record<ProjectActionStatus, number>>((acc, action) => {
    acc[action.status] = (acc[action.status] ?? 0) + 1;
    return acc;
  }, { TODO: 0, IN_PROGRESS: 0, WAITING: 0, DONE: 0, BLOCKED: 0, CANCELLED: 0 });

  const pageProps = {
    production,
    actions,
    workstreams,
    productionDates,
    visibleCrew,
    recentFiles,
    recentThreads,
    createAction,
    updateActionStatus,
    patchAction,
    patchCrew,
    loadProjectData,
    onOpenTimeline,
    onOpenCrew,
    onOpenFiles,
    onOpenComms,
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{production.jobCode ?? "No job code"}</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950">{production.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{[production.clientName, production.brand, production.jobType].filter(Boolean).join(" · ") || "No client details"}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
            <StatusMetric label="Status" value={PRODUCTION_STATUS_LABELS[production.status]} />
            <StatusMetric label="Next date" value={production.nextDate ? formatDate(production.nextDate.date) : "None"} />
            <StatusMetric label="Quoted" value={formatCurrency(production.quotedValue ?? Number(production.value ?? 0))} />
            <StatusMetric label="Actual" value={formatCurrency(production.actualSpend ?? 0)} />
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 -mx-1 overflow-x-auto border-b border-gray-200 bg-white/95 px-1 py-2 backdrop-blur">
        <div className="flex min-w-max gap-1">
          {STATUS_DOC_PAGES.map((page) => (
            <button
              key={page}
              onClick={() => setStatusPage(page)}
              className={`h-9 rounded-md px-3 text-sm font-medium ${statusPage === page ? "bg-gray-950 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"}`}
            >
              {page}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>}

      {statusPage !== "Dashboard" ? (
        <StatusDocPageView page={statusPage} {...pageProps} />
      ) : (
      <>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <StatusPanel title="Open Actions" actionLabel="Timeline" onAction={onOpenTimeline}>
          <div className="mb-3 grid gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 lg:grid-cols-[1fr_180px_140px_auto]">
            <input
              value={newActionTitle}
              onChange={(event) => setNewActionTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createAction().catch(console.error);
              }}
              placeholder="Add a task, question, chase, or deadline"
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
            />
            <select value={newActionWorkstreamId} onChange={(event) => setNewActionWorkstreamId(event.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-400">
              <option value="">No workstream</option>
              {workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}
            </select>
            <input value={newActionDate} onChange={(event) => setNewActionDate(event.target.value)} type="date" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-400" />
            <button onClick={() => createAction().catch(console.error)} disabled={savingAction || !newActionTitle.trim()} className="h-9 rounded-md bg-gray-950 px-3 text-sm font-medium text-white disabled:opacity-40">Add</button>
          </div>
          {openActions.length ? (
            <div className="divide-y divide-gray-100">
              {openActions.map((action) => (
                <div key={action.id} className="grid gap-2 py-3 lg:grid-cols-[1fr_auto_auto]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-950">{action.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{[action.workstream?.name, action.startAt ? formatDate(action.startAt) : null, action.location].filter(Boolean).join(" · ") || action.actionType.replace(/_/g, " ")}</p>
                  </div>
                  <span className={`h-fit rounded-full px-2 py-1 text-xs font-medium ${projectActionStatusClass(action.status)}`}>{PROJECT_ACTION_STATUS_LABELS[action.status]}</span>
                  <div className="flex flex-wrap gap-1">
                    {(["TODO", "IN_PROGRESS", "WAITING", "DONE"] as ProjectActionStatus[]).map((status) => (
                      <button key={status} onClick={() => updateActionStatus(action, status).catch(console.error)} className="h-7 rounded border border-gray-200 px-2 text-[11px] text-gray-600 hover:bg-gray-50">{PROJECT_ACTION_STATUS_LABELS[status]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStatus text="No open project actions." />
          )}
        </StatusPanel>

        <StatusPanel title="Next Dates" actionLabel="Timeline" onAction={onOpenTimeline}>
          {upcomingDates.length ? (
            <div className="space-y-2">
              {upcomingDates.map((date) => (
                <div key={date.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-950">{date.label || DATE_TYPE_LABELS[date.dateType]}</p>
                    <span className="text-xs text-gray-500">{formatDate(date.date)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{[date.time, date.location, date.status.replace(/_/g, " ")].filter(Boolean).join(" · ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStatus text="No upcoming production dates." />
          )}
        </StatusPanel>
      </div>

      <StatusPanel title="Run Of Show / Logistics" actionLabel="Timeline" onAction={onOpenTimeline}>
        {runOfShowActions.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[150px_120px_1fr_180px_130px] border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                <span>Time</span>
                <span>Phase</span>
                <span>Action</span>
                <span>Owner / Lane</span>
                <span>Status</span>
              </div>
              {runOfShowActions.map((action) => (
                <div key={action.id} className="grid grid-cols-[150px_120px_1fr_180px_130px] items-center gap-3 border-b border-gray-100 py-2 text-sm last:border-b-0">
                  <span className="text-gray-600">{action.startAt ? `${formatDate(action.startAt)}${action.isAllDay ? "" : ""}` : "TBC"}</span>
                  <span className="text-xs font-medium text-gray-500">{action.actionType.replace(/_/g, " ")}</span>
                  <span className="min-w-0 truncate font-medium text-gray-950">{action.title}</span>
                  <span className="min-w-0 truncate text-gray-500">{action.workstream?.name ?? action.location ?? "Unassigned"}</span>
                  <span className={`w-fit rounded-full px-2 py-1 text-xs font-medium ${projectActionStatusClass(action.status)}`}>{PROJECT_ACTION_STATUS_LABELS[action.status]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyStatus text="No dated event, travel, meeting, or shoot rows yet." />
        )}
      </StatusPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        <StatusPanel title="Workstreams" actionLabel="Timeline" onAction={onOpenTimeline}>
          <div className="mb-3 flex gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
            <input
              value={newWorkstreamName}
              onChange={(event) => setNewWorkstreamName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") createWorkstream().catch(console.error);
              }}
              placeholder="Add workstream: Production, Casting, Travel..."
              className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
            />
            <button onClick={() => createWorkstream().catch(console.error)} disabled={savingWorkstream || !newWorkstreamName.trim()} className="h-9 rounded-md bg-gray-950 px-3 text-sm font-medium text-white disabled:opacity-40">Add</button>
          </div>
          {workstreams.length ? (
            <div className="space-y-2">
              {workstreams.slice(0, 8).map((workstream) => {
                const laneActions = actions.filter((action) => action.workstreamId === workstream.id);
                const open = laneActions.filter((action) => action.status !== "DONE" && action.status !== "CANCELLED").length;
                const waiting = laneActions.filter((action) => action.status === "WAITING" || action.status === "BLOCKED").length;
                return (
                  <div key={workstream.id} className="rounded-md border border-gray-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workstream.color ?? "#0f8f7f" }} />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-950">{workstream.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{open} open · {waiting} waiting/blocked · {workstream.optionGroups?.length ?? 0} option group(s)</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyStatus text="No workstreams yet." />
          )}
        </StatusPanel>

        <StatusPanel title="Crew & Holds" actionLabel="Crew" onAction={onOpenCrew}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {crewByStatus.filter((item) => item.count > 0).map((item) => (
              <div key={item.status} className="rounded-md bg-gray-50 px-2 py-2">
                <p className="text-base font-semibold text-gray-950">{item.count}</p>
                <p className="truncate text-[11px] text-gray-500">{CREW_STATUS_LABELS[item.status]}</p>
              </div>
            ))}
          </div>
          {[...confirmedCrew, ...holdingCrew].slice(0, 8).map((crew) => (
            <div key={crew.id} className="flex items-center justify-between gap-3 border-t border-gray-100 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-950">{crew.name}</p>
                <p className="truncate text-xs text-gray-500">{crew.roleRequirement?.displayLabel ?? crew.role?.name ?? crew.optionCandidate?.group?.name ?? "Crew"}</p>
              </div>
              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">{CREW_STATUS_LABELS[crew.status]}</span>
            </div>
          ))}
          {!visibleCrew.length && <EmptyStatus text="No crew or holds yet." />}
        </StatusPanel>

        <StatusPanel title="Logistics" actionLabel="Crew" onAction={onOpenCrew}>
          <div className="grid grid-cols-2 gap-2">
            <StatusMetric label="Itineraries" value={String(visibleCrew.filter((crew) => crew.itinerary).length)} />
            <StatusMetric label="Travel rows" value={String(itineraryRows)} />
            <StatusMetric label="Dietary notes" value={String(visibleCrew.filter((crew) => crew.dietaryNotes || crew.dietaryFlags?.length).length)} />
            <StatusMetric label="Call times" value={String(visibleCrew.filter((crew) => crew.callTime).length)} />
          </div>
          <div className="mt-4 space-y-2">
            {nextActions.map((action) => (
              <div key={action.id} className="rounded-md bg-gray-50 px-3 py-2">
                <p className="truncate text-sm font-medium text-gray-950">{action.title}</p>
                <p className="mt-1 text-xs text-gray-500">{[action.actionType.replace(/_/g, " "), action.startAt ? formatDate(action.startAt) : null].filter(Boolean).join(" · ")}</p>
              </div>
            ))}
            {!nextActions.length && <EmptyStatus text="No dated logistics actions in the next two weeks." />}
          </div>
        </StatusPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <StatusPanel title="Action Health">
          <div className="grid grid-cols-3 gap-2">
            {(["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE", "CANCELLED"] as ProjectActionStatus[]).map((status) => (
              <div key={status} className="rounded-md border border-gray-100 px-3 py-2">
                <p className="text-lg font-semibold text-gray-950">{actionCounts[status] ?? 0}</p>
                <p className="truncate text-[11px] text-gray-500">{PROJECT_ACTION_STATUS_LABELS[status]}</p>
              </div>
            ))}
          </div>
        </StatusPanel>

        <StatusPanel title="Recent Files" actionLabel="Files" onAction={onOpenFiles}>
          {recentFiles.length ? recentFiles.map((file) => (
            <div key={file.id} className="border-t border-gray-100 py-2 first:border-t-0">
              <p className="truncate text-sm font-medium text-gray-950">{file.originalFilename}</p>
              <p className="mt-1 text-xs text-gray-500">{file.folder} · {formatDate(file.uploadedAt)}</p>
            </div>
          )) : <EmptyStatus text="No files linked to this production." />}
        </StatusPanel>

        <StatusPanel title="Recent Comms" actionLabel="Comms" onAction={onOpenComms}>
          {recentThreads.length ? recentThreads.map((thread) => (
            <div key={thread.id} className="border-t border-gray-100 py-2 first:border-t-0">
              <p className="truncate text-sm font-medium text-gray-950">{thread.subject || "No subject"}</p>
              <p className="mt-1 truncate text-xs text-gray-500">{[formatDate(thread.lastMessageAt), thread.participantNames?.join(", ") || thread.participants?.join(", ")].filter(Boolean).join(" · ")}</p>
            </div>
          )) : <EmptyStatus text="No email threads linked to this production." />}
        </StatusPanel>
      </div>
      </>
      )}
    </div>
  );
}

type StatusDocPageViewProps = {
  page: StatusDocPage;
  production: Production;
  actions: ProjectAction[];
  workstreams: ProjectWorkstream[];
  productionDates: ProductionDate[];
  visibleCrew: CrewMember[];
  recentFiles: JobFile[];
  recentThreads: EmailThread[];
  updateActionStatus: (action: ProjectAction, status: ProjectActionStatus) => Promise<void>;
  patchAction: (action: ProjectAction, patch: Partial<ProjectAction>) => Promise<void>;
  patchCrew: (crew: CrewMember, patch: Partial<CrewMember>) => Promise<void>;
  loadProjectData: () => Promise<void>;
  onOpenTimeline: () => void;
  onOpenCrew: () => void;
  onOpenFiles: () => void;
  onOpenComms: () => void;
};

function StatusDocPageView(props: StatusDocPageViewProps) {
  const { page } = props;
  if (page === "To Do") return <StatusDocActionsPage {...props} title="To Do" description="Ownerless questions, chases, deadlines, and internal actions." filter={(action) => action.actionType !== "MEETING" || action.status !== "DONE"} />;
  if (page === "Crew List") return <StatusDocCrewListPage {...props} />;
  if (page === "Holds") return <StatusDocHoldsPage {...props} />;
  if (page === "Timeline") return <StatusDocTimelinePage {...props} />;
  if (page === "Run Of Show") return <StatusDocRunOfShowPage {...props} />;
  if (page === "Travel") return <StatusDocItineraryPage {...props} title="Travel Grid" itemTypes={["FLIGHT", "TRAIN"]} emptyText="No flight or train rows yet. Add them from the crew itinerary tool." />;
  if (page === "Hotels") return <StatusDocItineraryPage {...props} title="Hotel Grid" itemTypes={["HOTEL"]} emptyText="No hotel rows yet. Add them from the crew itinerary tool." />;
  if (page === "Cars") return <StatusDocItineraryPage {...props} title="Cars / Transfers" itemTypes={["CAR"]} emptyText="No car or transfer rows yet. Add them from the crew itinerary tool." />;
  if (page === "Equipment") return <StatusDocActionsPage {...props} title="Equipment" description="Equipment asks and supply status, backed by project actions." filter={(action) => actionMatches(action, ["equipment", "eq", "kit", "walkie", "printer", "rail", "power", "prop"])} quickType="TASK" />;
  if (page === "Deliveries") return <StatusDocActionsPage {...props} title="Deliveries" description="Delivery windows, suppliers, locations, and status." filter={(action) => action.actionType === "EVENT" || actionMatches(action, ["delivery", "deliver", "drop", "pickup", "pick up", "courier"])} quickType="EVENT" />;
  if (page === "Locations") return <StatusDocOptionsPage {...props} title="Locations" keywords={["location", "locations", "studio", "venue", "hotel"]} />;
  if (page === "Casting") return <StatusDocOptionsPage {...props} title="Casting" keywords={["casting", "talent", "model", "models"]} />;
  if (page === "Files & Comms") return <StatusDocFilesCommsPage {...props} />;
  if (page === "Meeting Notes") return <StatusDocMeetingNotesPage {...props} />;
  return null;
}

function actionMatches(action: ProjectAction, words: string[]) {
  const haystack = [action.title, action.description, action.location, action.workstream?.name].filter(Boolean).join(" ").toLowerCase();
  return words.some((word) => haystack.includes(word.toLowerCase()));
}

function StatusDocQuickAction({
  productionId,
  workstreams,
  onCreated,
  placeholder,
  actionType = "TASK",
}: {
  productionId: string;
  workstreams: ProjectWorkstream[];
  onCreated: () => Promise<void>;
  placeholder: string;
  actionType?: ProjectAction["actionType"];
}) {
  const [title, setTitle] = useState("");
  const [workstreamId, setWorkstreamId] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    setSaving(true);
    try {
      await api.post<ProjectAction>(`/api/project-actions/production/${productionId}/actions`, {
        title: cleanTitle,
        workstreamId: workstreamId || null,
        startAt: date || null,
        actionType,
        status: "TODO",
        visibility: "INTERNAL",
        isAllDay: true,
      });
      setTitle("");
      setDate("");
      await onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border border-gray-200 bg-gray-50 p-2 lg:grid-cols-[1fr_190px_140px_auto]">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") save().catch(console.error); }}
        placeholder={placeholder}
        className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-gray-400"
      />
      <select value={workstreamId} onChange={(event) => setWorkstreamId(event.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-400">
        <option value="">No workstream</option>
        {workstreams.map((workstream) => <option key={workstream.id} value={workstream.id}>{workstream.name}</option>)}
      </select>
      <input value={date} onChange={(event) => setDate(event.target.value)} type="date" className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 outline-none focus:border-gray-400" />
      <button onClick={() => save().catch(console.error)} disabled={saving || !title.trim()} className="h-9 rounded-md bg-gray-950 px-3 text-sm font-medium text-white disabled:opacity-40">Add</button>
    </div>
  );
}

function StatusDocActionsPage({
  production,
  actions,
  workstreams,
  title,
  description,
  filter,
  quickType = "TASK",
  updateActionStatus,
  patchAction,
  loadProjectData,
}: StatusDocPageViewProps & {
  title: string;
  description: string;
  filter: (action: ProjectAction) => boolean;
  quickType?: ProjectAction["actionType"];
}) {
  const rows = actions.filter(filter).sort((a, b) => (a.startAt ?? a.createdAt).localeCompare(b.startAt ?? b.createdAt));
  return (
    <StatusPanel title={title}>
      <p className="mb-3 text-sm text-gray-500">{description}</p>
      <StatusDocQuickAction productionId={production.id} workstreams={workstreams} onCreated={loadProjectData} placeholder={`Add ${title.toLowerCase()} row`} actionType={quickType} />
      <StatusActionTable rows={rows} workstreams={workstreams} updateActionStatus={updateActionStatus} patchAction={patchAction} className="mt-3" />
    </StatusPanel>
  );
}

function StatusActionTable({
  rows,
  workstreams,
  updateActionStatus,
  patchAction,
  className = "",
}: {
  rows: ProjectAction[];
  workstreams?: ProjectWorkstream[];
  updateActionStatus: (action: ProjectAction, status: ProjectActionStatus) => Promise<void>;
  patchAction?: (action: ProjectAction, patch: Partial<ProjectAction>) => Promise<void>;
  className?: string;
}) {
  if (!rows.length) return <div className={className}><EmptyStatus text="No rows yet." /></div>;
  return (
    <div className={`overflow-x-auto ${className}`}>
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[130px_160px_120px_minmax(240px,1fr)_180px_130px] border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          <span>Date</span>
          <span>Workstream</span>
          <span>Type</span>
          <span>Task / Goal</span>
          <span>Location / Notes</span>
          <span>Status</span>
        </div>
        {rows.map((action) => (
          <div key={action.id} className="grid grid-cols-[130px_160px_120px_minmax(240px,1fr)_180px_130px] items-center gap-2 border-b border-gray-100 py-1.5 text-sm last:border-b-0">
            <EditableCell value={action.startAt?.slice(0, 10) ?? ""} type="date" onCommit={(startAt) => patchAction?.(action, { startAt: startAt || null } as Partial<ProjectAction>)} />
            <EditableSelect
              value={action.workstreamId ?? ""}
              options={[{ value: "", label: "" }, ...(workstreams ?? []).map((workstream) => ({ value: workstream.id, label: workstream.name }))]}
              onCommit={(workstreamId) => patchAction?.(action, { workstreamId: workstreamId || null } as Partial<ProjectAction>)}
            />
            <EditableSelect
              value={action.actionType}
              options={(["TASK", "DEADLINE", "EVENT", "MEETING", "TRAVEL", "SHOOT", "REMINDER"] as ProjectAction["actionType"][]).map((type) => ({ value: type, label: type.replace(/_/g, " ") }))}
              onCommit={(actionType) => patchAction?.(action, { actionType: actionType as ProjectAction["actionType"] })}
            />
            <EditableCell value={action.title} strong onCommit={(title) => patchAction?.(action, { title })} />
            <EditableCell value={action.location || action.description || ""} placeholder="Location / note" onCommit={(value) => patchAction?.(action, { location: value || null } as Partial<ProjectAction>)} />
            <EditableSelect
              value={action.status}
              className={projectActionStatusClass(action.status)}
              options={(["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "DONE", "CANCELLED"] as ProjectActionStatus[]).map((status) => ({ value: status, label: PROJECT_ACTION_STATUS_LABELS[status] }))}
              onCommit={(status) => updateActionStatus(action, status as ProjectActionStatus)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableCell({
  value,
  onCommit,
  type = "text",
  placeholder = "",
  strong = false,
}: {
  value: string;
  onCommit?: (value: string) => Promise<void> | void;
  type?: string;
  placeholder?: string;
  strong?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  async function commit() {
    if (!onCommit || draft === value) return;
    setSaving(true);
    try {
      await onCommit(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit().catch(console.error)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={`h-9 min-w-0 rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-gray-200 hover:bg-white focus:border-gray-400 focus:bg-white ${strong ? "font-medium text-gray-950" : "text-gray-700"} ${saving ? "opacity-60" : ""}`}
    />
  );
}

function EditableSelect({
  value,
  options,
  onCommit,
  className = "",
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onCommit?: (value: string) => Promise<void> | void;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  async function commit(next: string) {
    if (!onCommit || next === value) return;
    setSaving(true);
    try {
      await onCommit(next);
    } finally {
      setSaving(false);
    }
  }
  return (
    <select
      value={value}
      onChange={(event) => commit(event.target.value).catch(console.error)}
      className={`h-9 min-w-0 rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-gray-200 hover:bg-white focus:border-gray-400 focus:bg-white ${className} ${saving ? "opacity-60" : ""}`}
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function StatusDocCrewListPage({ visibleCrew, onOpenCrew, patchCrew }: StatusDocPageViewProps) {
  return (
    <StatusPanel title="Crew List" actionLabel="Open Crew Tool" onAction={onOpenCrew}>
      {visibleCrew.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[170px_190px_220px_150px_140px_120px_1fr] border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <span>Role</span><span>Name</span><span>Email</span><span>Phone</span><span>Status</span><span>Rate</span><span>Notes</span>
            </div>
            {visibleCrew.map((crew) => (
              <div key={crew.id} className="grid grid-cols-[170px_190px_220px_150px_140px_120px_1fr] items-center gap-2 border-b border-gray-100 py-1.5 text-sm last:border-b-0">
                <span className="truncate text-gray-500">{crew.roleRequirement?.displayLabel ?? crew.role?.name ?? crew.optionCandidate?.group?.name ?? ""}</span>
                <EditableCell value={crew.name} strong onCommit={(name) => patchCrew(crew, { name })} />
                <EditableCell value={crew.email ?? ""} onCommit={(email) => patchCrew(crew, { email: email || null } as Partial<CrewMember>)} />
                <EditableCell value={crew.phone ?? ""} onCommit={(phone) => patchCrew(crew, { phone: phone || null } as Partial<CrewMember>)} />
                <EditableSelect value={crew.status} options={CREW_STATUSES.map((status) => ({ value: status, label: CREW_STATUS_LABELS[status] }))} onCommit={(status) => patchCrew(crew, { status: status as CrewStatus })} />
                <EditableCell value={crew.dayRate ? String(crew.dayRate) : ""} type="number" onCommit={(dayRate) => patchCrew(crew, { dayRate: dayRate || undefined } as Partial<CrewMember>)} />
                <EditableCell value={crew.notes ?? ""} onCommit={(notes) => patchCrew(crew, { notes: notes || null } as Partial<CrewMember>)} />
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyStatus text="No crew rows yet." />}
    </StatusPanel>
  );
}

function flattenOptionCandidates(workstreams: ProjectWorkstream[], keywords?: string[]) {
  return workstreams.flatMap((workstream) => (workstream.optionGroups ?? []).flatMap((group) => {
    const label = `${group.name} ${group.type ?? ""}`.toLowerCase();
    if (keywords?.length && !keywords.some((keyword) => label.includes(keyword))) return [];
    return (group.candidates ?? []).map((candidate) => ({ workstream, group, candidate }));
  }));
}

function StatusDocHoldsPage({ visibleCrew, workstreams, onOpenCrew }: StatusDocPageViewProps) {
  const crewHolds = visibleCrew.filter((crew) => crew.status !== "CONFIRMED" && crew.status !== "RELEASED");
  const candidateHolds = flattenOptionCandidates(workstreams).filter(({ candidate }) => String(candidate.activeState ?? "").toUpperCase() !== "RELEASED");
  return (
    <StatusPanel title="Holds" actionLabel="Open Crew & Suppliers" onAction={onOpenCrew}>
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Crew Holds</h4>
          {crewHolds.length ? crewHolds.map((crew) => (
            <div key={crew.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-gray-950">{crew.name}</span>
              <span className="truncate text-gray-500">{crew.roleRequirement?.displayLabel ?? crew.role?.name ?? ""}</span>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{CREW_STATUS_LABELS[crew.status]}</span>
            </div>
          )) : <EmptyStatus text="No crew holds." />}
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Supplier / Option Holds</h4>
          {candidateHolds.length ? candidateHolds.slice(0, 40).map(({ workstream, group, candidate }) => (
            <div key={candidate.id} className="grid grid-cols-[1fr_130px_110px] gap-3 border-b border-gray-100 py-2 text-sm">
              <span className="min-w-0 truncate font-medium text-gray-950">{candidate.name}</span>
              <span className="truncate text-gray-500">{group.name || workstream.name}</span>
              <span className="truncate text-xs text-gray-500">{String(candidate.activeState ?? "").replace(/_/g, " ")}</span>
            </div>
          )) : <EmptyStatus text="No option holds." />}
        </div>
      </div>
    </StatusPanel>
  );
}

function StatusDocTimelinePage({ productionDates, actions, workstreams, updateActionStatus, patchAction }: StatusDocPageViewProps) {
  const byDate = new Map<string, { dates: ProductionDate[]; actions: ProjectAction[] }>();
  productionDates.forEach((date) => {
    const key = date.date.slice(0, 10);
    byDate.set(key, { dates: [...(byDate.get(key)?.dates ?? []), date], actions: byDate.get(key)?.actions ?? [] });
  });
  actions.filter((action) => action.startAt).forEach((action) => {
    const key = String(action.startAt).slice(0, 10);
    byDate.set(key, { dates: byDate.get(key)?.dates ?? [], actions: [...(byDate.get(key)?.actions ?? []), action] });
  });
  const rows = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  return (
    <StatusPanel title="Production Timeline">
      {rows.length ? rows.map(([date, item]) => (
        <div key={date} className="mb-3 rounded-md border border-gray-200 p-3">
          <p className="mb-2 text-sm font-semibold text-gray-950">{formatDate(date)}</p>
          {item.dates.map((productionDate) => <p key={productionDate.id} className="text-sm text-gray-600">{DATE_TYPE_LABELS[productionDate.dateType]} · {productionDate.location ?? "Location TBC"}</p>)}
          <StatusActionTable rows={item.actions} workstreams={workstreams} updateActionStatus={updateActionStatus} patchAction={patchAction} className="mt-2" />
        </div>
      )) : <EmptyStatus text="No timeline rows yet." />}
    </StatusPanel>
  );
}

function StatusDocRunOfShowPage(props: StatusDocPageViewProps) {
  return <StatusDocActionsPage {...props} title="Run Of Show" description="Timed event, meeting, travel, and shoot rows." filter={(action) => Boolean(action.startAt) && ["EVENT", "MEETING", "TRAVEL", "SHOOT"].includes(action.actionType)} quickType="EVENT" />;
}

function StatusDocItineraryPage({ production, visibleCrew, title, itemTypes, emptyText, onOpenCrew }: StatusDocPageViewProps & { title: string; itemTypes: CrewItineraryItemType[]; emptyText: string }) {
  const [rows, setRows] = useState<Array<{ crew: CrewMember; item: CrewItineraryItem }>>([]);
  const [loading, setLoading] = useState(false);

  const loadRows = useCallback(() => {
    let cancelled = false;
    const crewWithItineraries = visibleCrew.filter((crew) => crew.itinerary);
    setLoading(true);
    Promise.all(crewWithItineraries.map(async (crew) => {
      const itinerary = await api.get<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary`);
      return itinerary.items.map((item) => ({ crew, item }));
    }))
      .then((groups) => {
        if (!cancelled) setRows(groups.flat().filter(({ item }) => itemTypes.includes(item.type)).sort((a, b) => String(a.item.date ?? "").localeCompare(String(b.item.date ?? ""))));
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemTypes, production.id, visibleCrew]);

  useEffect(() => loadRows(), [loadRows]);

  async function patchItem(crew: CrewMember, item: CrewItineraryItem, patch: Partial<CrewItineraryItem>) {
    await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}`, patch);
    loadRows();
  }

  return (
    <StatusPanel title={title} actionLabel="Open Crew Itineraries" onAction={onOpenCrew}>
      {loading ? <EmptyStatus text="Loading itinerary rows..." /> : rows.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[130px_130px_170px_1fr_1fr_150px_130px] border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <span>Date</span><span>Time</span><span>Passenger</span><span>From / Address</span><span>To / Provider</span><span>Booking</span><span>Visible</span>
            </div>
            {rows.map(({ crew, item }) => (
              <div key={item.id} className="grid grid-cols-[130px_130px_170px_1fr_1fr_150px_130px] items-center gap-2 border-b border-gray-100 py-1.5 text-sm last:border-b-0">
                <EditableCell value={item.date?.slice(0, 10) ?? ""} type="date" onCommit={(date) => patchItem(crew, item, { date: date || null } as Partial<CrewItineraryItem>)} />
                <EditableCell value={item.startTime ?? ""} placeholder="09:00" onCommit={(startTime) => patchItem(crew, item, { startTime: startTime || null } as Partial<CrewItineraryItem>)} />
                <EditableCell value={item.passengerName || crew.name} strong onCommit={(passengerName) => patchItem(crew, item, { passengerName: passengerName || null } as Partial<CrewItineraryItem>)} />
                <EditableCell value={item.origin || item.address || item.roomType || ""} onCommit={(value) => patchItineraryPrimary(item, value, "from", (patch) => patchItem(crew, item, patch))} />
                <EditableCell value={item.destination || item.provider || item.contactName || ""} onCommit={(value) => patchItineraryPrimary(item, value, "to", (patch) => patchItem(crew, item, patch))} />
                <EditableCell value={item.bookingReference || item.flightNumber || item.trainNumber || item.roomNumber || ""} onCommit={(value) => patchItineraryBooking(item, value, (patch) => patchItem(crew, item, patch))} />
                <EditableSelect value={item.exportVisible ? "true" : "false"} options={[{ value: "true", label: "Visible" }, { value: "false", label: "Internal" }]} onCommit={(value) => patchItem(crew, item, { exportVisible: value === "true" } as Partial<CrewItineraryItem>)} />
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyStatus text={emptyText} />}
    </StatusPanel>
  );
}

async function patchItineraryPrimary(item: CrewItineraryItem, value: string, side: "from" | "to", commit: (patch: Partial<CrewItineraryItem>) => Promise<void>) {
  if (item.type === "HOTEL") {
    await commit(side === "from" ? { address: value || null } as Partial<CrewItineraryItem> : { provider: value || null } as Partial<CrewItineraryItem>);
    return;
  }
  if (item.type === "CAR" || item.type === "TRAIN" || item.type === "FLIGHT") {
    await commit(side === "from" ? { origin: value || null } as Partial<CrewItineraryItem> : { destination: value || null } as Partial<CrewItineraryItem>);
    return;
  }
  await commit(side === "from" ? { address: value || null } as Partial<CrewItineraryItem> : { provider: value || null } as Partial<CrewItineraryItem>);
}

async function patchItineraryBooking(item: CrewItineraryItem, value: string, commit: (patch: Partial<CrewItineraryItem>) => Promise<void>) {
  if (item.type === "FLIGHT") {
    await commit({ flightNumber: value || null } as Partial<CrewItineraryItem>);
    return;
  }
  if (item.type === "TRAIN") {
    await commit({ trainNumber: value || null } as Partial<CrewItineraryItem>);
    return;
  }
  if (item.type === "HOTEL") {
    await commit({ roomNumber: value || null } as Partial<CrewItineraryItem>);
    return;
  }
  await commit({ bookingReference: value || null } as Partial<CrewItineraryItem>);
}

function StatusDocOptionsPage({ title, keywords, workstreams, onOpenCrew }: StatusDocPageViewProps & { title: string; keywords: string[] }) {
  const rows = flattenOptionCandidates(workstreams, keywords);
  return (
    <StatusPanel title={title} actionLabel="Open Crew & Suppliers" onAction={onOpenCrew}>
      {rows.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[170px_190px_1fr_140px_1fr] border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              <span>Workstream</span><span>Group</span><span>Name</span><span>Status</span><span>Contact / Notes</span>
            </div>
            {rows.map(({ workstream, group, candidate }) => (
              <div key={candidate.id} className="grid grid-cols-[170px_190px_1fr_140px_1fr] items-center gap-3 border-b border-gray-100 py-2 text-sm last:border-b-0">
                <span className="truncate text-gray-500">{workstream.name}</span>
                <span className="truncate text-gray-500">{group.name}</span>
                <span className="truncate font-medium text-gray-950">{candidate.name}</span>
                <span className="truncate text-xs text-gray-500">{String(candidate.activeState ?? "").replace(/_/g, " ")}</span>
                <span className="truncate text-gray-500">{candidate.blackbookEntry?.email ?? candidate.blackbookEntry?.phone ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <EmptyStatus text={`No ${title.toLowerCase()} option groups yet.`} />}
    </StatusPanel>
  );
}

function StatusDocFilesCommsPage({ recentFiles, recentThreads, onOpenFiles, onOpenComms }: StatusDocPageViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <StatusPanel title="Files" actionLabel="Open Files" onAction={onOpenFiles}>
        {recentFiles.length ? recentFiles.map((file) => (
          <div key={file.id} className="border-b border-gray-100 py-2 last:border-b-0">
            <p className="truncate text-sm font-medium text-gray-950">{file.originalFilename}</p>
            <p className="text-xs text-gray-500">{file.folder} · {formatDate(file.uploadedAt)}</p>
          </div>
        )) : <EmptyStatus text="No files linked." />}
      </StatusPanel>
      <StatusPanel title="Comms" actionLabel="Open Comms" onAction={onOpenComms}>
        {recentThreads.length ? recentThreads.map((thread) => (
          <div key={thread.id} className="border-b border-gray-100 py-2 last:border-b-0">
            <p className="truncate text-sm font-medium text-gray-950">{thread.subject || "No subject"}</p>
            <p className="truncate text-xs text-gray-500">{[formatDate(thread.lastMessageAt), thread.participantNames?.join(", ") || thread.participants?.join(", ")].filter(Boolean).join(" · ")}</p>
          </div>
        )) : <EmptyStatus text="No linked threads." />}
      </StatusPanel>
    </div>
  );
}

function StatusDocMeetingNotesPage(props: StatusDocPageViewProps) {
  const meetingActions = props.actions.filter((action) => action.actionType === "MEETING" || actionMatches(action, ["meeting", "call", "ppm", "agenda", "notes"]));
  return (
    <div className="space-y-4">
      <StatusPanel title="Meeting Notes">
        {props.production.notes && (
          <div className="mb-3 rounded-md border border-gray-100 bg-gray-50 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-gray-400">Production Notes</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{props.production.notes}</p>
          </div>
        )}
        <StatusDocQuickAction productionId={props.production.id} workstreams={props.workstreams} onCreated={props.loadProjectData} placeholder="Add meeting note or follow-up" actionType="MEETING" />
        <StatusActionTable rows={meetingActions} workstreams={props.workstreams} updateActionStatus={props.updateActionStatus} patchAction={props.patchAction} className="mt-3" />
      </StatusPanel>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-950">{value}</p>
    </div>
  );
}

function StatusPanel({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-950">{title}</h3>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-xs font-medium text-teal-700 hover:text-teal-900">{actionLabel}</button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyStatus({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">{text}</div>;
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
  const [syncing, setSyncing] = useState(false);
  const [exportingBulk, setExportingBulk] = useState(false);
  const [itineraryCrew, setItineraryCrew] = useState<CrewMember | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [showHiddenCrew, setShowHiddenCrew] = useState(false);
  const autoSyncedProductionRef = useRef<string | null>(null);

  useEffect(() => { api.get<CrewRole[]>("/api/settings/crew-roles").then(setRoles).catch(console.error); }, []);

  async function updateCrew(crew: CrewMember, patch: Partial<CrewMember>) {
    await api.patch(`/api/productions/${production.id}/crew/${crew.id}`, patch);
    onReload();
  }

  async function updateCrewSectionVisibility(sectionId: string, hiddenFromCrewList: boolean) {
    await api.patch(`/api/options/matrix/groups/${sectionId}`, { hiddenFromCrewList });
    onReload();
  }

  async function remove(crewId: string) {
    if (!window.confirm("Remove this crew member?")) return;
    await api.delete(`/api/productions/${production.id}/crew/${crewId}`);
    onReload();
  }

  const syncFromOptions = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await api.post<{ created: number; updated: number; totalAssignments: number }>(
        `/api/options/production/${production.id}/sync-crew-list`,
        {}
      );
      setSyncResult(`${result.created} added · ${result.updated} updated · ${result.totalAssignments} confirmed assignments`);
      onReload();
    } catch (err) {
      console.error(err);
      setSyncResult("Could not sync confirmed options.");
    } finally {
      setSyncing(false);
    }
  }, [onReload, production.id]);

  useEffect(() => {
    if (autoSyncedProductionRef.current === production.id) return;
    autoSyncedProductionRef.current = production.id;
    syncFromOptions();
  }, [production.id, syncFromOptions]);

  async function bulkExportItineraries() {
    setExportingBulk(true);
    try {
      const result = await api.post<{ files: Array<{ id: string; originalFilename: string }> }>(`/api/productions/${production.id}/crew/itineraries/export-pdf/bulk`, {});
      result.files.forEach((file, index) => {
        window.setTimeout(() => {
          const link = document.createElement("a");
          link.href = `/api/files/${file.id}/download`;
          link.download = file.originalFilename;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }, index * 250);
      });
      setSyncResult(`${result.files.length} itinerary PDF${result.files.length === 1 ? "" : "s"} exported`);
      onReload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Bulk itinerary export failed");
    } finally {
      setExportingBulk(false);
    }
  }

  const sourcedCount = production.crewMembers.filter((crew) => crew.optionCandidateId || crew.blackbookEntryId || crew.roleRequirementId).length;
  const hiddenCrewCount = production.crewMembers.filter((crew) => crew.hiddenFromCrewList).length;
  const crewSections = useMemo(() => {
    const sections = new Map<string, {
      id: string;
      name: string;
      type: string;
      order: number;
      hiddenFromCrewList: boolean;
      isManual: boolean;
      rows: CrewMember[];
    }>();
    production.crewMembers.forEach((crew) => {
      const group = crew.roleRequirement?.group ?? crew.optionCandidate?.group ?? null;
      const id = group?.id ?? "manual";
      if (!sections.has(id)) {
        sections.set(id, {
          id,
          name: group?.name ?? "Manual crew",
          type: group?.type ?? "MANUAL",
          order: group?.order ?? 9999,
          hiddenFromCrewList: Boolean(group?.hiddenFromCrewList),
          isManual: !group,
          rows: [],
        });
      }
      sections.get(id)?.rows.push(crew);
    });
    return Array.from(sections.values())
      .map((section) => ({
        ...section,
        visibleRows: showHiddenCrew ? section.rows : section.rows.filter((crew) => !crew.hiddenFromCrewList),
      }))
      .filter((section) => showHiddenCrew || (!section.hiddenFromCrewList && section.visibleRows.length > 0))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }, [production.crewMembers, showHiddenCrew]);
  const visibleCrewCount = crewSections.reduce((sum, section) => sum + section.visibleRows.length, 0);

  if (itineraryCrew) {
    return (
      <CrewItineraryPanel
        production={production}
        crew={itineraryCrew}
        roles={roles}
        onClose={() => setItineraryCrew(null)}
        onChanged={onReload}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">Crew List</p>
          <p className="text-xs text-gray-500">
            {visibleCrewCount} shown · {production.crewMembers.length} total · {sourcedCount} linked to Crew & Suppliers / Blackbook
          </p>
          {syncResult && <p className="mt-1 text-xs text-gray-500">{syncResult}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowHiddenCrew((value) => !value)}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {showHiddenCrew ? <EyeOff size={14} /> : <Eye size={14} />}
            {showHiddenCrew ? "Hide hidden" : `Show hidden${hiddenCrewCount ? ` (${hiddenCrewCount})` : ""}`}
          </button>
          <button
            onClick={syncFromOptions}
            disabled={syncing}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing" : "Sync confirmed"}
          </button>
          <button
            onClick={bulkExportItineraries}
            disabled={exportingBulk || !production.crewMembers.some((crew) => crew.itinerary)}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Download size={14} />
            {exportingBulk ? "Exporting" : "Export itineraries"}
          </button>
          <button onClick={() => setAdding(true)} className="min-h-9 rounded-md bg-gray-950 px-3 text-xs font-semibold text-white shadow-sm">Add crew</button>
        </div>
      </div>

      {production.crewMembers.length === 0 ? (
        <div className="mx-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-sm font-medium text-gray-900">No crew yet.</p>
          <p className="mt-1 text-xs text-gray-500">Sync confirmed candidates from Crew & Suppliers, or add a row manually.</p>
          <button onClick={syncFromOptions} disabled={syncing} className="mt-4 rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            {syncing ? "Syncing..." : "Sync confirmed candidates"}
          </button>
        </div>
      ) : (
        <div className="mx-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <div className="grid min-w-[1150px] grid-cols-[1.15fr_130px_190px_170px_120px_110px_120px_88px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            <div>Name</div>
            <div>Role</div>
            <div>Contact</div>
            <div>Details</div>
            <div>Itinerary</div>
            <div>Status</div>
            <div className="text-right">Rate / days</div>
            <div className="text-right">Actions</div>
          </div>
          {crewSections.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">Only hidden crew is available. Use Show hidden to manage it.</div>
          ) : crewSections.map((section) => (
            <div key={section.id} className="border-b border-gray-200 last:border-b-0">
              <div className={`grid min-w-[1150px] grid-cols-[1fr_auto] items-center border-b border-gray-100 px-3 py-2 ${section.hiddenFromCrewList ? "bg-gray-50 text-gray-400" : "bg-gray-50/80 text-gray-900"}`}>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.12em]">{section.name}</p>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">{section.visibleRows.length}</span>
                    {section.hiddenFromCrewList && <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">Hidden</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-400">{section.isManual ? "Added directly in Crew List" : `${section.type.toLowerCase()} options section`}</p>
                </div>
                {!section.isManual && (
                  <button
                    onClick={() => updateCrewSectionVisibility(section.id, !section.hiddenFromCrewList)}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-100"
                  >
                    {section.hiddenFromCrewList ? <Eye size={13} /> : <EyeOff size={13} />}
                    {section.hiddenFromCrewList ? "Show section" : "Hide section"}
                  </button>
                )}
              </div>
              {section.visibleRows.map((crew) => (
                <div key={crew.id} className={`grid min-w-[1150px] grid-cols-[1.15fr_130px_190px_170px_120px_110px_120px_88px] items-center border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50 ${crew.hiddenFromCrewList ? "bg-gray-50 text-gray-400 opacity-75" : ""}`}>
                  <div className="min-w-0">
                    <p className={`truncate font-semibold ${crew.hiddenFromCrewList ? "text-gray-500" : "text-gray-950"}`}>{crew.name}</p>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-gray-400">
                      {crew.optionCandidate ? (
                        <span className="truncate">Option · {crew.optionCandidate.name}</span>
                      ) : crew.blackbookEntry ? (
                        <span className="truncate">Blackbook · {crew.blackbookEntry.displayName}</span>
                      ) : crew.contact ? (
                        <span className="truncate">Legacy contact</span>
                      ) : (
                        <span>Unlinked</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs text-gray-600">
                    <p className="truncate font-medium text-gray-800">{crew.roleRequirement?.displayLabel ?? crew.role?.name ?? "No role"}</p>
                    <p className="truncate text-[11px] uppercase tracking-[0.12em] text-gray-400">{crew.roleRequirement?.type ?? crew.role?.name ?? ""}</p>
                  </div>
                  <div className="min-w-0 text-xs text-gray-500">
                    <p className="truncate">{crew.email || crew.blackbookEntry?.email || "No email"}</p>
                    <p className="truncate">{crew.phone || crew.blackbookEntry?.phone || "No phone"}</p>
                  </div>
                  <div className="min-w-0 text-xs">
                    {crew.dietaryFlags?.length ? (
                      <p className="truncate text-amber-700">{crew.dietaryFlags.join(", ")}</p>
                    ) : (
                      <p className="text-gray-300">No dietaries</p>
                    )}
                    <p className={crew.detailsReceivedAt ? "text-emerald-600" : crew.detailsRequestedAt ? "text-amber-600" : "text-gray-300"}>
                      {crew.detailsReceivedAt ? "Details received" : crew.detailsRequestedAt ? "Details requested" : "Details not requested"}
                    </p>
                  </div>
                  <button
                    onClick={() => setItineraryCrew(crew)}
                    className={`min-h-8 rounded-md border px-2 text-left text-xs font-medium ${crew.itinerary ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                  >
                    {crew.itinerary ? `${crew.itinerary._count?.items ?? 0} rows · ${crew.itinerary.status}` : "Create"}
                  </button>
                  <div>
                    <select
                      value={crew.status}
                      onChange={(event) => updateCrew(crew, { status: event.target.value as CrewStatus })}
                      className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none"
                    >
                      {CREW_STATUSES.map((status) => <option key={status} value={status}>{CREW_STATUS_LABELS[status]}</option>)}
                    </select>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <p className="font-medium text-gray-900">{crew.dayRate ? formatCurrency(Number(crew.dayRate)) : "No rate"}</p>
                    <p>{crew.numberOfDays ?? "1"} days</p>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => updateCrew(crew, { hiddenFromCrewList: !crew.hiddenFromCrewList })}
                      className="grid min-h-8 min-w-8 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title={crew.hiddenFromCrewList ? "Show in crew list" : "Hide from crew list"}
                    >
                      {crew.hiddenFromCrewList ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button onClick={() => remove(crew.id)} className="grid min-h-8 min-w-8 place-items-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
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

function itineraryTypeLabel(type: CrewItineraryItemType) {
  if (type === "CAR") return "Car";
  if (type === "TRAIN") return "Train";
  if (type === "FLIGHT") return "Flight";
  if (type === "HOTEL") return "Hotel";
  return "Event";
}

function ItineraryTypeIcon({ type }: { type: CrewItineraryItemType }) {
  if (type === "CAR") return <Car size={14} />;
  if (type === "TRAIN") return <Train size={14} />;
  if (type === "FLIGHT") return <Plane size={14} />;
  if (type === "HOTEL") return <Bed size={14} />;
  return <CalendarDays size={14} />;
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function itineraryDateKey(item: CrewItineraryItem) {
  return dateInputValue(item.date) || "unscheduled";
}

function itineraryDateLabel(key: string) {
  if (key === "unscheduled") return "Unscheduled";
  const date = new Date(`${key}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Unscheduled" : date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function itineraryTimeRange(item: CrewItineraryItem) {
  return [
    item.startTime ? `${item.startTime}${item.startTimezone ? ` ${item.startTimezone}` : ""}` : null,
    item.endTime ? `${item.endTime}${item.endTimezone ? ` ${item.endTimezone}` : ""}` : null,
  ].filter(Boolean).join(" - ");
}

function itineraryPrimaryDetail(item: CrewItineraryItem) {
  if (item.type === "HOTEL") return [item.destination, item.address].filter(Boolean).join(" · ") || item.provider || "";
  if (item.type === "FLIGHT") return [item.flightNumber, item.terminal ? `T${item.terminal}` : null, item.gate ? `Gate ${item.gate}` : null, item.seat ? `Seat ${item.seat}` : null].filter(Boolean).join(" · ");
  if (item.type === "TRAIN") return [item.trainNumber, item.platform ? `Platform ${item.platform}` : null, item.coach, item.seat ? `Seat ${item.seat}` : null].filter(Boolean).join(" · ");
  if (item.type === "CAR") return [item.provider, item.contactName, item.contactPhone].filter(Boolean).join(" · ");
  return [item.provider, item.address].filter(Boolean).join(" · ");
}

function itineraryKeyDetailValue(item: CrewItineraryItem) {
  if (item.type === "HOTEL") return item.address ?? "";
  if (item.type === "FLIGHT") return item.flightNumber ?? "";
  if (item.type === "TRAIN") return item.trainNumber ?? "";
  if (item.type === "CAR") return item.provider ?? "";
  return item.provider || item.address || "";
}

function itineraryKeyDetailPatch(item: CrewItineraryItem, value: string): Partial<CrewItineraryItem> {
  if (item.type === "HOTEL") return { address: value };
  if (item.type === "FLIGHT") return { flightNumber: value };
  if (item.type === "TRAIN") return { trainNumber: value };
  if (item.type === "CAR") return { provider: value };
  return item.provider ? { provider: value } : { address: value };
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type ProductionPatchResponse = { production: Production; invoicePrompt?: boolean };

function CrewItineraryPanel({ production, crew, roles, onClose, onChanged }: { production: Production; crew: CrewMember; roles: CrewRole[]; onClose: () => void; onChanged: () => void }) {
  const [itinerary, setItinerary] = useState<CrewItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"flow" | "items" | "appendix">("flow");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateSourceCrewId, setDuplicateSourceCrewId] = useState("");
  const [parsingTravel, setParsingTravel] = useState(false);
  const [travelParseSummary, setTravelParseSummary] = useState<string | null>(null);
  const [travelDropActive, setTravelDropActive] = useState(false);
  const [productionContact, setProductionContact] = useState<Contact | null>(production.contact ?? null);
  const travelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    api.get<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary`)
      .then((loaded) => {
        setItinerary(loaded);
        setSelectedItemId(loaded.items[0]?.id ?? null);
      })
      .catch(() => setItinerary(null))
      .finally(() => setLoading(false));
  }, [production.id, crew.id]);

  useEffect(() => {
    if (!production.contactId) {
      setProductionContact(null);
      return;
    }
    api.get<Contact>(`/api/contacts/${production.contactId}`)
      .then(setProductionContact)
      .catch(() => setProductionContact(null));
  }, [production.contactId]);

  async function generate() {
    setSaving(true);
    try {
      const loaded = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/generate`, {});
      setItinerary(loaded);
      setSelectedItemId(loaded.items[0]?.id ?? null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function duplicateFromCrew() {
    if (!duplicateSourceCrewId) return;
    setDuplicating(true);
    try {
      const loaded = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/duplicate-from`, { sourceCrewId: duplicateSourceCrewId });
      setItinerary(loaded);
      setSelectedItemId(loaded.items[0]?.id ?? null);
      setDuplicateSourceCrewId("");
      onChanged();
    } finally {
      setDuplicating(false);
    }
  }

  async function patchItinerary(patch: Partial<CrewItinerary>) {
    if (!itinerary) return;
    const updated = await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary`, patch);
    setItinerary(updated);
    onChanged();
  }

  async function patchCrewDetails(patch: Partial<CrewMember>) {
    const updatedCrew = await api.patch<CrewMember>(`/api/productions/${production.id}/crew/${crew.id}`, patch);
    setItinerary((current) => current ? { ...current, crewMember: { ...current.crewMember, ...updatedCrew } } : current);
    onChanged();
  }

  async function patchCrewRole(roleValue: string) {
    if (roleValue === "__custom") return;
    if (roleValue.startsWith("requirement:")) {
      await patchCrewDetails({ roleRequirementId: roleValue.replace("requirement:", ""), roleId: null } as Partial<CrewMember>);
      return;
    }
    if (roleValue.startsWith("role:")) {
      await patchCrewDetails({ roleId: roleValue.replace("role:", ""), roleRequirementId: null } as Partial<CrewMember>);
    }
  }

  async function patchProductionContact(patch: Partial<Contact>) {
    if (production.contactId) {
      const updated = await api.patch<Contact>(`/api/contacts/${production.contactId}`, patch);
      setProductionContact(updated);
    } else {
      const name = splitName([patch.firstName, patch.lastName].filter(Boolean).join(" ") || "Production contact");
      const contact = await api.post<Contact>("/api/contacts", {
        firstName: name.firstName || "Production",
        lastName: name.lastName || "contact",
        email: patch.email,
        phone: patch.phone,
        type: "CLIENT",
        source: "OTHER",
        tags: [],
      });
      setProductionContact(contact);
      await api.patch<ProductionPatchResponse>(`/api/productions/${production.id}`, { contactId: contact.id });
    }
    onChanged();
  }

  async function addItem(type: CrewItineraryItemType, date?: string) {
    const updated = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items`, { type, date: date && date !== "unscheduled" ? date : undefined, exportVisible: true });
    setItinerary(updated);
    setSelectedItemId(updated.items[updated.items.length - 1]?.id ?? null);
    onChanged();
  }

  async function parseTravelDocuments(files: FileList | File[] | null) {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    setParsingTravel(true);
    setTravelParseSummary(null);
    try {
      const form = new FormData();
      selectedFiles.forEach((file) => form.append("files", file));
      const response = await fetch(`/api/productions/${production.id}/crew/${crew.id}/itinerary/parse-travel-documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Travel document parse failed");
      }
      const result = await response.json() as {
        itinerary: CrewItinerary;
        parsedFiles: Array<{ itemsCreated: number; confidence: "high" | "medium" | "low"; file: { originalFilename: string } }>;
      };
      setItinerary(result.itinerary);
      const created = result.parsedFiles.reduce((sum, file) => sum + file.itemsCreated, 0);
      setSelectedItemId(result.itinerary.items[0]?.id ?? null);
      setTravelParseSummary(`${created} block${created === 1 ? "" : "s"} added from ${result.parsedFiles.length} file${result.parsedFiles.length === 1 ? "" : "s"}`);
      onChanged();
    } finally {
      setParsingTravel(false);
      if (travelInputRef.current) travelInputRef.current.value = "";
    }
  }

  function onTravelDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setTravelDropActive(false);
    parseTravelDocuments(event.dataTransfer.files).catch((err) => window.alert(err instanceof Error ? err.message : "Travel document parse failed"));
  }

  async function patchItem(item: CrewItineraryItem, patch: Partial<CrewItineraryItem>) {
    const updated = await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}`, patch);
    setItinerary(updated);
    onChanged();
  }

  async function deleteItem(item: CrewItineraryItem) {
    if (!window.confirm("Delete this itinerary row?")) return;
    const updated = await deleteJson<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}`);
    setItinerary(updated);
    setSelectedItemId(updated.items[0]?.id ?? null);
    onChanged();
  }

  async function moveItem(item: CrewItineraryItem, direction: -1 | 1) {
    if (!itinerary) return;
    const ids = itinerary.items.map((row) => row.id);
    const index = ids.indexOf(item.id);
    const nextIndex = Math.max(0, Math.min(ids.length - 1, index + direction));
    if (index === nextIndex) return;
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);
    const updated = await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/reorder`, { itemIds: ids });
    setItinerary(updated);
    onChanged();
  }

  async function addAppendixPage() {
    const updated = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/appendix-pages`, { title: "Info page", bodyHtml: "<p></p>" });
    setItinerary(updated);
    setTab("appendix");
    onChanged();
  }

  async function patchAppendixPage(page: CrewItineraryAppendixPage, patch: Partial<CrewItineraryAppendixPage>) {
    const updated = await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/appendix-pages/${page.id}`, patch);
    setItinerary(updated);
    onChanged();
  }

  async function deleteAppendixPage(page: CrewItineraryAppendixPage) {
    if (!window.confirm("Delete this appendix page?")) return;
    const updated = await deleteJson<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/appendix-pages/${page.id}`);
    setItinerary(updated);
    onChanged();
  }

  async function linkFile(item: CrewItineraryItem, fileId: string) {
    if (!fileId) return;
    const updated = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}/files`, { fileId });
    setItinerary(updated);
    onChanged();
  }

  async function unlinkFile(item: CrewItineraryItem, fileId: string) {
    const updated = await deleteJson<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}/files/${fileId}`);
    setItinerary(updated);
    onChanged();
  }

  async function patchItemFile(item: CrewItineraryItem, fileId: string, patch: { exportVisible: boolean }) {
    const updated = await api.patch<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}/files/${fileId}`, patch);
    setItinerary(updated);
    onChanged();
  }

  async function uploadAndLink(item: CrewItineraryItem, files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    form.append("folder", "Crew Deals");
    Array.from(files).forEach((file) => form.append("files", file));
    const response = await fetch(`/api/files/production/${production.id}/upload`, { method: "POST", credentials: "include", body: form });
    if (!response.ok) throw new Error("Upload failed");
    const created = await response.json();
    const uploadedFiles = Array.isArray(created) ? created : [created];
    let next: CrewItinerary | null = null;
    for (const file of uploadedFiles) {
      next = await api.post<CrewItinerary>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/items/${item.id}/files`, { fileId: file.id });
    }
    if (next) setItinerary(next);
    onChanged();
  }

  async function exportPdf() {
    if (!itinerary) return;
    const file = await api.post<{ id: string; originalFilename: string }>(`/api/productions/${production.id}/crew/${crew.id}/itinerary/export-pdf`, {});
    const link = document.createElement("a");
    link.href = `/api/files/${file.id}/download`;
    link.download = file.originalFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    onChanged();
  }

  const selectedItem = itinerary?.items.find((item) => item.id === selectedItemId) ?? itinerary?.items[0] ?? null;
  const availableFiles = (production.jobFiles ?? []).filter((file) => file.folder === "Crew Deals" || file.folder === "Mail Attachments" || file.folder === "References");
  const duplicateSources = production.crewMembers.filter((member) => member.id !== crew.id && member.itinerary && ((member.itinerary._count?.items ?? 0) > 0 || (member.itinerary._count?.appendixPages ?? 0) > 0));
  const currentCrew = itinerary?.crewMember ?? crew;
  const currentRoleValue = currentCrew.roleRequirementId ? `requirement:${currentCrew.roleRequirementId}` : currentCrew.roleId ? `role:${currentCrew.roleId}` : "";
  const roleRequirementOptions = production.crewMembers
    .map((member) => member.roleRequirement)
    .filter((requirement): requirement is NonNullable<CrewMember["roleRequirement"]> => Boolean(requirement))
    .filter((requirement, index, all) => all.findIndex((item) => item.id === requirement.id) === index)
    .map((requirement) => ({ value: `requirement:${requirement.id}`, label: requirement.displayLabel || requirement.name }));
  const roleOptions = [
    ...roleRequirementOptions,
    ...roles.map((role) => ({ value: `role:${role.id}`, label: role.name })),
  ];
  const itineraryGroups = useMemo(() => {
    const groups = new Map<string, CrewItineraryItem[]>();
    (itinerary?.items ?? []).forEach((item) => {
      const key = itineraryDateKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });
  }, [itinerary?.items]);

  return (
    <div className="flex h-[calc(100vh-122px)] min-h-[720px] flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-950">{crew.name}</p>
          <p className="truncate text-xs text-gray-500">{crew.roleRequirement?.displayLabel ?? crew.role?.name ?? "Crew"} · Travel itinerary</p>
        </div>
        <div className="flex items-center gap-2">
          {itinerary && <button onClick={() => exportPdf().catch((err) => window.alert(err instanceof Error ? err.message : "Export failed"))} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-gray-950 px-3 text-xs font-semibold text-white"><Download size={14} /> Export PDF</button>}
          <button onClick={onClose} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"><ArrowLeft size={14} /> Crew list</button>
        </div>
      </div>

      {loading ? (
        <div className="grid flex-1 place-items-center text-sm text-gray-400">Loading itinerary...</div>
      ) : !itinerary ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="text-base font-semibold text-gray-950">No itinerary yet</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">Generate a starter itinerary from the crew member, production dates, and project details, then add travel bookings manually.</p>
            <button onClick={() => generate().catch((err) => window.alert(err instanceof Error ? err.message : "Generate failed"))} disabled={saving} className="mt-5 min-h-10 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Generating..." : "Generate itinerary"}</button>
            {duplicateSources.length > 0 && (
              <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2">
                <select value={duplicateSourceCrewId} onChange={(event) => setDuplicateSourceCrewId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700">
                  <option value="">Duplicate from...</option>
                  {duplicateSources.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
                <button onClick={() => duplicateFromCrew().catch((err) => window.alert(err instanceof Error ? err.message : "Duplicate failed"))} disabled={!duplicateSourceCrewId || duplicating} className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 disabled:opacity-50">{duplicating ? "Copying..." : "Duplicate"}</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="grid gap-3 border-b border-gray-200 bg-white px-4 py-3 md:grid-cols-7">
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Name
                <CommitInput value={currentCrew.name ?? ""} onCommit={(name) => patchCrewDetails({ name })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Role
                <select value={currentRoleValue} onChange={(event) => patchCrewRole(event.target.value).catch(console.error)} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900">
                  <option value="">Select role...</option>
                  {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Email
                <CommitInput value={currentCrew.email ?? currentCrew.blackbookEntry?.email ?? currentCrew.contact?.email ?? ""} onCommit={(email) => patchCrewDetails({ email })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Phone
                <CommitInput value={currentCrew.phone ?? currentCrew.blackbookEntry?.phone ?? currentCrew.contact?.phone ?? ""} onCommit={(phone) => patchCrewDetails({ phone })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Production contact
                <CommitInput value={fullName(productionContact ?? undefined)} onCommit={(name) => patchProductionContact(splitName(name))} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Prod. phone
                <CommitInput value={productionContact?.phone ?? ""} onCommit={(phone) => patchProductionContact({ phone })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
              <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                Prod. email
                <CommitInput value={productionContact?.email ?? ""} onCommit={(email) => patchProductionContact({ email })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm normal-case tracking-normal text-gray-900" />
              </label>
            </div>
            <div className={`grid gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 ${duplicateSources.length > 0 ? "md:grid-cols-[1.2fr_1fr_auto_auto]" : "md:grid-cols-[1.2fr_1fr_auto]"}`}>
              <input key={itinerary.id} defaultValue={displayItineraryTitle(itinerary.title, currentCrew.name)} onBlur={(event) => patchItinerary({ title: event.target.value }).catch(console.error)} className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-950 outline-none focus:border-gray-400" />
              <input defaultValue={itinerary.introNotes ?? ""} onBlur={(event) => patchItinerary({ introNotes: event.target.value }).catch(console.error)} placeholder="Intro notes" className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-gray-400" />
              {duplicateSources.length > 0 && (
                <div className="flex gap-2">
                  <select value={duplicateSourceCrewId} onChange={(event) => setDuplicateSourceCrewId(event.target.value)} className="h-10 w-44 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700">
                    <option value="">Duplicate from...</option>
                    {duplicateSources.map((member) => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (!window.confirm("Replace this itinerary with a copy from the selected person?")) return;
                      duplicateFromCrew().catch((err) => window.alert(err instanceof Error ? err.message : "Duplicate failed"));
                    }}
                    disabled={!duplicateSourceCrewId || duplicating}
                    className="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {duplicating ? "Copying..." : "Duplicate"}
                  </button>
                </div>
              )}
              <button onClick={() => generate().catch(console.error)} className="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">Prefill</button>
            </div>

            <div className="flex h-11 shrink-0 items-center justify-between border-b border-gray-200 px-4">
              <div className="inline-flex rounded-md bg-gray-100 p-0.5 text-xs font-medium">
                <button onClick={() => setTab("flow")} className={`h-8 rounded px-3 ${tab === "flow" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Flow</button>
                <button onClick={() => setTab("items")} className={`h-8 rounded px-3 ${tab === "items" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Grid</button>
                <button onClick={() => setTab("appendix")} className={`h-8 rounded px-3 ${tab === "appendix" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500"}`}>Appendix</button>
              </div>
              {tab === "flow" || tab === "items" ? (
                <div className="flex gap-1">
                  {ITINERARY_ITEM_TYPES.map((type) => <button key={type} onClick={() => addItem(type).catch(console.error)} className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 px-2 text-xs text-gray-700 hover:bg-gray-50"><ItineraryTypeIcon type={type} /> {itineraryTypeLabel(type)}</button>)}
                </div>
              ) : (
                <button onClick={() => addAppendixPage().catch(console.error)} className="h-8 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Page</button>
              )}
            </div>

            {tab === "flow" ? (
              <FlowItineraryView
                groups={itineraryGroups}
                selectedItemId={selectedItem?.id ?? null}
                parsingTravel={parsingTravel}
                travelDropActive={travelDropActive}
                travelParseSummary={travelParseSummary}
                travelInputRef={travelInputRef}
                onTravelDrop={onTravelDrop}
                onTravelDragActive={setTravelDropActive}
                onParseFiles={(files) => parseTravelDocuments(files)}
                onSelect={(item) => setSelectedItemId(item.id)}
                onPatch={(item, patch) => patchItem(item, patch)}
                onMove={(item, direction) => moveItem(item, direction)}
                onDelete={(item) => deleteItem(item)}
                onAdd={(type, dateKey) => addItem(type, dateKey)}
              />
            ) : tab === "items" ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="border-b border-gray-200 bg-white p-3">
                  <input
                    ref={travelInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(event) => parseTravelDocuments(event.target.files).catch((err) => window.alert(err instanceof Error ? err.message : "Travel document parse failed"))}
                  />
                  <button
                    type="button"
                    onClick={() => travelInputRef.current?.click()}
                    onDragOver={(event) => { event.preventDefault(); setTravelDropActive(true); }}
                    onDragLeave={() => setTravelDropActive(false)}
                    onDrop={onTravelDrop}
                    disabled={parsingTravel}
                    className={`flex min-h-20 w-full items-center justify-between gap-3 rounded-lg border border-dashed px-4 text-left transition ${
                      travelDropActive ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                    } disabled:cursor-wait disabled:opacity-60`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white text-gray-700 ring-1 ring-gray-200"><Upload size={17} /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-950">{parsingTravel ? "Scanning travel documents..." : "Drop travel confirmations here"}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">PDFs, screenshots, and booking images can create multiple dated blocks automatically.</span>
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-gray-200">Choose files</span>
                  </button>
                  {travelParseSummary && <p className="mt-2 text-xs text-emerald-700">{travelParseSummary}</p>}
                </div>
                <div className="grid min-w-[1040px] grid-cols-[36px_88px_104px_120px_1fr_1fr_170px_120px_48px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  <div />
                  <div>Type</div>
                  <div>Date</div>
                  <div>Time</div>
                  <div>From / Place</div>
                  <div>To / Stay</div>
                  <div>Key detail</div>
                  <div>Booking</div>
                  <div />
                </div>
                {itineraryGroups.map(([dateKey, items]) => (
                  <div key={dateKey} className="min-w-[1040px]">
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-900">{itineraryDateLabel(dateKey)}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{items.length} block{items.length === 1 ? "" : "s"}</p>
                      </div>
                      <div className="flex gap-1">
                        {ITINERARY_ITEM_TYPES.map((type) => (
                          <button key={type} onClick={() => addItem(type, dateKey).catch(console.error)} className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 px-2 text-[11px] text-gray-600 hover:bg-gray-50"><ItineraryTypeIcon type={type} /> {itineraryTypeLabel(type)}</button>
                        ))}
                      </div>
                    </div>
                    {items.map((item) => (
                      <ItineraryItemRow
                        key={item.id}
                        item={item}
                        active={selectedItem?.id === item.id}
                        onSelect={() => setSelectedItemId(item.id)}
                        onPatch={(patch) => patchItem(item, patch)}
                        onMove={(direction) => moveItem(item, direction)}
                        onDelete={() => deleteItem(item)}
                      />
                    ))}
                  </div>
                ))}
                {itinerary.items.length === 0 && <div className="p-10 text-center text-sm text-gray-400">Add car, train, flight, or event rows.</div>}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <div className="grid gap-4">
                  {itinerary.appendixPages.map((page) => (
                    <AppendixEditor key={page.id} productionId={production.id} page={page} onPatch={(patch) => patchAppendixPage(page, patch)} onDelete={() => deleteAppendixPage(page)} />
                  ))}
                  {itinerary.appendixPages.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">No appendix pages yet.</div>}
                </div>
              </div>
            )}
          </div>

          {(tab === "flow" || tab === "items") && selectedItem && (
            <ItineraryItemDetail
              item={selectedItem}
              files={availableFiles}
              onPatch={(patch) => patchItem(selectedItem, patch)}
              onLinkFile={(fileId) => linkFile(selectedItem, fileId)}
              onPatchFile={(fileId, patch) => patchItemFile(selectedItem, fileId, patch)}
              onUnlinkFile={(fileId) => unlinkFile(selectedItem, fileId)}
              onUpload={(files) => uploadAndLink(selectedItem, files)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FlowItineraryView({
  groups,
  selectedItemId,
  parsingTravel,
  travelDropActive,
  travelParseSummary,
  travelInputRef,
  onTravelDrop,
  onTravelDragActive,
  onParseFiles,
  onSelect,
  onPatch,
  onMove,
  onDelete,
  onAdd,
}: {
  groups: Array<[string, CrewItineraryItem[]]>;
  selectedItemId: string | null;
  parsingTravel: boolean;
  travelDropActive: boolean;
  travelParseSummary: string | null;
  travelInputRef: RefObject<HTMLInputElement | null>;
  onTravelDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onTravelDragActive: (active: boolean) => void;
  onParseFiles: (files: FileList | File[] | null) => Promise<void>;
  onSelect: (item: CrewItineraryItem) => void;
  onPatch: (item: CrewItineraryItem, patch: Partial<CrewItineraryItem>) => Promise<void>;
  onMove: (item: CrewItineraryItem, direction: -1 | 1) => Promise<void>;
  onDelete: (item: CrewItineraryItem) => Promise<void>;
  onAdd: (type: CrewItineraryItemType, dateKey?: string) => Promise<void>;
}) {
  const totalItems = groups.reduce((sum, [, items]) => sum + items.length, 0);
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f4]">
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4">
        <input
          ref={travelInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => onParseFiles(event.target.files).catch((err) => window.alert(err instanceof Error ? err.message : "Travel document parse failed"))}
        />
        <button
          type="button"
          onClick={() => travelInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); onTravelDragActive(true); }}
          onDragLeave={() => onTravelDragActive(false)}
          onDrop={onTravelDrop}
          disabled={parsingTravel}
          className={`flex min-h-16 items-center justify-between gap-3 rounded-lg border border-dashed px-4 text-left transition ${
            travelDropActive ? "border-teal-400 bg-teal-50" : "border-gray-200 bg-white hover:bg-gray-50"
          } disabled:cursor-wait disabled:opacity-60`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gray-50 text-gray-700 ring-1 ring-gray-200"><Upload size={16} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-950">{parsingTravel ? "Scanning travel documents..." : "Drop travel confirmations"}</span>
              <span className="mt-0.5 block text-xs text-gray-500">PDFs and screenshots become dated travel blocks.</span>
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-gray-950 px-3 py-2 text-xs font-semibold text-white">Choose files</span>
        </button>
        {travelParseSummary && <p className="text-xs text-emerald-700">{travelParseSummary}</p>}

        {groups.map(([dateKey, items]) => (
          <section key={dateKey} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-gray-950">{itineraryDateLabel(dateKey)}</p>
                <p className="mt-0.5 text-xs text-gray-500">{items.length} block{items.length === 1 ? "" : "s"} in travel flow</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {ITINERARY_ITEM_TYPES.map((type) => (
                  <button key={type} onClick={() => onAdd(type, dateKey).catch(console.error)} className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50">
                    <ItineraryTypeIcon type={type} /> {itineraryTypeLabel(type)}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative grid gap-3 p-4">
              <div className="absolute bottom-4 left-8 top-4 w-px bg-gray-200" />
              {items.map((item) => (
                <FlowItineraryCard
                  key={item.id}
                  item={item}
                  active={item.id === selectedItemId}
                  onSelect={() => onSelect(item)}
                  onPatch={(patch) => onPatch(item, patch)}
                  onMove={(direction) => onMove(item, direction)}
                  onDelete={() => onDelete(item)}
                />
              ))}
            </div>
          </section>
        ))}

        {totalItems === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-gray-950">No travel blocks yet</p>
            <p className="mt-1 text-sm text-gray-500">Drop confirmations above or add the first block manually.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {ITINERARY_ITEM_TYPES.map((type) => (
                <button key={type} onClick={() => onAdd(type).catch(console.error)} className="inline-flex h-9 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  <ItineraryTypeIcon type={type} /> {itineraryTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowItineraryCard({ item, active, onSelect, onPatch, onMove, onDelete }: { item: CrewItineraryItem; active: boolean; onSelect: () => void; onPatch: (patch: Partial<CrewItineraryItem>) => Promise<void>; onMove: (direction: -1 | 1) => Promise<void>; onDelete: () => Promise<void> }) {
  const style = itineraryFlowStyle(item.type);
  const missing = itineraryMissingFields(item);
  return (
    <article onClick={onSelect} className={`relative ml-8 rounded-lg border bg-white p-3 shadow-sm transition ${active ? "border-teal-400 ring-2 ring-teal-100" : "border-gray-200 hover:border-gray-300"}`}>
      <span className={`absolute -left-[31px] top-5 grid h-8 w-8 place-items-center rounded-full border-4 border-white ${style.dot}`}>
        <ItineraryTypeIcon type={item.type} />
      </span>
      <div className="grid gap-3 md:grid-cols-[110px_1fr_auto]">
        <div>
          <span className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${style.badge}`}>
            <ItineraryTypeIcon type={item.type} /> {itineraryTypeLabel(item.type)}
          </span>
          <p className="mt-2 text-xl font-semibold text-gray-950">{itineraryTimeRange(item) || "TBC"}</p>
          <CommitInput value={dateInputValue(item.date)} type="date" onFocus={onSelect} onCommit={(date) => onPatch({ date })} className="mt-2 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-700" />
        </div>
        <div className="min-w-0">
          <button type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }} className="block max-w-full truncate text-left text-lg font-semibold text-gray-950 hover:underline">
            {itineraryFlowTitle(item)}
          </button>
          <p className="mt-1 text-sm leading-5 text-gray-600">{itineraryFlowSummary(item) || "Add booking details in the panel."}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.files.length > 0 && <span className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">{item.files.length} confirmation{item.files.length === 1 ? "" : "s"}</span>}
            {!item.exportVisible && <span className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">Hidden from PDF</span>}
            {missing.slice(0, 3).map((label) => <span key={label} className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">Missing {label}</span>)}
            {missing.length > 3 && <span className="rounded bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">+{missing.length - 3} more</span>}
          </div>
        </div>
        <div className="flex items-start gap-1">
          <button onClick={(event) => { event.stopPropagation(); onMove(-1).catch(console.error); }} className="grid h-8 w-8 place-items-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">↑</button>
          <button onClick={(event) => { event.stopPropagation(); onMove(1).catch(console.error); }} className="grid h-8 w-8 place-items-center rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">↓</button>
          <button onClick={(event) => { event.stopPropagation(); onDelete().catch(console.error); }} className="grid h-8 w-8 place-items-center rounded border border-gray-200 bg-white text-gray-300 hover:border-red-100 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
        </div>
      </div>
    </article>
  );
}

function itineraryFlowStyle(type: CrewItineraryItemType) {
  if (type === "FLIGHT") return { badge: "bg-blue-50 text-blue-700", dot: "bg-blue-600 text-white" };
  if (type === "TRAIN") return { badge: "bg-green-50 text-green-700", dot: "bg-green-600 text-white" };
  if (type === "HOTEL") return { badge: "bg-teal-50 text-teal-700", dot: "bg-teal-600 text-white" };
  if (type === "CAR") return { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-600 text-white" };
  return { badge: "bg-purple-50 text-purple-700", dot: "bg-purple-600 text-white" };
}

function itineraryFlowTitle(item: CrewItineraryItem) {
  if (item.type === "HOTEL") return item.destination || item.provider || "Hotel stay";
  if (item.type === "EVENT") return item.destination || item.provider || item.address || "Event";
  return [item.origin, item.destination].filter(Boolean).join(" -> ") || item.provider || itineraryTypeLabel(item.type);
}

function itineraryFlowSummary(item: CrewItineraryItem) {
  if (item.type === "HOTEL") return [[dateInputValue(item.date), item.startTime].filter(Boolean).join(" "), item.endDate ? `to ${dateInputValue(item.endDate)} ${item.endTime ?? ""}`.trim() : null, item.address, item.bookingReference ? `Booking ${item.bookingReference}` : null].filter(Boolean).join(" · ");
  if (item.type === "FLIGHT") return [item.flightNumber, item.terminal ? `Terminal ${item.terminal}` : null, item.gate ? `Gate ${item.gate}` : null, item.seat ? `Seat ${item.seat}` : null, item.bookingReference ? `Booking ${item.bookingReference}` : null].filter(Boolean).join(" · ");
  if (item.type === "TRAIN") return [item.trainNumber, item.platform ? `Platform ${item.platform}` : null, item.coach, item.seat ? `Seat ${item.seat}` : null, item.bookingReference ? `Booking ${item.bookingReference}` : null].filter(Boolean).join(" · ");
  if (item.type === "CAR") return [item.provider, item.bookingReference ? `Booking ${item.bookingReference}` : null, item.contactName, item.contactPhone].filter(Boolean).join(" · ");
  return [item.address, itineraryTimeRange(item), item.bookingReference ? `Booking ${item.bookingReference}` : null].filter(Boolean).join(" · ");
}

function itineraryMissingFields(item: CrewItineraryItem) {
  const missing: string[] = [];
  if (!item.date) missing.push("date");
  if (!item.startTime) missing.push("time");
  if ((item.type === "FLIGHT" || item.type === "TRAIN" || item.type === "CAR") && !item.origin) missing.push("from");
  if ((item.type === "FLIGHT" || item.type === "TRAIN" || item.type === "CAR") && !item.destination) missing.push("to");
  if (item.type === "HOTEL" && !item.destination) missing.push("hotel");
  if (item.type === "EVENT" && !item.destination && !item.address) missing.push("location");
  if ((item.type === "FLIGHT" && !item.flightNumber) || (item.type === "TRAIN" && !item.trainNumber)) missing.push("service");
  if (!item.bookingReference && (item.type === "FLIGHT" || item.type === "TRAIN" || item.type === "HOTEL")) missing.push("booking");
  if (item.files.length === 0) missing.push("confirmation");
  return missing;
}

function ItineraryItemRow({ item, active, onSelect, onPatch, onMove, onDelete }: { item: CrewItineraryItem; active: boolean; onSelect: () => void; onPatch: (patch: Partial<CrewItineraryItem>) => Promise<void>; onMove: (direction: -1 | 1) => Promise<void>; onDelete: () => Promise<void> }) {
  const fromValue = item.type === "HOTEL" ? (item.provider ?? "") : (item.origin ?? "");
  const fromPlaceholder = item.type === "HOTEL" ? "Booking / hotel group" : "Origin";
  const keyDetailValue = itineraryKeyDetailValue(item);
  return (
    <div onClick={onSelect} className={`grid min-w-[1040px] grid-cols-[36px_88px_104px_120px_1fr_1fr_170px_120px_48px] items-center border-b border-gray-100 px-3 py-1.5 text-xs ${active ? "bg-[#e9fbf8]" : "hover:bg-gray-50"}`}>
      <div className="flex items-center gap-0.5 text-gray-300">
        <button onClick={(event) => { event.stopPropagation(); onMove(-1).catch(console.error); }} className="grid h-6 w-4 place-items-center hover:text-gray-800">↑</button>
        <button onClick={(event) => { event.stopPropagation(); onMove(1).catch(console.error); }} className="grid h-6 w-4 place-items-center hover:text-gray-800">↓</button>
      </div>
      <select value={item.type} onFocus={onSelect} onChange={(event) => onPatch({ type: event.target.value as CrewItineraryItemType }).catch(console.error)} className="h-8 rounded border border-gray-200 bg-white px-2 text-xs">
        {ITINERARY_ITEM_TYPES.map((type) => <option key={type} value={type}>{itineraryTypeLabel(type)}</option>)}
      </select>
      <input type="date" value={dateInputValue(item.date)} onFocus={onSelect} onChange={(event) => onPatch({ date: event.target.value }).catch(console.error)} className="h-8 rounded border border-gray-200 px-2 text-xs" />
      <CommitInput value={item.startTime ?? ""} placeholder="09:00" title={itineraryTimeRange(item)} onFocus={onSelect} onCommit={(startTime) => onPatch({ startTime })} />
      <CommitInput value={fromValue} placeholder={fromPlaceholder} onFocus={onSelect} onCommit={(value) => onPatch(item.type === "HOTEL" ? { provider: value } : { origin: value })} />
      <CommitInput value={item.destination ?? ""} placeholder={item.type === "HOTEL" ? "Hotel name" : "Destination"} onFocus={onSelect} onCommit={(destination) => onPatch({ destination })} />
      <CommitInput value={keyDetailValue} placeholder={item.type === "HOTEL" ? "Address" : item.type === "FLIGHT" ? "Flight no." : item.type === "TRAIN" ? "Service no." : item.type === "CAR" ? "Provider" : "Key detail"} title={itineraryPrimaryDetail(item)} onFocus={onSelect} onCommit={(value) => onPatch(itineraryKeyDetailPatch(item, value))} />
      <CommitInput value={item.bookingReference ?? ""} onFocus={onSelect} onCommit={(bookingReference) => onPatch({ bookingReference })} />
      <button onClick={(event) => { event.stopPropagation(); onDelete().catch(console.error); }} className="grid h-8 w-8 place-items-center text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
    </div>
  );
}

function CommitInput({ value, onCommit, onFocus, placeholder, title, type = "text", className = "h-8 rounded border border-gray-200 bg-white px-2 text-xs" }: { value: string; onCommit: (value: string) => Promise<void>; onFocus?: () => void; placeholder?: string; title?: string; type?: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  async function commit(next = draft) {
    const normalized = next.trim();
    if (normalized === value) return;
    await onCommit(normalized);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      setDraft(value);
      event.currentTarget.blur();
    }
  }

  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      title={title}
      onClick={(event) => event.stopPropagation()}
      onFocus={() => {
        focusedRef.current = true;
        onFocus?.();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focusedRef.current = false;
        commit(event.target.value).catch(console.error);
      }}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
}

function ItineraryItemDetail({ item, files, onPatch, onLinkFile, onPatchFile, onUnlinkFile, onUpload }: { item: CrewItineraryItem; files: NonNullable<Production["jobFiles"]>; onPatch: (patch: Partial<CrewItineraryItem>) => Promise<void>; onLinkFile: (fileId: string) => Promise<void>; onPatchFile: (fileId: string, patch: { exportVisible: boolean }) => Promise<void>; onUnlinkFile: (fileId: string) => Promise<void>; onUpload: (files: FileList | null) => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endDateLabel = item.type === "HOTEL" ? "Check-out date" : item.type === "EVENT" ? "End date" : "Arrival/end date";
  const endTimeLabel = item.type === "HOTEL" ? "Check-out time" : item.type === "EVENT" ? "End time" : "Arrival/end time";
  const showTimezones = item.type === "FLIGHT" || item.type === "TRAIN";
  const showAddress = item.type === "CAR" || item.type === "HOTEL" || item.type === "EVENT";
  const showFlight = item.type === "FLIGHT";
  const showTrain = item.type === "TRAIN";
  const showSeat = item.type === "FLIGHT" || item.type === "TRAIN";
  const showPassenger = item.type === "FLIGHT" || item.type === "TRAIN" || item.type === "HOTEL";
  const showHotel = item.type === "HOTEL";
  const showContact = item.type === "CAR" || item.type === "HOTEL" || item.type === "EVENT";
  return (
    <div className="w-[340px] shrink-0 overflow-auto border-l border-gray-200 bg-gray-50 p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-950"><ItineraryTypeIcon type={item.type} /> Booking details</div>
      <div className="grid gap-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <DetailInput label={endDateLabel} type="date" value={dateInputValue(item.endDate)} onSave={(endDate) => onPatch({ endDate })} />
          <DetailInput label={endTimeLabel} value={item.endTime ?? ""} onSave={(endTime) => onPatch({ endTime })} />
        </div>
        {showTimezones && (
          <div className="grid grid-cols-2 gap-2">
            <DetailInput label="Depart timezone" value={item.startTimezone ?? ""} onSave={(startTimezone) => onPatch({ startTimezone })} />
            <DetailInput label="Arrive timezone" value={item.endTimezone ?? ""} onSave={(endTimezone) => onPatch({ endTimezone })} />
          </div>
        )}
        {showAddress && <DetailInput label={item.type === "HOTEL" ? "Hotel address" : "Address"} value={item.address ?? ""} onSave={(address) => onPatch({ address })} />}
        {showFlight && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <DetailInput label="Flight no." value={item.flightNumber ?? ""} onSave={(flightNumber) => onPatch({ flightNumber })} />
              <DetailInput label="Terminal" value={item.terminal ?? ""} onSave={(terminal) => onPatch({ terminal })} />
              <DetailInput label="Gate" value={item.gate ?? ""} onSave={(gate) => onPatch({ gate })} />
            </div>
            <DetailInput label="Baggage" value={item.baggage ?? ""} onSave={(baggage) => onPatch({ baggage })} />
          </>
        )}
        {showTrain && (
          <div className="grid grid-cols-3 gap-2">
            <DetailInput label="Service no." value={item.trainNumber ?? ""} onSave={(trainNumber) => onPatch({ trainNumber })} />
            <DetailInput label="Platform" value={item.platform ?? ""} onSave={(platform) => onPatch({ platform })} />
            <DetailInput label="Coach/class" value={item.coach ?? ""} onSave={(coach) => onPatch({ coach })} />
          </div>
        )}
        {showSeat && <DetailInput label="Seat" value={item.seat ?? ""} onSave={(seat) => onPatch({ seat })} />}
        {showPassenger && <DetailInput label={item.type === "HOTEL" ? "Guest name" : "Passenger name"} value={item.passengerName ?? ""} onSave={(passengerName) => onPatch({ passengerName })} />}
        {showHotel && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <DetailInput label="Room type" value={item.roomType ?? ""} onSave={(roomType) => onPatch({ roomType })} />
              <DetailInput label="Room no." value={item.roomNumber ?? ""} onSave={(roomNumber) => onPatch({ roomNumber })} />
            </div>
            <DetailInput label="Check-in details" value={item.checkInDetails ?? ""} onSave={(checkInDetails) => onPatch({ checkInDetails })} />
            <DetailInput label="Check-out details" value={item.checkOutDetails ?? ""} onSave={(checkOutDetails) => onPatch({ checkOutDetails })} />
          </>
        )}
        {showContact && (
          <>
            <DetailInput label="Contact name" value={item.contactName ?? ""} onSave={(contactName) => onPatch({ contactName })} />
            <DetailInput label="Contact phone" value={item.contactPhone ?? ""} onSave={(contactPhone) => onPatch({ contactPhone })} />
            <DetailInput label="Contact email" value={item.contactEmail ?? ""} onSave={(contactEmail) => onPatch({ contactEmail })} />
          </>
        )}
        <label className="block text-gray-500">
          Notes
          <CommitTextarea value={item.notes ?? ""} onCommit={(notes) => onPatch({ notes })} />
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          <input type="checkbox" checked={item.exportVisible} onChange={(event) => onPatch({ exportVisible: event.target.checked }).catch(console.error)} />
          Show in PDF
        </label>
        <div className="border-t border-gray-200 pt-3">
          <p className="mb-2 font-semibold text-gray-900">Booking files</p>
          <div className="space-y-1">
            {item.files.map((link) => (
              <div key={link.id} className="rounded bg-white px-2 py-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <a href={`/api/files/${link.file.id}/download`} className="truncate text-gray-700 underline" target="_blank" rel="noreferrer">{link.file.originalFilename}</a>
                  <button onClick={() => onUnlinkFile(link.fileId).catch(console.error)} className="shrink-0 text-gray-300 hover:text-red-500"><X size={12} /></button>
                </div>
                <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                  <input
                    type="checkbox"
                    checked={link.exportVisible}
                    onChange={(event) => onPatchFile(link.fileId, { exportVisible: event.target.checked }).catch(console.error)}
                  />
                  Include confirmation in PDF appendix
                </label>
              </div>
            ))}
          </div>
          <select onChange={(event) => { onLinkFile(event.target.value).catch(console.error); event.currentTarget.value = ""; }} className="mt-2 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs">
            <option value="">Link existing file...</option>
            {files.map((file) => <option key={file.id} value={file.id}>{file.originalFilename}</option>)}
          </select>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => onUpload(event.target.files).catch((err) => window.alert(err instanceof Error ? err.message : "Upload failed"))} />
          <button onClick={() => fileInputRef.current?.click()} className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50"><Upload size={13} /> Upload confirmation</button>
        </div>
      </div>
    </div>
  );
}

function DetailInput({ label, value, onSave, type = "text" }: { label: string; value: string; onSave: (value: string) => Promise<void>; type?: string }) {
  return (
    <label className="block text-gray-500">
      {label}
      <CommitInput type={type} value={value} onCommit={onSave} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900" />
    </label>
  );
}

function CommitTextarea({ value, onCommit }: { value: string; onCommit: (value: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  async function commit(next = draft) {
    if (next === value) return;
    await onCommit(next);
  }

  return (
    <textarea
      value={draft}
      rows={4}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focusedRef.current = false;
        commit(event.target.value).catch(console.error);
      }}
      className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-white p-2 text-sm text-gray-900"
    />
  );
}

function AppendixEditor({ productionId, page, onPatch, onDelete }: { productionId: string; page: CrewItineraryAppendixPage; onPatch: (patch: Partial<CrewItineraryAppendixPage>) => Promise<void>; onDelete: () => Promise<void> }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-100">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white p-3">
        <input defaultValue={page.title} onBlur={(event) => onPatch({ title: event.target.value }).catch(console.error)} className="h-9 min-w-0 flex-1 rounded-md border border-gray-200 px-2 text-sm font-semibold text-gray-950" />
        <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={page.exportVisible} onChange={(event) => onPatch({ exportVisible: event.target.checked }).catch(console.error)} /> PDF</label>
        <button onClick={() => onDelete().catch(console.error)} className="grid h-8 w-8 place-items-center rounded-md text-gray-300 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
      </div>
      <RichTextEditor productionId={productionId} value={page.bodyHtml} onSave={(bodyHtml) => onPatch({ bodyHtml })} />
    </div>
  );
}

function ResizableImageNodeView({ node, selected, updateAttributes }: NodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const width = String(node.attrs.width || "100%");

  function startResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const container = wrapper.parentElement ?? wrapper;
    const startX = event.clientX;
    const startWidth = wrapper.getBoundingClientRect().width;
    const containerWidth = Math.max(160, container.getBoundingClientRect().width);

    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(120, Math.min(containerWidth, startWidth + moveEvent.clientX - startX));
      const percent = Math.round((nextWidth / containerWidth) * 100);
      updateAttributes({ width: `${Math.max(15, Math.min(100, percent))}%` });
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <NodeViewWrapper className="my-4 block" contentEditable={false}>
      <div ref={wrapperRef} className={`group relative inline-block max-w-full ${selected ? "ring-2 ring-teal-400" : ""}`} style={{ width }}>
        <img src={node.attrs.src} alt={node.attrs.alt || ""} className="block h-auto w-full rounded-md border border-gray-200" draggable={false} />
        <button
          type="button"
          onMouseDown={startResize}
          className={`absolute bottom-1 right-1 h-4 w-4 rounded-sm border border-white bg-gray-950 shadow ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          aria-label="Resize image"
          title="Drag to resize"
        />
      </div>
    </NodeViewWrapper>
  );
}

const ResizableTiptapImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") || element.style.width || "100%",
        renderHTML: (attributes) => ({
          "data-width": attributes.width,
          style: `width: ${attributes.width}; max-width: 100%; height: auto;`,
        }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});

function RichTextEditor({ productionId, value, onSave }: { productionId: string; value: string; onSave: (html: string) => Promise<void> }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageDropActive, setImageDropActive] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      ResizableTiptapImage.configure({
        allowBase64: false,
        HTMLAttributes: {
          class: "my-4 max-w-full rounded-md border border-gray-200",
        },
      }),
      Placeholder.configure({ placeholder: "Add travel notes, contacts, hotel details, map links..." }),
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "min-h-[1020px] p-14 text-[13px] leading-6 text-gray-850 outline-none [&_img]:max-w-full [&_img]:h-auto",
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || "<p></p>");
  }, [editor, value]);

  async function uploadImages(files: FileList | null, insertPosition?: number) {
    if (!editor || !files?.length) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (selected.length === 0) return;
    if (insertPosition !== undefined) editor.chain().focus().setTextSelection(insertPosition).run();
    const form = new FormData();
    form.append("folder", "References");
    form.append("notes", "Travel itinerary appendix image");
    selected.forEach((file) => form.append("files", file));
    const response = await fetch(`/api/files/production/${productionId}/upload`, { method: "POST", credentials: "include", body: form });
    if (!response.ok) throw new Error("Image upload failed");
    const payload = await response.json();
    const uploaded = Array.isArray(payload) ? payload : [payload];
    uploaded.forEach((file: { id: string; originalFilename?: string }) => {
      editor.chain().focus().insertContent({ type: "image", attrs: { src: `/api/files/${file.id}/download`, alt: file.originalFilename ?? "Appendix image", width: "100%" } }).run();
    });
    await onSave(editor.getHTML());
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function onImageDrop(event: DragEvent<HTMLDivElement>) {
    const hasImages = Array.from(event.dataTransfer.files).some((file) => file.type.startsWith("image/"));
    if (!hasImages) return;
    event.preventDefault();
    event.stopPropagation();
    setImageDropActive(false);
    const position = editor?.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
    uploadImages(event.dataTransfer.files, position).catch((err) => window.alert(err instanceof Error ? err.message : "Image upload failed"));
  }

  return (
    <div onBlur={() => editor && onSave(editor.getHTML()).catch(console.error)}>
      <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-3 py-2">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBold().run()} className={`h-8 rounded px-2 text-xs font-semibold ${editor?.isActive("bold") ? "bg-gray-950 text-white" : "border border-gray-200 bg-white text-gray-700"}`}>B</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleItalic().run()} className={`h-8 rounded px-2 text-xs italic ${editor?.isActive("italic") ? "bg-gray-950 text-white" : "border border-gray-200 bg-white text-gray-700"}`}>I</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().toggleBulletList().run()} className={`h-8 rounded border px-2 text-xs ${editor?.isActive("bulletList") ? "border-gray-950 bg-gray-950 text-white" : "border-gray-200 bg-white text-gray-700"}`}>List</button>
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => uploadImages(event.target.files).catch((err) => window.alert(err instanceof Error ? err.message : "Image upload failed"))} />
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => imageInputRef.current?.click()} className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><ImageIcon size={13} /> Image</button>
      </div>
      <div
        className={`overflow-auto px-6 py-6 transition ${imageDropActive ? "bg-teal-50" : "bg-gray-100"}`}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
            event.preventDefault();
            setImageDropActive(true);
          }
        }}
        onDragLeave={() => setImageDropActive(false)}
        onDrop={onImageDrop}
      >
        <div className={`mx-auto min-h-[1123px] w-[794px] max-w-full bg-white shadow-sm ring-1 ${imageDropActive ? "ring-2 ring-teal-400" : "ring-gray-200"}`}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
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
