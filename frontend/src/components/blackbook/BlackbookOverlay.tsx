import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X, Search, Mail, Briefcase, CalendarDays, Tag, Users, UserPlus, Building2 } from "lucide-react";
import { api } from "../../lib/api";

type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";
type BlackbookLifecycleStatus = "TARGET" | "IN_TOUCH" | "CLIENT" | "PAST_CLIENT" | "SUPPLIER" | "PREFERRED_SUPPLIER" | "DO_NOT_USE" | "ARCHIVED";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface BlackbookConfigType {
  id: string;
  name: string;
  slug: string;
}

interface BlackbookConfigCategory {
  id: string;
  name: string;
  broadType: BlackbookCategory;
  color: string;
  coreFields: string[];
  types: BlackbookConfigType[];
}

interface BlackbookEntry {
  id: string;
  entryType: BlackbookEntryType;
  lifecycleStatus: BlackbookLifecycleStatus;
  category: BlackbookCategory;
  categoryConfigId: string | null;
  typeIds: string[];
  contactId?: string | null;
  companyEntryId?: string | null;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName: string | null;
  jobTitle?: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  dietaryNotes: string | null;
  dietaryFlags: string[];
  allergens: string[];
}

interface BlackbookCrmResponse {
  entry: BlackbookEntry & {
    contact?: { id: string; firstName: string; lastName?: string | null; company?: { name: string } | null } | null;
    companyEntry?: { id: string; displayName: string; email: string | null; companyName: string | null } | null;
    people?: BlackbookEntry[];
    targetLists?: Array<{ id: string; status: string; list: { id: string; name: string } }>;
    categoryConfig?: BlackbookConfigCategory | null;
    optionCandidates: Array<{
      id: string;
      name: string;
      production: { id: string; title: string; jobCode: string | null; clientName: string | null; brand: string | null; status: string };
      group: { name: string; type: string };
      dateStatuses: Array<{ status: string; date: { date: string; label: string | null; dateType: string } }>;
      blackbookEntry?: { id: string; displayName: string; email: string | null; companyEntryId: string | null } | null;
    }>;
  };
  opportunities: Array<{ id: string; title: string; clientName: string | null; brand: string | null; stage: string; createdAt: string }>;
  productions: Array<{ id: string; production: { id: string; title: string; jobCode: string | null; clientName: string | null; brand: string | null; status: string } }>;
  emailMessages: Array<{
    id: string;
    threadId: string;
    subject: string;
    fromAddress: string;
    fromName: string | null;
    snippet: string | null;
    sentAt: string;
    isFromMe: boolean;
    thread: { id: string; subject: string };
  }>;
  rollup?: {
    entryIds: string[];
    contactIds: string[];
    emailAddresses: string[];
    peopleCount: number;
  };
}

export default function BlackbookOverlay({ initialEntryId, onClose }: { initialEntryId?: string | null; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<BlackbookEntry[]>([]);
  const [categories, setCategories] = useState<BlackbookConfigCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntryId ?? null);
  const [detail, setDetail] = useState<BlackbookCrmResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<BlackbookConfigCategory[]>("/api/settings/blackbook/categories").then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ q: query, limit: "30" });
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`).then((data) => {
      setEntries(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    }).catch(console.error);
  }, [query, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api.get<BlackbookCrmResponse>(`/api/options/blackbook/${selectedId}/crm`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selected = detail?.entry ?? entries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-[950] bg-black/25 p-3" style={{ animation: "blackbookOverlayFade 160ms ease-out" }}>
      <style>{`
        @keyframes blackbookOverlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes blackbookPanelSlideIn {
          from { opacity: 0.96; transform: translateX(32px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="ml-auto flex h-full w-full max-w-[1120px] overflow-hidden rounded-xl bg-white shadow-2xl" style={{ animation: "blackbookPanelSlideIn 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-gray-200 bg-[#fbfbfa]">
          <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
            <h2 className="text-sm font-semibold text-gray-900">Blackbook</h2>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100"><X size={16} /></button>
          </div>
          <div className="border-b border-gray-200 p-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search blackbook..." className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-gray-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {entries.map((entry) => (
              <button key={entry.id} onClick={() => setSelectedId(entry.id)} className={`block w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-white ${selectedId === entry.id ? "bg-white" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: categories.find((category) => category.id === entry.categoryConfigId)?.color ?? "#d1d5db" }} />
                  <p className="truncate text-sm font-medium text-gray-900">{entry.displayName}</p>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-400">{[entry.companyName, entry.email, entry.city].filter(Boolean).join(" · ") || entry.category.toLowerCase()}</p>
              </button>
            ))}
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-auto">
          {!selected ? (
            <div className="grid h-full place-items-center text-sm text-gray-400">No blackbook entry selected.</div>
          ) : loading || !detail ? (
            <div className="grid h-full place-items-center text-sm text-gray-400">Loading blackbook record...</div>
          ) : (
            <BlackbookDetail
              data={detail}
              categories={categories}
              onOpenEntry={setSelectedId}
              onRefresh={() => selectedId && api.get<BlackbookCrmResponse>(`/api/options/blackbook/${selectedId}/crm`).then(setDetail).catch(console.error)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function BlackbookDetail({
  data,
  categories,
  onOpenEntry,
  onRefresh,
}: {
  data: BlackbookCrmResponse;
  categories: BlackbookConfigCategory[];
  onOpenEntry: (entryId: string) => void;
  onRefresh: () => void;
}) {
  const { entry } = data;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const category = categories.find((item) => item.id === entry.categoryConfigId);
  const typeNames = category?.types.filter((type) => entry.typeIds.includes(type.id)).map((type) => type.name) ?? [];

  async function patch(patchData: Partial<BlackbookEntry>) {
    setSaveStatus("saving");
    try {
      await api.patch(`/api/options/blackbook/${entry.id}`, patchData);
      await onRefresh();
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus("idle"), 1400);
    } catch (error) {
      console.error(error);
      setSaveStatus("error");
      throw error;
    }
  }
  const emailCount = data.emailMessages.length;
  const optionCount = entry.optionCandidates.length;
  const opportunityCount = data.opportunities.length;
  const productionCount = data.productions.length;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: category?.color ?? "#d1d5db" }} />
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-400">{category?.name ?? entry.category.toLowerCase()}</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{entry.displayName}</h1>
          <p className="mt-1 text-sm text-gray-500">{[entry.companyEntry?.displayName ?? entry.companyName, entry.email, entry.phone].filter(Boolean).join(" · ")}</p>
          {typeNames.length > 0 && <p className="mt-2 text-xs text-gray-500">{typeNames.join(" · ")}</p>}
          {(entry.targetLists?.length ?? 0) > 0 && <p className="mt-2 text-xs text-violet-600">{entry.targetLists?.map((item) => `${item.list.name}: ${item.status.toLowerCase().replace(/_/g, " ")}`).join(" · ")}</p>}
        </div>
        <div className="space-y-3">
          <SaveIndicator status={saveStatus} />
          <LifecycleEditor value={entry.lifecycleStatus} onChange={(lifecycleStatus) => patch({ lifecycleStatus })} />
          <CategoryEditor entry={entry} categories={categories} onSave={patch} />
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard label={entry.entryType === "COMPANY" ? "People" : "Company people"} value={entry.entryType === "COMPANY" ? entry.people?.length ?? 0 : entry.companyEntry ? 1 : 0} />
        <MetricCard label="Emails" value={emailCount} />
        <MetricCard label="Options" value={optionCount} />
        <MetricCard label="Jobs / Opps" value={productionCount + opportunityCount} />
      </div>

      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{entry.entryType === "COMPANY" ? "Company notes" : "Record notes"}</h3>
          {entry.entryType === "COMPANY" && data.rollup && (
            <span className="shrink-0 text-[11px] text-gray-400">{data.rollup.emailAddresses.length} email addresses in rollup</span>
          )}
        </div>
        <NotesEditor value={entry.notes ?? ""} onSave={(notes) => patch({ notes })} placeholder={entry.entryType === "COMPANY" ? "Add company-level context, client preferences, relationship notes, billing quirks..." : "Add relationship notes, preferences, context..."} />
      </section>

      {(entry.dietaryNotes || entry.dietaryFlags.length || entry.allergens.length) && (
        <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">Dietaries</h3>
          <p className="text-sm text-amber-900">{[...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ")}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {entry.entryType === "COMPANY" ? (
          <CompanyPeopleManager company={entry} people={entry.people ?? []} onOpenEntry={onOpenEntry} onRefresh={onRefresh} />
        ) : (
          <PersonCompanyManager entry={entry} onOpenEntry={onOpenEntry} onRefresh={onRefresh} />
        )}
        <TimelineSection title="Projects" icon={<Briefcase size={15} />} empty="No linked projects yet.">
          {data.productions.map((item) => (
            <Card key={item.id} title={`${item.production.jobCode ?? ""} ${item.production.title}`.trim()} meta={[item.production.clientName, item.production.brand, item.production.status].filter(Boolean).join(" · ")} />
          ))}
        </TimelineSection>
        <TimelineSection title="Opportunities" icon={<CalendarDays size={15} />} empty="No linked opportunities yet.">
          {data.opportunities.map((item) => (
            <Card key={item.id} title={item.title} meta={[item.clientName, item.brand, item.stage].filter(Boolean).join(" · ")} />
          ))}
        </TimelineSection>
        <TimelineSection title="Options" icon={<Tag size={15} />} empty="No option history yet.">
          {entry.optionCandidates.map((candidate) => (
            <Card key={candidate.id} title={`${candidate.group.name} · ${candidate.name}`} meta={`${candidate.production.jobCode ?? ""} ${candidate.production.title} · ${candidate.blackbookEntry && entry.entryType === "COMPANY" ? candidate.blackbookEntry.displayName : ""} · ${candidate.dateStatuses.map((status) => `${status.date.label ?? status.date.dateType}: ${status.status.toLowerCase().replace(/_/g, " ")}`).join(" · ")}`} />
          ))}
        </TimelineSection>
        <TimelineSection title="Email messages" icon={<Mail size={15} />} empty="No matching email messages yet.">
          {data.emailMessages.map((message) => (
            <a key={message.id} href={`/email?thread=${message.threadId}&message=${message.id}`} className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-400">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-medium text-gray-900">{message.subject}</p>
                <span className="shrink-0 text-[10px] text-gray-400">{new Date(message.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              </div>
              <p className="mt-1 truncate text-xs text-gray-500">{message.isFromMe ? "To" : "From"} {message.fromName || message.fromAddress}</p>
              {message.snippet && <p className="mt-1 line-clamp-2 text-xs text-gray-400">{message.snippet}</p>}
            </a>
          ))}
        </TimelineSection>
      </div>
    </div>
  );
}

function LifecycleEditor({ value, onChange }: { value: BlackbookLifecycleStatus; onChange: (value: BlackbookLifecycleStatus) => Promise<void> }) {
  const options: BlackbookLifecycleStatus[] = ["TARGET", "IN_TOUCH", "CLIENT", "PAST_CLIENT", "SUPPLIER", "PREFERRED_SUPPLIER", "DO_NOT_USE", "ARCHIVED"];
  return (
    <div className="w-[280px] rounded-lg border border-gray-200 p-3">
      <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Relationship</label>
      <select value={value} onChange={(event) => { onChange(event.target.value as BlackbookLifecycleStatus).catch(console.error); }} className="mt-1 h-9 w-full rounded border border-gray-200 px-2 text-xs">
        {options.map((option) => <option key={option} value={option}>{option.toLowerCase().replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return <div className="h-5" />;
  const label = status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save failed";
  const className = status === "saving"
    ? "text-gray-400"
    : status === "saved"
      ? "text-emerald-600"
      : "text-red-600";
  return <div className={`h-5 text-right text-[11px] font-medium ${className}`}>{label}</div>;
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-[#fbfbfa] p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function NotesEditor({ value, onSave, placeholder }: { value: string; onSave: (value: string) => Promise<void>; placeholder: string }) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    setDraft(value);
  }, [value]);

  async function save() {
    if (draft === value) return;
    setStatus("saving");
    try {
      await onSave(draft);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch (error) {
      console.error(error);
      setDraft(value);
      setStatus("error");
    } finally {
    }
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { save().catch(console.error); }}
        placeholder={placeholder}
        className="min-h-28 w-full resize-y rounded-md border border-gray-200 bg-[#fffdf3] p-3 text-sm leading-6 text-gray-800 outline-none shadow-inner focus:border-amber-300"
      />
      <div className={`mt-1 flex justify-end text-[10px] ${status === "saved" ? "text-emerald-600" : status === "error" ? "text-red-600" : "text-gray-400"}`}>
        {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : status === "error" ? "Save failed - reverted" : "Autosaves on blur"}
      </div>
    </div>
  );
}

function PersonCompanyManager({ entry, onOpenEntry, onRefresh }: { entry: BlackbookCrmResponse["entry"]; onOpenEntry: (entryId: string) => void; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<BlackbookEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [companyName, setCompanyName] = useState(entry.companyName ?? "");

  useEffect(() => {
    if (!query.trim()) {
      setCompanies([]);
      return;
    }
    const params = new URLSearchParams({ q: query, entryType: "COMPANY", limit: "8" });
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`).then(setCompanies).catch(console.error);
  }, [query]);

  async function attach(companyId: string) {
    await api.patch(`/api/options/blackbook/${entry.id}`, { companyEntryId: companyId });
    setQuery("");
    onRefresh();
  }

  async function detach() {
    await api.patch(`/api/options/blackbook/${entry.id}`, { companyEntryId: null });
    onRefresh();
  }

  async function createCompany() {
    const name = companyName.trim();
    if (!name) return;
    const created = await api.post<BlackbookEntry>("/api/options/blackbook", {
      displayName: name,
      entryType: "COMPANY",
      lifecycleStatus: entry.lifecycleStatus,
      category: entry.category,
    });
    await attach(created.id);
    setCreating(false);
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500"><Building2 size={15} /> Company</h3>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        {entry.companyEntry ? (
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => onOpenEntry(entry.companyEntry!.id)} className="min-w-0 text-left">
              <p className="truncate text-sm font-medium text-gray-900">{entry.companyEntry.displayName}</p>
              <p className="mt-1 text-xs text-gray-500">Company record</p>
            </button>
            <button onClick={detach} className="shrink-0 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-red-200 hover:text-red-600">Detach</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">No company attached yet.</p>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Find company</label>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies..." className="mt-1 h-9 w-full rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
              {companies.length > 0 && (
                <div className="mt-2 overflow-hidden rounded border border-gray-200">
                  {companies.map((company) => (
                    <button key={company.id} onClick={() => attach(company.id)} className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50">
                      <p className="text-xs font-medium text-gray-900">{company.displayName}</p>
                      <p className="text-[11px] text-gray-400">{[company.email, company.city].filter(Boolean).join(" · ") || "Company"}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {creating ? (
              <div className="rounded-lg bg-gray-50 p-3">
                <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">New company</label>
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} className="mt-1 h-9 w-full rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setCreating(false)} className="rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-white">Cancel</button>
                  <button onClick={createCompany} className="rounded bg-gray-900 px-2 py-1 text-[11px] font-medium text-white">Create and attach</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} className="rounded border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:border-gray-400">+ Create company from this record</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CompanyPeopleManager({
  company,
  people,
  onOpenEntry,
  onRefresh,
}: {
  company: BlackbookCrmResponse["entry"];
  people: BlackbookEntry[];
  onOpenEntry: (entryId: string) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<BlackbookEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [newPerson, setNewPerson] = useState({ firstName: "", lastName: "", email: "", phone: "", jobTitle: "" });

  useEffect(() => {
    if (!query.trim()) {
      setMatches([]);
      return;
    }
    const params = new URLSearchParams({ q: query, entryType: "PERSON", limit: "8" });
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`)
      .then((data) => setMatches(data.filter((person) => person.id !== company.id && person.companyEntryId !== company.id)))
      .catch(console.error);
  }, [company.id, query]);

  async function attach(personId: string) {
    await api.patch(`/api/options/blackbook/${personId}`, { companyEntryId: company.id });
    setQuery("");
    setMatches([]);
    onRefresh();
  }

  async function detach(personId: string) {
    await api.patch(`/api/options/blackbook/${personId}`, { companyEntryId: null });
    onRefresh();
  }

  async function createPerson() {
    const firstName = newPerson.firstName.trim();
    const lastName = newPerson.lastName.trim();
    const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (!displayName) return;
    await api.post<BlackbookEntry>("/api/options/blackbook", {
      displayName,
      firstName: firstName || null,
      lastName: lastName || null,
      email: newPerson.email.trim() || null,
      phone: newPerson.phone.trim() || null,
      jobTitle: newPerson.jobTitle.trim() || null,
      companyEntryId: company.id,
      companyName: company.displayName,
      entryType: "PERSON",
      category: company.category,
      categoryConfigId: company.categoryConfigId,
      typeIds: company.typeIds,
      lifecycleStatus: company.lifecycleStatus,
    });
    setCreating(false);
    setNewPerson({ firstName: "", lastName: "", email: "", phone: "", jobTitle: "" });
    onRefresh();
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500"><Users size={15} /> People</h3>
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="space-y-2">
          {people.length > 0 ? people.map((person) => (
            <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-2">
              <button onClick={() => onOpenEntry(person.id)} className="min-w-0 text-left">
                <p className="truncate text-sm font-medium text-gray-900">{person.displayName}</p>
                <p className="mt-0.5 truncate text-xs text-gray-500">{[person.jobTitle, person.email, person.phone].filter(Boolean).join(" · ")}</p>
              </button>
              <button onClick={() => detach(person.id)} className="shrink-0 rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-red-200 hover:text-red-600">Detach</button>
            </div>
          )) : (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-400">No people attached yet.</p>
          )}
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2">
            <UserPlus size={14} className="text-gray-400" />
            <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Attach person</label>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people..." className="mt-2 h-9 w-full rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
          {matches.length > 0 && (
            <div className="mt-2 overflow-hidden rounded border border-gray-200">
              {matches.map((person) => (
                <button key={person.id} onClick={() => attach(person.id)} className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50">
                  <p className="text-xs font-medium text-gray-900">{person.displayName}</p>
                  <p className="text-[11px] text-gray-400">{[person.companyEntryId ? "Attached elsewhere" : null, person.email, person.phone].filter(Boolean).join(" · ") || "Person"}</p>
                </button>
              ))}
            </div>
          )}

          {creating ? (
            <div className="mt-3 rounded-lg bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <input value={newPerson.firstName} onChange={(event) => setNewPerson((prev) => ({ ...prev, firstName: event.target.value }))} placeholder="First name" className="h-9 rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
                <input value={newPerson.lastName} onChange={(event) => setNewPerson((prev) => ({ ...prev, lastName: event.target.value }))} placeholder="Last name" className="h-9 rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
                <input value={newPerson.email} onChange={(event) => setNewPerson((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" className="h-9 rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
                <input value={newPerson.phone} onChange={(event) => setNewPerson((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone" className="h-9 rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
                <input value={newPerson.jobTitle} onChange={(event) => setNewPerson((prev) => ({ ...prev, jobTitle: event.target.value }))} placeholder="Role / title" className="col-span-2 h-9 rounded border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded px-2 py-1 text-[11px] text-gray-500 hover:bg-white">Cancel</button>
                <button onClick={createPerson} className="rounded bg-gray-900 px-2 py-1 text-[11px] font-medium text-white">Create person</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCreating(true)} className="mt-3 rounded border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:border-gray-400">+ Create person under {company.displayName}</button>
          )}
        </div>
      </div>
    </section>
  );
}

function CategoryEditor({ entry, categories, onSave }: { entry: BlackbookEntry; categories: BlackbookConfigCategory[]; onSave: (patch: Partial<BlackbookEntry>) => Promise<void> }) {
  const [categoryId, setCategoryId] = useState(entry.categoryConfigId ?? "");
  const category = categories.find((item) => item.id === categoryId);

  async function toggleType(typeId: string) {
    const exists = entry.typeIds.includes(typeId);
    await onSave({ categoryConfigId: categoryId || null, typeIds: exists ? entry.typeIds.filter((id) => id !== typeId) : [...entry.typeIds, typeId] });
  }

  return (
    <div className="w-[280px] rounded-lg border border-gray-200 p-3">
      <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Category</label>
      <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); onSave({ categoryConfigId: event.target.value || null, typeIds: [] }).catch(console.error); }} className="mt-1 h-9 w-full rounded border border-gray-200 px-2 text-xs">
        <option value="">Uncategorised</option>
        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {category && (
        <div className="mt-3 flex flex-wrap gap-1">
          {category.types.map((type) => (
            <button key={type.id} onClick={() => toggleType(type.id)} className={`rounded-full border px-2 py-1 text-[10px] ${entry.typeIds.includes(type.id) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{type.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineSection({ title, icon, empty, children }: { title: string; icon: ReactNode; empty: string; children: ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{icon}{title}</h3>
      <div className="space-y-2">{hasChildren ? children : <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-400">{empty}</p>}</div>
    </section>
  );
}

function Card({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="truncate text-sm font-medium text-gray-900">{title}</p>
      <p className="mt-1 truncate text-xs text-gray-500">{meta}</p>
    </div>
  );
}
