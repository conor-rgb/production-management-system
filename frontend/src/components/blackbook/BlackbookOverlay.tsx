import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { X, Search, Mail, Briefcase, CalendarDays, Tag, Users, UserPlus, Building2, MapPin, Plus, Link2, ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import { COUNTRY_OPTIONS, countryName } from "../../lib/countries";

type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";
type BlackbookLifecycleStatus = "TARGET" | "IN_TOUCH" | "CLIENT" | "PAST_CLIENT" | "SUPPLIER" | "PREFERRED_SUPPLIER" | "DO_NOT_USE" | "ARCHIVED";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type RequirementType = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";

interface BlackbookAddress {
  id: string;
  type: "WORK" | "BILLING" | "PERSONAL" | "CUSTOM";
  label: string | null;
  isDefaultBilling: boolean;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
}

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
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationType: string | null;
  notes: string | null;
  dietaryNotes: string | null;
  dietaryFlags: string[];
  allergens: string[];
}

interface PlaceSearchResult {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
  types: string[];
}

interface NormalizedPlace {
  placeId: string;
  placeName: string | null;
  formattedAddress: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
}

interface ProductionSummary {
  id: string;
  title: string;
  jobCode: string | null;
  clientName: string | null;
  brand: string | null;
  status: string;
}

interface OptionGroupSummary {
  id: string;
  name: string;
  type: RequirementType;
}

interface MatrixSummary {
  production: Pick<ProductionSummary, "id" | "title" | "jobCode" | "clientName" | "brand">;
  groups: OptionGroupSummary[];
}

interface BlackbookCrmResponse {
  entry: BlackbookEntry & {
    contact?: { id: string; firstName: string; lastName?: string | null; company?: { name: string } | null } | null;
    companyEntry?: { id: string; displayName: string; email: string | null; companyName: string | null } | null;
    people?: BlackbookEntry[];
    addresses?: BlackbookAddress[];
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

export default function BlackbookOverlay({ initialEntryId, onClose, compact = false }: { initialEntryId?: string | null; onClose: () => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<BlackbookEntry[]>([]);
  const [categories, setCategories] = useState<BlackbookConfigCategory[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntryId ?? null);
  const [detail, setDetail] = useState<BlackbookCrmResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<BlackbookConfigCategory[]>("/api/settings/blackbook/categories").then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ q: query, limit: "30" });
    if (categoryFilterId) params.set("categoryConfigId", categoryFilterId);
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`).then((data) => {
      setEntries(data);
      if (!selectedId && data[0]) setSelectedId(data[0].id);
    }).catch(console.error);
  }, [categoryFilterId, query, selectedId]);

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
      <div className={`ml-auto flex h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl ${compact ? "max-w-[1040px]" : "max-w-[1540px]"}`} style={{ animation: "blackbookPanelSlideIn 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {!compact && (
          <aside className="flex w-[210px] shrink-0 flex-col border-r border-gray-200 bg-[#f5f5f3]">
            <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
              <h2 className="text-sm font-semibold text-gray-900">Blackbook</h2>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <button onClick={() => setCategoryFilterId(null)} className={`mb-1 flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs ${!categoryFilterId ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-500 hover:bg-white"}`}>
                All records <span>{entries.length}</span>
              </button>
              {categories.map((category) => (
                <button key={category.id} onClick={() => setCategoryFilterId(category.id)} className={`mb-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs ${categoryFilterId === category.id ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-500 hover:bg-white"}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
                  <span className="truncate">{category.name}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
        {!compact && <aside className="flex w-[320px] shrink-0 flex-col border-r border-gray-200 bg-[#fbfbfa]">
          <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
            <h2 className="text-sm font-semibold text-gray-900">Results</h2>
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
        </aside>}
        <main className="min-w-0 flex-1 overflow-auto">
          {compact && (
            <div className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
              <h2 className="truncate text-sm font-semibold text-gray-900">{selected?.displayName ?? "Blackbook profile"}</h2>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100"><X size={16} /></button>
            </div>
          )}
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
  const timelineItems = buildTimelineItems(data);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(320px,390px)_minmax(460px,1fr)] divide-x divide-gray-200 bg-white">
      <div className="min-h-0 overflow-auto bg-white">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: category?.color ?? "#d1d5db" }} />
                <span className="truncate text-[10px] uppercase tracking-[0.08em] text-gray-400">{category?.name ?? entry.category.toLowerCase()}</span>
              </div>
              <h1 className="truncate text-lg font-semibold text-gray-900">{entry.displayName}</h1>
              <p className="mt-0.5 truncate text-xs text-gray-500">{[entry.companyEntry?.displayName ?? entry.companyName, entry.email, entry.phone].filter(Boolean).join(" · ") || entry.entryType.toLowerCase()}</p>
            </div>
            <SaveIndicator status={saveStatus} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{entry.lifecycleStatus.toLowerCase().replace(/_/g, " ")}</span>
            {typeNames.slice(0, 3).map((name) => <span key={name} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{name}</span>)}
            {typeNames.length > 3 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">+{typeNames.length - 3}</span>}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <MetricPill label={entry.entryType === "COMPANY" ? "People" : "Co"} value={entry.entryType === "COMPANY" ? entry.people?.length ?? 0 : entry.companyEntry ? 1 : 0} />
            <MetricPill label="Mail" value={emailCount} />
            <MetricPill label="Options" value={optionCount} />
            <MetricPill label="Jobs" value={productionCount + opportunityCount} />
          </div>
        </div>

        <div className="space-y-1 p-3">
          <DisclosureSection title="Profile" summary={[entry.lifecycleStatus.toLowerCase().replace(/_/g, " "), category?.name].filter(Boolean).join(" · ")} defaultOpen>
            <div className="grid gap-2">
              <InlineField label="Name" value={entry.displayName} onSave={(displayName) => patch({ displayName })} compact />
              <div className="grid grid-cols-2 gap-2">
                <InlineField label="Email" value={entry.email ?? ""} onSave={(email) => patch({ email })} compact />
                <InlineField label="Phone" value={entry.phone ?? ""} onSave={(phone) => patch({ phone })} compact />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LifecycleEditor value={entry.lifecycleStatus} onChange={(lifecycleStatus) => patch({ lifecycleStatus })} />
                <CategoryEditor entry={entry} categories={categories} onSave={patch} />
              </div>
            </div>
          </DisclosureSection>

          <DisclosureSection title="Links" summary={entry.website || "No links"}>
            <InlineField label="Website" value={entry.website ?? ""} onSave={(website) => patch({ website })} compact />
          </DisclosureSection>

          <DisclosureSection title="Address" summary={addressLines(entry).join(" · ") || `${entry.addresses?.length ?? 0} saved`}>
            <BlackbookAddressManager entry={entry} onPatchEntry={patch} onRefresh={onRefresh} />
          </DisclosureSection>

          <DisclosureSection title="Notes" summary={entry.notes ? `${entry.notes.slice(0, 60)}${entry.notes.length > 60 ? "..." : ""}` : "No notes"}>
            <NotesEditor value={entry.notes ?? ""} onSave={(notes) => patch({ notes })} placeholder={entry.entryType === "COMPANY" ? "Company context, preferences, billing quirks..." : "Relationship notes, preferences, context..."} />
          </DisclosureSection>

          {(entry.dietaryNotes || entry.dietaryFlags.length || entry.allergens.length) && (
            <DisclosureSection title="Dietaries" summary={[...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ")}>
              <p className="text-xs leading-5 text-amber-800">{[...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ")}</p>
            </DisclosureSection>
          )}

          <DisclosureSection title="Add to job options" summary="Pick job, then role/sheet">
            <BlackbookOptionAdder entry={entry} onRefresh={onRefresh} />
          </DisclosureSection>

          <DisclosureSection title={entry.entryType === "COMPANY" ? "People" : "Company"} summary={entry.entryType === "COMPANY" ? `${entry.people?.length ?? 0} people` : entry.companyEntry?.displayName ?? "No company"}>
            {entry.entryType === "COMPANY" ? (
              <CompanyPeopleManager company={entry} people={entry.people ?? []} onOpenEntry={onOpenEntry} onRefresh={onRefresh} />
            ) : (
              <PersonCompanyManager entry={entry} onOpenEntry={onOpenEntry} onRefresh={onRefresh} />
            )}
          </DisclosureSection>
        </div>
      </div>

      <aside className="min-h-0 overflow-auto bg-[#fbfbfa] p-6">
        <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-5 flex min-h-12 items-center justify-between border-b border-gray-200 bg-[#fbfbfa] px-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Activity timeline</h3>
            <p className="text-[11px] text-gray-400">Emails, options, opportunities and productions linked to this record.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-500">New note</button>
            <button className="rounded border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-500">Follow up</button>
          </div>
        </div>
        <UnifiedTimeline items={timelineItems} />
      </aside>
    </div>
  );
}

function LifecycleEditor({ value, onChange }: { value: BlackbookLifecycleStatus; onChange: (value: BlackbookLifecycleStatus) => Promise<void> }) {
  const options: BlackbookLifecycleStatus[] = ["TARGET", "IN_TOUCH", "CLIENT", "PAST_CLIENT", "SUPPLIER", "PREFERRED_SUPPLIER", "DO_NOT_USE", "ARCHIVED"];
  return (
    <div>
      <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Relationship</label>
      <select value={value} onChange={(event) => { onChange(event.target.value as BlackbookLifecycleStatus).catch(console.error); }} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-gray-500">
        {options.map((option) => <option key={option} value={option}>{option.toLowerCase().replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return <div className="h-4 w-12" />;
  const label = status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save failed";
  const className = status === "saving"
    ? "text-gray-400"
    : status === "saved"
      ? "text-emerald-600"
      : "text-red-600";
  return <div className={`h-4 shrink-0 text-right text-[10px] font-medium ${className}`}>{label}</div>;
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 bg-[#fbfbfa] px-2 py-1">
      <p className="text-[9px] font-medium uppercase tracking-[0.05em] text-gray-400">{label}</p>
      <p className="text-xs font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}

function DisclosureSection({ title, summary, children, defaultOpen = false }: { title: string; summary?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <button onClick={() => setOpen((value) => !value)} className="flex min-h-10 w-full items-center gap-2 px-3 text-left hover:bg-[#fbfbfa]">
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-right text-[11px] text-gray-400">{summary}</span>}
      </button>
      {open && <div className="border-t border-gray-100 p-3">{children}</div>}
    </section>
  );
}

type TimelineItem = {
  id: string;
  date: Date;
  type: "email" | "option" | "production" | "opportunity";
  title: string;
  meta: string;
  body?: string | null;
  href?: string;
};

function buildTimelineItems(data: BlackbookCrmResponse): TimelineItem[] {
  const optionItems = data.entry.optionCandidates.map((candidate) => ({
    id: `option-${candidate.id}`,
    date: candidate.dateStatuses[0]?.date.date ? new Date(candidate.dateStatuses[0].date.date) : new Date(),
    type: "option" as const,
    title: `${candidate.group.name} · ${candidate.name}`,
    meta: [
      candidate.production.jobCode,
      candidate.production.title,
      candidate.production.brand,
      candidate.dateStatuses.map((status) => `${status.date.label ?? status.date.dateType}: ${status.status.toLowerCase().replace(/_/g, " ")}`).join(" · "),
    ].filter(Boolean).join(" · "),
  }));

  const productionItems = data.productions.map((item) => ({
    id: `production-${item.id}`,
    date: new Date(),
    type: "production" as const,
    title: `${item.production.jobCode ?? ""} ${item.production.title}`.trim(),
    meta: [item.production.clientName, item.production.brand, item.production.status].filter(Boolean).join(" · "),
    href: `/productions?production=${item.production.id}`,
  }));

  const opportunityItems = data.opportunities.map((item) => ({
    id: `opportunity-${item.id}`,
    date: new Date(item.createdAt),
    type: "opportunity" as const,
    title: item.title,
    meta: [item.clientName, item.brand, item.stage].filter(Boolean).join(" · "),
    href: `/opportunities?opportunity=${item.id}`,
  }));

  const emailItems = data.emailMessages.map((message) => ({
    id: `email-${message.id}`,
    date: new Date(message.sentAt),
    type: "email" as const,
    title: message.subject,
    meta: `${message.isFromMe ? "To" : "From"} ${message.fromName || message.fromAddress}`,
    body: message.snippet,
    href: `/email?thread=${message.threadId}&message=${message.id}`,
  }));

  return [...emailItems, ...optionItems, ...productionItems, ...opportunityItems]
    .filter((item) => !Number.isNaN(item.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

function timelineIcon(type: TimelineItem["type"]): ReactNode {
  if (type === "email") return <Mail size={14} />;
  if (type === "option") return <Tag size={14} />;
  if (type === "production") return <Briefcase size={14} />;
  return <CalendarDays size={14} />;
}

function timelineLabel(date: Date): string {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startItem = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const delta = startToday - startItem;
  if (delta === 0) return "Today";
  if (delta > 0 && delta < 7 * 86400000) return "Last seven days";
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString("en-GB", { month: "long" });
  return String(date.getFullYear());
}

function UnifiedTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-lg bg-white p-4 text-sm text-gray-400">No activity yet.</p>;
  }

  let lastLabel = "";
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const group = timelineLabel(item.date);
        const showGroup = group !== lastLabel;
        lastLabel = group;
        const content = (
          <div className="flex gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-gray-200 hover:bg-white">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-white text-gray-400 ring-1 ring-gray-200">{timelineIcon(item.type)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                <span className="shrink-0 text-[10px] tabular-nums text-gray-400">{item.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-gray-500">{item.meta}</p>
              {item.body && <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">{item.body}</p>}
            </div>
          </div>
        );
        return (
          <div key={item.id}>
            {showGroup && <h4 className="pb-1 pt-4 text-xs font-semibold text-blue-600 first:pt-0">{group}</h4>}
            {item.href ? <a href={item.href} className="block">{content}</a> : content}
          </div>
        );
      })}
    </div>
  );
}

function addressLines(address: Pick<BlackbookAddress, "addressLine1" | "addressLine2" | "city" | "postcode" | "region" | "country">): string[] {
  const cityLine = [address.city, address.postcode].filter(Boolean).join(", ");
  const regionLine = [address.region, countryName(address.country)].filter(Boolean).join(", ");
  return [address.addressLine1, address.addressLine2, cityLine, regionLine].filter((line): line is string => Boolean(line));
}

function addressTypeLabel(type: BlackbookAddress["type"]): string {
  if (type === "WORK") return "Work";
  if (type === "BILLING") return "Billing";
  if (type === "PERSONAL") return "Personal";
  return "Custom";
}

function requirementTypeForEntry(entry: BlackbookCrmResponse["entry"]): RequirementType {
  if (entry.category === "CREW") return "CREW";
  if (entry.category === "SERVICE") return "SERVICE";
  if (entry.category === "LOCATION") return "LOCATION";
  if (entry.category === "EQUIPMENT") return "EQUIPMENT";
  if (entry.category === "TALENT") return "TALENT";
  if (entry.category === "TRANSPORT") return "TRANSPORT";
  if (entry.category === "POST") return "POST";
  return "OTHER";
}

function BlackbookAddressManager({ entry, onPatchEntry, onRefresh }: {
  entry: BlackbookCrmResponse["entry"];
  onPatchEntry: (patch: Partial<BlackbookEntry>) => Promise<void>;
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<"search" | "manual" | null>(null);
  const [addressType, setAddressType] = useState<BlackbookAddress["type"]>("WORK");
  const [isDefaultBilling, setIsDefaultBilling] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [manual, setManual] = useState({
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postcode: "",
    country: "",
  });

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), sessionToken: entry.id });
      api.get<{ results: PlaceSearchResult[] }>(`/api/options/places/search?${params.toString()}`)
        .then((data) => setResults(data.results))
        .catch(console.error);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [entry.id, query]);

  async function createFromPlace(result: PlaceSearchResult) {
    const place = await api.post<NormalizedPlace>("/api/options/places/details", { placeId: result.placeId, sessionToken: entry.id });
    await api.post<BlackbookAddress>(`/api/options/blackbook/${entry.id}/addresses`, {
      type: addressType,
      isDefaultBilling,
      source: "GOOGLE_PLACES",
      placeId: place.placeId,
      placeName: place.placeName,
      formattedAddress: place.formattedAddress,
      addressLine1: place.addressLine1,
      addressLine2: place.addressLine2,
      city: place.city,
      region: place.region,
      postcode: place.postcode,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      website: place.website,
      phone: place.phone,
    });
    if (!entry.addressLine1) {
      await onPatchEntry({
        addressLine1: place.addressLine1,
        addressLine2: place.addressLine2,
        city: place.city,
        region: place.region,
        postcode: place.postcode,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } else {
      onRefresh();
    }
    setQuery("");
    setResults([]);
    setMode(null);
  }

  async function saveManual() {
    await api.post<BlackbookAddress>(`/api/options/blackbook/${entry.id}/addresses`, {
      type: addressType,
      isDefaultBilling,
      source: "MANUAL",
      ...manual,
    });
    if (!entry.addressLine1) await onPatchEntry(manual);
    else onRefresh();
    setManual({ addressLine1: "", addressLine2: "", city: "", region: "", postcode: "", country: "" });
    setMode(null);
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {entry.addresses?.length ? entry.addresses.map((address) => (
          <div key={address.id} className="rounded-md bg-[#fbfbfa] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-gray-800">{address.label || address.placeName || addressTypeLabel(address.type)}</span>
              <span className="text-[10px] text-gray-400">{address.isDefaultBilling ? "billing" : addressTypeLabel(address.type)}</span>
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-gray-500">
              {addressLines(address).map((line) => <p key={line}>{line}</p>)}
            </div>
          </div>
        )) : (
          <p className="rounded-md bg-[#fbfbfa] px-2 py-2 text-[11px] text-gray-400">No saved addresses yet.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <select value={addressType} onChange={(event) => setAddressType(event.target.value as BlackbookAddress["type"])} className="h-8 rounded border border-gray-200 bg-white px-2 text-[11px] text-gray-700">
          {(["WORK", "BILLING", "PERSONAL", "CUSTOM"] as BlackbookAddress["type"][]).map((type) => <option key={type} value={type}>{addressTypeLabel(type)}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-gray-500">
          <input type="checkbox" checked={isDefaultBilling} onChange={(event) => setIsDefaultBilling(event.target.checked)} />
          default billing
        </label>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode(mode === "search" ? null : "search")} className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 px-2 text-[11px] text-gray-600 hover:border-gray-400"><MapPin size={13} /> Find address</button>
        <button onClick={() => setMode(mode === "manual" ? null : "manual")} className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 px-2 text-[11px] text-gray-600 hover:border-gray-400"><Plus size={13} /> Manual</button>
      </div>

      {mode === "search" && (
        <div className="rounded-md border border-gray-200 bg-white p-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Claridge's, Big Sky Studios, Hilton Park Lane..." className="h-8 w-full rounded border border-gray-200 px-2 text-xs outline-none focus:border-gray-500" />
          {results.length > 0 && (
            <div className="mt-2 overflow-hidden rounded border border-gray-100">
              {results.map((result) => (
                <button key={result.placeId} onClick={() => { createFromPlace(result).catch(console.error); }} className="block w-full border-b border-gray-100 px-2 py-2 text-left last:border-b-0 hover:bg-gray-50">
                  <span className="block text-xs font-medium text-gray-900">{result.mainText}</span>
                  <span className="block truncate text-[11px] text-gray-400">{result.secondaryText || result.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "manual" && (
        <div className="rounded-md border border-gray-200 bg-white p-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={manual.addressLine1} onChange={(event) => setManual((prev) => ({ ...prev, addressLine1: event.target.value }))} placeholder="Address line 1" className="col-span-2 h-8 rounded border border-gray-200 px-2 text-xs" />
            <input value={manual.addressLine2} onChange={(event) => setManual((prev) => ({ ...prev, addressLine2: event.target.value }))} placeholder="Address line 2" className="col-span-2 h-8 rounded border border-gray-200 px-2 text-xs" />
            <input value={manual.city} onChange={(event) => setManual((prev) => ({ ...prev, city: event.target.value }))} placeholder="City" className="h-8 rounded border border-gray-200 px-2 text-xs" />
            <input value={manual.postcode} onChange={(event) => setManual((prev) => ({ ...prev, postcode: event.target.value }))} placeholder="Postcode" className="h-8 rounded border border-gray-200 px-2 text-xs" />
            <input value={manual.region} onChange={(event) => setManual((prev) => ({ ...prev, region: event.target.value }))} placeholder="Region" className="h-8 rounded border border-gray-200 px-2 text-xs" />
            <select value={manual.country} onChange={(event) => setManual((prev) => ({ ...prev, country: event.target.value }))} className="h-8 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700">
              <option value="">Country...</option>
              {COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
          </div>
          <div className="mt-2 flex justify-end">
            <button onClick={() => { saveManual().catch(console.error); }} className="rounded bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white">Save address</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlackbookOptionAdder({ entry, onRefresh }: { entry: BlackbookCrmResponse["entry"]; onRefresh: () => void }) {
  const [productionQuery, setProductionQuery] = useState("");
  const [productions, setProductions] = useState<ProductionSummary[]>([]);
  const [productionId, setProductionId] = useState("");
  const [matrix, setMatrix] = useState<MatrixSummary | null>(null);
  const [groupId, setGroupId] = useState("");
  const [newRole, setNewRole] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [groupType, setGroupType] = useState<RequirementType>(requirementTypeForEntry(entry));
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ includeWrapped: "true" });
      if (productionQuery.trim()) params.set("search", productionQuery.trim());
      api.get<ProductionSummary[]>(`/api/productions?${params.toString()}`)
        .then((items) => setProductions(items.slice(0, 8)))
        .catch(console.error);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [productionQuery]);

  useEffect(() => {
    if (!productionId) {
      setMatrix(null);
      return;
    }
    api.get<MatrixSummary>(`/api/options/production/${productionId}/matrix`).then(setMatrix).catch(console.error);
  }, [productionId]);

  async function addToOptions() {
    if (!productionId) return;
    setStatus("saving");
    try {
      await api.post(`/api/options/blackbook/${entry.id}/add-to-options`, {
        productionId,
        groupId: groupId || undefined,
        groupName: groupId ? undefined : newRole,
        groupType,
        quantity: Number(quantity) || 1,
      });
      setStatus("saved");
      onRefresh();
      window.setTimeout(() => setStatus("idle"), 1400);
    } catch (error) {
      console.error(error);
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2">
      <input value={productionQuery} onChange={(event) => setProductionQuery(event.target.value)} placeholder="Search jobs..." className="h-8 w-full rounded border border-gray-200 px-2 text-xs outline-none focus:border-gray-500" />
      {productions.length > 0 && (
        <div className="max-h-32 overflow-auto rounded border border-gray-100">
          {productions.map((production) => (
            <button key={production.id} onClick={() => { setProductionId(production.id); setProductionQuery(`${production.jobCode ?? ""} ${production.brand ?? production.clientName ?? production.title}`.trim()); }} className={`block w-full border-b border-gray-100 px-2 py-1.5 text-left text-[11px] last:border-b-0 hover:bg-gray-50 ${productionId === production.id ? "bg-gray-900 text-white" : "text-gray-700"}`}>
              <span className="block truncate font-medium">{production.jobCode ?? "No code"} · {production.brand ?? production.clientName ?? production.title}</span>
              <span className="block truncate opacity-70">{production.status.toLowerCase().replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      )}
      {matrix && (
        <div className="rounded-md bg-[#fbfbfa] p-2">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-400">Add to current role</label>
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs">
            <option value="">Create new role...</option>
            {matrix.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          {!groupId && (
            <div className="mt-2 grid grid-cols-[1fr_88px_54px] gap-2">
              <input value={newRole} onChange={(event) => setNewRole(event.target.value)} placeholder="Role / sheet name" className="h-8 rounded border border-gray-200 px-2 text-xs" />
              <select value={groupType} onChange={(event) => setGroupType(event.target.value as RequirementType)} className="h-8 rounded border border-gray-200 bg-white px-2 text-xs">
                {(["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"] as RequirementType[]).map((type) => <option key={type} value={type}>{type.toLowerCase()}</option>)}
              </select>
              <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="1" className="h-8 rounded border border-gray-200 px-2 text-xs" />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-[10px] ${status === "error" ? "text-red-600" : status === "saved" ? "text-emerald-600" : "text-gray-400"}`}>
              {status === "saving" ? "Adding..." : status === "saved" ? "Added" : status === "error" ? "Could not add" : "Creates a linked option candidate"}
            </span>
            <button onClick={() => { addToOptions().catch(console.error); }} disabled={!productionId || (!groupId && !newRole.trim())} className="inline-flex h-8 items-center gap-1 rounded bg-gray-900 px-3 text-[11px] font-medium text-white disabled:bg-gray-200 disabled:text-gray-400">
              <Link2 size={13} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineField({ label, value, onSave, compact = false }: { label: string; value: string; onSave: (value: string) => Promise<void>; compact?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  async function save() {
    if (draft !== value) await onSave(draft);
  }

  return (
    <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">
      {label}
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { save().catch(console.error); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(value);
        }}
        className={`${compact ? "mt-0.5 h-8" : "mt-1 h-9"} w-full rounded border border-gray-200 px-2 text-xs normal-case tracking-normal text-gray-800 outline-none focus:border-gray-500`}
      />
    </label>
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
    <div>
      <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Category</label>
      <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); onSave({ categoryConfigId: event.target.value || null, typeIds: [] }).catch(console.error); }} className="mt-1 h-8 w-full rounded border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none focus:border-gray-500">
        <option value="">Uncategorised</option>
        {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {category && (
        <div className="mt-2 flex flex-wrap gap-1">
          {category.types.map((type) => (
            <button key={type.id} onClick={() => toggleType(type.id)} className={`rounded-full border px-2 py-1 text-[10px] ${entry.typeIds.includes(type.id) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>{type.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}
