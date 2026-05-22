import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import BlackbookOverlay from "../components/blackbook/BlackbookOverlay";
import { Building2, ListPlus, Plus, Search, Trash2, Users } from "lucide-react";

type BlackbookLifecycleStatus = "TARGET" | "IN_TOUCH" | "CLIENT" | "PAST_CLIENT" | "SUPPLIER" | "PREFERRED_SUPPLIER" | "DO_NOT_USE" | "ARCHIVED";
type BlackbookEntryType = "PERSON" | "COMPANY" | "LOCATION" | "TALENT" | "SERVICE";
type BlackbookOutreachStatus = "NOT_CONTACTED" | "CONTACTED" | "REPLIED" | "FOLLOW_UP" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED";
type ViewKey = "ALL" | "TARGETS" | "IN_TOUCH" | "CLIENTS" | "SUPPLIERS" | "COMPANIES";

interface BlackbookConfigCategory {
  id: string;
  name: string;
  broadType: string;
  color: string;
  types: Array<{ id: string; name: string; slug: string }>;
}

interface BlackbookTargetList {
  id: string;
  name: string;
  description: string | null;
  entries: BlackbookTargetListEntry[];
}

interface BlackbookTargetListEntry {
  id: string;
  status: BlackbookOutreachStatus;
  notes: string | null;
  nextFollowUpAt: string | null;
  entry: BlackbookEntry;
}

interface BlackbookEntry {
  id: string;
  entryType: BlackbookEntryType;
  lifecycleStatus: BlackbookLifecycleStatus;
  categoryConfigId: string | null;
  typeIds: string[];
  displayName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  dietaryNotes: string | null;
  dietaryFlags: string[];
  allergens: string[];
  companyEntry?: { id: string; displayName: string } | null;
  categoryConfig?: BlackbookConfigCategory | null;
  targetLists?: Array<{ id: string; status: string; list: { id: string; name: string } }>;
}

const VIEWS: Array<{ key: ViewKey; label: string; description: string }> = [
  { key: "ALL", label: "All", description: "Every Blackbook record" },
  { key: "TARGETS", label: "Targets", description: "Outreach prospects" },
  { key: "IN_TOUCH", label: "In touch", description: "Conversation, no job yet" },
  { key: "CLIENTS", label: "Clients", description: "Worked with or commissioning" },
  { key: "SUPPLIERS", label: "Suppliers", description: "Crew, services, locations" },
  { key: "COMPANIES", label: "Companies", description: "Company-level comms" },
];

const STATUS_LABELS: Record<BlackbookLifecycleStatus, string> = {
  TARGET: "Target",
  IN_TOUCH: "In touch",
  CLIENT: "Client",
  PAST_CLIENT: "Past client",
  SUPPLIER: "Supplier",
  PREFERRED_SUPPLIER: "Preferred supplier",
  DO_NOT_USE: "Do not use",
  ARCHIVED: "Archived",
};

function statusClass(status: BlackbookLifecycleStatus): string {
  if (status === "TARGET") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "IN_TOUCH") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "CLIENT") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PAST_CLIENT") return "border-gray-200 bg-gray-50 text-gray-600";
  if (status === "SUPPLIER") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "PREFERRED_SUPPLIER") return "border-lime-200 bg-lime-50 text-lime-700";
  if (status === "DO_NOT_USE") return "border-red-200 bg-red-50 text-red-600";
  return "border-gray-200 bg-gray-50 text-gray-400";
}

const OUTREACH_STATUS_LABELS: Record<BlackbookOutreachStatus, string> = {
  NOT_CONTACTED: "Not contacted",
  CONTACTED: "Contacted",
  REPLIED: "Replied",
  FOLLOW_UP: "Follow-up",
  NOT_INTERESTED: "Not interested",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

function outreachClass(status: BlackbookOutreachStatus): string {
  if (status === "NOT_CONTACTED") return "border-gray-200 bg-gray-50 text-gray-500";
  if (status === "CONTACTED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "REPLIED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FOLLOW_UP") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "NOT_INTERESTED") return "border-red-200 bg-red-50 text-red-600";
  if (status === "CONVERTED") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-gray-200 bg-gray-50 text-gray-400";
}

export default function Contacts() {
  const [view, setView] = useState<ViewKey>("ALL");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<BlackbookEntry[]>([]);
  const [categories, setCategories] = useState<BlackbookConfigCategory[]>([]);
  const [lists, setLists] = useState<BlackbookTargetList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newEntryName, setNewEntryName] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [listMatches, setListMatches] = useState<BlackbookEntry[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const selectedList = useMemo(() => lists.find((list) => list.id === selectedListId) ?? null, [lists, selectedListId]);
  const selectedListEntryMap = useMemo(() => new Map((selectedList?.entries ?? []).map((item) => [item.entry.id, item])), [selectedList]);
  const selectedCategory = useMemo(() => categories.find((category) => category.id === selectedCategoryId) ?? null, [categories, selectedCategoryId]);

  const loadSettings = useCallback(async () => {
    const [categoryData, listData] = await Promise.all([
      api.get<BlackbookConfigCategory[]>("/api/settings/blackbook/categories"),
      api.get<BlackbookTargetList[]>("/api/options/blackbook/lists"),
    ]);
    setCategories(categoryData);
    setLists(listData);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, limit: "50" });
      if (selectedListId) params.set("listId", selectedListId);
      if (view === "TARGETS") params.set("lifecycleStatus", "TARGET");
      if (view === "IN_TOUCH") params.set("lifecycleStatus", "IN_TOUCH");
      if (view === "CLIENTS") params.set("lifecycleStatus", "CLIENT");
      if (view === "SUPPLIERS") params.set("category", "SERVICE");
      if (view === "COMPANIES") params.set("entryType", "COMPANY");
      if (selectedCategoryId) params.set("categoryConfigId", selectedCategoryId);
      if (selectedTypeId) params.set("typeId", selectedTypeId);
      setEntries(await api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`));
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategoryId, selectedListId, selectedTypeId, view]);

  useEffect(() => { loadSettings().catch(console.error); }, [loadSettings]);
  useEffect(() => { loadEntries().catch(console.error); }, [loadEntries]);

  const counts = useMemo(() => ({
    all: entries.length,
    targets: entries.filter((entry) => entry.lifecycleStatus === "TARGET").length,
    clients: entries.filter((entry) => entry.lifecycleStatus === "CLIENT").length,
    suppliers: entries.filter((entry) => entry.lifecycleStatus === "SUPPLIER" || entry.lifecycleStatus === "PREFERRED_SUPPLIER").length,
  }), [entries]);

  async function refreshAll() {
    await Promise.all([loadSettings(), loadEntries()]);
  }

  async function addList() {
    if (!newListName.trim()) return;
    await api.post("/api/options/blackbook/lists", { name: newListName.trim() });
    setNewListName("");
    await loadSettings();
  }

  async function addEntry() {
    if (!newEntryName.trim()) return;
    const lifecycleStatus: BlackbookLifecycleStatus = view === "TARGETS" ? "TARGET" : view === "CLIENTS" ? "CLIENT" : view === "SUPPLIERS" ? "SUPPLIER" : "IN_TOUCH";
    const entryType: BlackbookEntryType = view === "COMPANIES" ? "COMPANY" : "PERSON";
    const created = await api.post<BlackbookEntry>("/api/options/blackbook", {
      displayName: newEntryName.trim(),
      lifecycleStatus,
      entryType,
      category: view === "SUPPLIERS" ? "SERVICE" : "OTHER",
    });
    if (selectedListId) await api.post(`/api/options/blackbook/lists/${selectedListId}/entries`, { entryId: created.id });
    setNewEntryName("");
    setSelectedEntryId(created.id);
    await refreshAll();
  }

  useEffect(() => {
    if (!selectedListId || !listSearch.trim()) {
      setListMatches([]);
      return;
    }
    const params = new URLSearchParams({ q: listSearch, limit: "8" });
    api.get<BlackbookEntry[]>(`/api/options/blackbook?${params.toString()}`)
      .then((data) => setListMatches(data.filter((entry) => !selectedListEntryMap.has(entry.id))))
      .catch(console.error);
  }, [listSearch, selectedListEntryMap, selectedListId]);

  async function addExistingToList(entryId: string) {
    if (!selectedListId) return;
    await api.post(`/api/options/blackbook/lists/${selectedListId}/entries`, { entryId });
    setListSearch("");
    setListMatches([]);
    await refreshAll();
  }

  async function updateListEntry(itemId: string, patch: Partial<Pick<BlackbookTargetListEntry, "status" | "notes" | "nextFollowUpAt">>) {
    await api.patch(`/api/options/blackbook/list-entries/${itemId}`, patch);
    await refreshAll();
  }

  async function removeListEntry(itemId: string) {
    await api.delete(`/api/options/blackbook/list-entries/${itemId}`);
    await refreshAll();
  }

  async function archiveSelectedList() {
    if (!selectedList) return;
    await api.patch(`/api/options/blackbook/lists/${selectedList.id}`, { isArchived: true });
    setSelectedListId(null);
    await refreshAll();
  }

  function clearFilters() {
    setSelectedCategoryId(null);
    setSelectedTypeId(null);
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-gray-200 bg-[#fbfbfa]">
        <div className="border-b border-gray-200 p-4">
          <h1 className="text-lg font-semibold text-gray-900">Blackbook CRM</h1>
          <p className="mt-1 text-xs text-gray-500">Targets, clients, suppliers, companies, and activity in one place.</p>
        </div>
        <div className="border-b border-gray-200 p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, companies, email..." className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-gray-500" />
          </div>
        </div>
        <nav className="space-y-1 border-b border-gray-200 p-2">
          {VIEWS.map((item) => (
            <button key={item.key} onClick={() => { setView(item.key); setSelectedListId(null); clearFilters(); }} className={`w-full rounded-lg px-3 py-2 text-left ${view === item.key && !selectedListId ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-white"}`}>
              <div className="text-sm font-medium">{item.label}</div>
              <div className={`text-[11px] ${view === item.key && !selectedListId ? "text-white/60" : "text-gray-400"}`}>{item.description}</div>
            </button>
          ))}
        </nav>
        <div className="border-b border-gray-200 p-2">
          <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            <span>Categories</span>
            {(selectedCategoryId || selectedTypeId) && <button onClick={clearFilters} className="text-[10px] font-medium normal-case tracking-normal text-gray-500 hover:text-gray-900">Clear</button>}
          </div>
          <div className="space-y-1">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => { setSelectedCategoryId(category.id); setSelectedTypeId(null); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${selectedCategoryId === category.id ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white"}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                <span className="text-[10px] text-gray-400">{category.types.length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400"><ListPlus size={13} /> Target lists</div>
          {lists.map((list) => (
            <button key={list.id} onClick={() => setSelectedListId(list.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm ${selectedListId === list.id ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600 hover:bg-white"}`}>
              {list.name}
              <span className="ml-2 text-[11px] text-gray-400">{list.entries.length}</span>
            </button>
          ))}
          <div className="mt-3 flex gap-1 px-1">
            <input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="New list" className="h-8 min-w-0 flex-1 rounded border border-gray-200 px-2 text-xs outline-none" />
            <button onClick={addList} className="grid h-8 w-8 place-items-center rounded bg-gray-900 text-white"><Plus size={14} /></button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-16 items-center justify-between border-b border-gray-200 px-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{selectedList ? selectedList.name : VIEWS.find((item) => item.key === view)?.label}</h2>
            <p className="text-xs text-gray-400">{counts.all} shown · {counts.targets} targets · {counts.clients} clients · {counts.suppliers} suppliers{selectedCategory ? ` · ${selectedCategory.name}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <input value={newEntryName} onChange={(event) => setNewEntryName(event.target.value)} placeholder={view === "COMPANIES" ? "New company" : "New person / supplier"} className="h-9 w-52 rounded-lg border border-gray-200 px-3 text-xs outline-none focus:border-gray-500" />
            <button onClick={addEntry} className="inline-flex h-9 items-center gap-2 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white"><Plus size={14} /> Add</button>
          </div>
        </div>
        {selectedCategory && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-100 px-5 py-2">
            <button
              onClick={() => setSelectedTypeId(null)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${selectedTypeId ? "border-gray-200 text-gray-500 hover:bg-gray-50" : "border-gray-900 bg-gray-900 text-white"}`}
            >
              All {selectedCategory.name}
            </button>
            {selectedCategory.types.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedTypeId(type.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${selectedTypeId === type.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
              >
                {type.name}
              </button>
            ))}
          </div>
        )}
        {selectedList && (
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-[#fbfbfa] px-5 py-3">
            <div className="relative w-[340px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="Add existing person/company to this list..." className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-gray-500" />
              {listMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {listMatches.map((entry) => (
                    <button key={entry.id} onClick={() => addExistingToList(entry.id)} className="block w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50">
                      <p className="text-xs font-medium text-gray-900">{entry.displayName}</p>
                      <p className="text-[11px] text-gray-400">{[entry.companyEntry?.displayName ?? entry.companyName, entry.email, entry.phone].filter(Boolean).join(" · ") || STATUS_LABELS[entry.lifecycleStatus]}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{selectedList.entries.length} entries</span>
              <button onClick={archiveSelectedList} className="rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:border-red-200 hover:text-red-600">Archive list</button>
            </div>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-gray-400">Loading Blackbook...</div>
          ) : entries.length === 0 ? (
            <div className="grid h-full place-items-center p-8 text-center">
              <div>
                <Users className="mx-auto mb-3 text-gray-300" size={32} />
                <p className="text-sm font-medium text-gray-900">No records here yet</p>
                <p className="mt-1 text-sm text-gray-400">Add one above or create Blackbook entries from email participants.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <BlackbookRow
                  key={entry.id}
                  entry={entry}
                  categories={categories}
                  listEntry={selectedListEntryMap.get(entry.id)}
                  onOpen={() => setSelectedEntryId(entry.id)}
                  onUpdateListEntry={updateListEntry}
                  onRemoveListEntry={removeListEntry}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      {selectedEntryId && <BlackbookOverlay initialEntryId={selectedEntryId} onClose={() => { setSelectedEntryId(null); loadEntries().catch(console.error); }} />}
    </div>
  );
}

function BlackbookRow({
  entry,
  categories,
  listEntry,
  onOpen,
  onUpdateListEntry,
  onRemoveListEntry,
}: {
  entry: BlackbookEntry;
  categories: BlackbookConfigCategory[];
  listEntry?: BlackbookTargetListEntry;
  onOpen: () => void;
  onUpdateListEntry: (itemId: string, patch: Partial<Pick<BlackbookTargetListEntry, "status" | "notes" | "nextFollowUpAt">>) => Promise<void>;
  onRemoveListEntry: (itemId: string) => Promise<void>;
}) {
  const category = categories.find((item) => item.id === entry.categoryConfigId);
  const dietary = [...entry.dietaryFlags, ...entry.allergens, entry.dietaryNotes].filter(Boolean).join(" · ");
  return (
    <div className={`grid w-full items-center gap-3 px-5 py-3 text-left hover:bg-[#f8f8f6] ${listEntry ? "grid-cols-[36px_1fr_150px_160px_140px_36px]" : "grid-cols-[36px_1fr_150px_150px]"}`}>
      <button onClick={onOpen} className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500">
        {entry.entryType === "COMPANY" ? <Building2 size={15} /> : entry.displayName.slice(0, 2).toUpperCase()}
      </button>
      <button onClick={onOpen} className="min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: category?.color ?? "#d1d5db" }} />
          <p className="truncate text-sm font-semibold text-gray-900">{entry.displayName}</p>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass(entry.lifecycleStatus)}`}>{STATUS_LABELS[entry.lifecycleStatus]}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400">{[entry.companyEntry?.displayName ?? entry.companyName, entry.email, entry.phone].filter(Boolean).join(" · ")}</p>
      </button>
      <div className="truncate text-xs text-gray-500">{[category?.name ?? entry.entryType.toLowerCase(), category?.types.filter((type) => entry.typeIds.includes(type.id)).map((type) => type.name).join(", ")].filter(Boolean).join(" · ")}</div>
      {listEntry ? (
        <>
          <select
            value={listEntry.status}
            onChange={(event) => onUpdateListEntry(listEntry.id, { status: event.target.value as BlackbookOutreachStatus })}
            className={`h-8 rounded-full border px-2 text-[11px] font-medium outline-none ${outreachClass(listEntry.status)}`}
          >
            {Object.entries(OUTREACH_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input
            type="date"
            value={listEntry.nextFollowUpAt?.slice(0, 10) ?? ""}
            onChange={(event) => onUpdateListEntry(listEntry.id, { nextFollowUpAt: event.target.value || null })}
            className="h-8 rounded border border-gray-200 px-2 text-xs text-gray-600 outline-none focus:border-gray-500"
          />
          <button onClick={() => onRemoveListEntry(listEntry.id)} className="grid h-8 w-8 place-items-center rounded text-gray-300 hover:bg-red-50 hover:text-red-600" title="Remove from list">
            <Trash2 size={14} />
          </button>
          <div className="col-span-full col-start-2">
            <input
              key={`${listEntry.id}-${listEntry.notes ?? ""}`}
              defaultValue={listEntry.notes ?? ""}
              onBlur={(event) => onUpdateListEntry(listEntry.id, { notes: event.target.value })}
              placeholder="Outreach notes..."
              className="h-8 w-full rounded border border-transparent bg-transparent px-2 text-xs text-gray-500 outline-none hover:border-gray-200 hover:bg-white focus:border-gray-500"
            />
          </div>
        </>
      ) : (
        <div className="truncate text-xs text-amber-700">{dietary}</div>
      )}
    </div>
  );
}
