import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X, Search, Mail, Briefcase, CalendarDays, Tag } from "lucide-react";
import { api } from "../../lib/api";

type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";

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
  category: BlackbookCategory;
  categoryConfigId: string | null;
  typeIds: string[];
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  dietaryNotes: string | null;
  dietaryFlags: string[];
  allergens: string[];
}

interface BlackbookCrmResponse {
  entry: BlackbookEntry & {
    contact?: { id: string; firstName: string; lastName?: string | null; company?: { name: string } | null } | null;
    categoryConfig?: BlackbookConfigCategory | null;
    optionCandidates: Array<{
      id: string;
      name: string;
      production: { id: string; title: string; jobCode: string | null; clientName: string | null; brand: string | null; status: string };
      group: { name: string; type: string };
      dateStatuses: Array<{ status: string; date: { date: string; label: string | null; dateType: string } }>;
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
    <div className="fixed inset-0 z-[950] bg-black/25 p-3">
      <div className="ml-auto flex h-full w-full max-w-[1120px] overflow-hidden rounded-xl bg-white shadow-2xl">
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
            <BlackbookDetail data={detail} categories={categories} onRefresh={() => selectedId && api.get<BlackbookCrmResponse>(`/api/options/blackbook/${selectedId}/crm`).then(setDetail).catch(console.error)} />
          )}
        </main>
      </div>
    </div>
  );
}

function BlackbookDetail({ data, categories, onRefresh }: { data: BlackbookCrmResponse; categories: BlackbookConfigCategory[]; onRefresh: () => void }) {
  const { entry } = data;
  const category = categories.find((item) => item.id === entry.categoryConfigId);
  const typeNames = category?.types.filter((type) => entry.typeIds.includes(type.id)).map((type) => type.name) ?? [];

  async function patch(patchData: Partial<BlackbookEntry>) {
    await api.patch(`/api/options/blackbook/${entry.id}`, patchData);
    onRefresh();
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: category?.color ?? "#d1d5db" }} />
            <span className="text-[11px] uppercase tracking-[0.08em] text-gray-400">{category?.name ?? entry.category.toLowerCase()}</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">{entry.displayName}</h1>
          <p className="mt-1 text-sm text-gray-500">{[entry.companyName, entry.email, entry.phone].filter(Boolean).join(" · ")}</p>
          {typeNames.length > 0 && <p className="mt-2 text-xs text-gray-500">{typeNames.join(" · ")}</p>}
        </div>
        <CategoryEditor entry={entry} categories={categories} onSave={patch} />
      </div>

      {(entry.dietaryNotes || entry.dietaryFlags.length || entry.allergens.length) && (
        <section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-amber-800">Dietaries</h3>
          <p className="text-sm text-amber-900">{[...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ")}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
            <Card key={candidate.id} title={`${candidate.group.name} · ${candidate.name}`} meta={`${candidate.production.jobCode ?? ""} ${candidate.production.title} · ${candidate.dateStatuses.map((status) => `${status.date.label ?? status.date.dateType}: ${status.status.toLowerCase().replace(/_/g, " ")}`).join(" · ")}`} />
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
      <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); void onSave({ categoryConfigId: event.target.value || null, typeIds: [] }); }} className="mt-1 h-9 w-full rounded border border-gray-200 px-2 text-xs">
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
