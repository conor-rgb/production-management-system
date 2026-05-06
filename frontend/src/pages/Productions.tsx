import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type {
  ActivityNote,
  ActivityTask,
  Contact,
  CrewMember,
  CrewRole,
  CrewStatus,
  FreeAgentInvoiceStatus,
  PmsJobType,
  Production,
  ProductionDate,
  ProductionDateType,
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
const TABS = ["Overview", "Dates", "Crew", "Comms", "Files", "Budget"] as const;
type Tab = typeof TABS[number];

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

function ProductionDetail({ productionId, onClose, onSaved, onInvoicePrompt }: {
  productionId: string;
  onClose: () => void;
  onSaved: () => void;
  onInvoicePrompt: (production: Production) => void;
}) {
  const [production, setProduction] = useState<Production | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");

  const reload = useCallback(() => {
    api.get<Production>(`/api/productions/${productionId}`).then(setProduction).catch(console.error);
  }, [productionId]);

  useEffect(() => { reload(); setTab("Overview"); }, [reload]);

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
              onClick={() => setTab(item)}
              className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium ${tab === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {tab === "Overview" && <OverviewTab production={production} onSave={saveOverview} onStatusSaved={(p) => { setProduction(p); onSaved(); }} onInvoicePrompt={onInvoicePrompt} />}
        {tab === "Dates" && <DatesTab production={production} onReload={reload} />}
        {tab === "Crew" && <CrewTab production={production} onReload={reload} />}
        {tab === "Comms" && <CommsTab production={production} onReload={reload} />}
        {tab === "Files" && <Placeholder icon={<FileText size={28} />} text="Files will be built in Phase 4." />}
        {tab === "Budget" && <Placeholder icon={<Film size={28} />} text="Budget will be built in Phase 5." />}
      </div>
    </div>
  );
}

function OverviewTab({ production, onSave, onStatusSaved, onInvoicePrompt }: {
  production: Production;
  onSave: (data: Partial<Production>) => void;
  onStatusSaved: (production: Production) => void;
  onInvoicePrompt: (production: Production) => void;
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

function DatesTab({ production, onReload }: { production: Production; onReload: () => void }) {
  const [editing, setEditing] = useState<ProductionDate | "new" | null>(null);

  async function remove(dateId: string) {
    if (!window.confirm("Delete this production date?")) return;
    await api.delete(`/api/productions/${production.id}/dates/${dateId}`);
    onReload();
  }

  return (
    <div className="space-y-3">
      <button onClick={() => setEditing("new")} className="min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
        Add date
      </button>
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

  const timeline = useMemo(() => {
    const notes = (production.activityNotes ?? []).map((item) => ({ kind: "note" as const, at: item.createdAt, item }));
    const tasks = (production.activityTasks ?? []).map((item) => ({ kind: "task" as const, at: item.createdAt, item }));
    const emails = production.emailThreads.flatMap((thread) => thread.messages.map((message) => ({ kind: "email" as const, at: message.sentAt ?? message.createdAt, item: message, thread })));
    return [...notes, ...tasks, ...emails].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [production]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-3">
        <div className="mb-2 flex rounded-lg bg-gray-100 p-1">
          {(["note", "task"] as const).map((item) => (
            <button key={item} onClick={() => setMode(item)} className={`min-h-11 flex-1 rounded-md text-sm font-medium ${mode === item ? "bg-white shadow-sm" : "text-gray-600"}`}>
              {item === "note" ? "Note" : "Task"}
            </button>
          ))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none" placeholder={mode === "note" ? "Add a note" : "Add a task"} />
        <button onClick={add} className="mt-2 min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Add {mode}</button>
      </div>
      {timeline.length === 0 ? <Empty text="No timeline activity yet." /> : timeline.map((entry) => {
        if (entry.kind === "note") return <TimelineShell key={`n-${entry.item.id}`} icon={<FileText size={14} />} at={entry.at}><p className="whitespace-pre-wrap text-sm text-gray-700">{entry.item.body}</p><button onClick={() => removeNote(entry.item)} className="mt-1 text-xs text-red-500">Delete</button></TimelineShell>;
        if (entry.kind === "task") return <TimelineShell key={`t-${entry.item.id}`} icon={<Check size={14} />} at={entry.at}><button onClick={() => toggleTask(entry.item)} className={`flex min-h-11 items-center gap-2 text-left text-sm ${entry.item.completed ? "text-gray-400 line-through" : "text-gray-800"}`}><span className={`grid h-5 w-5 place-items-center rounded border ${entry.item.completed ? "bg-gray-900 text-white" : "border-gray-300"}`}>{entry.item.completed && <Check size={12} />}</span>{entry.item.body}</button></TimelineShell>;
        return <TimelineShell key={`e-${entry.item.id}`} icon={<Mail size={14} />} at={entry.at}><a href={`mailto:${entry.item.from}`} className="block text-sm font-medium text-indigo-700">{entry.item.subject || entry.thread.subject || "Email"}</a><p className="text-xs text-gray-500">{entry.item.from}</p></TimelineShell>;
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

function Placeholder({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="grid min-h-56 place-items-center rounded-lg border border-gray-200 text-center text-sm text-gray-400"><div>{icon}<p className="mt-2">{text}</p></div></div>;
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
