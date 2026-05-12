import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Camera, Download, ExternalLink, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { api } from "../../lib/api";

type OptionStatus = "RECOMMENDED" | "RESEARCHED" | "OPTION" | "SHORTLISTED" | "NOT_AVAILABLE";
type OptionAvailability = "AVAILABLE" | "UNAVAILABLE" | "TBC" | "UNKNOWN";
type ViewMode = "internal" | "client";

interface OptionPhoto {
  id: string;
  filename: string;
  order: number;
  caption: string | null;
  url: string;
}

interface BoardOption {
  id: string;
  name: string;
  subtitle: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  rate: number | null;
  rateUnit: string | null;
  currency: string;
  status: OptionStatus;
  isAvailable: OptionAvailability;
  internalNotes: string | null;
  clientNotes: string | null;
  order: number;
  photos: OptionPhoto[];
}

interface OptionsCategory {
  id: string;
  name: string;
  emoji: string | null;
  order: number;
  options: BoardOption[];
}

interface OptionsBoard {
  id: string;
  productionId: string;
  title: string;
  production: {
    jobCode: string | null;
    client: string | null;
    brand: string | null;
    title: string;
  };
  categories: OptionsCategory[];
}

const STATUS_ORDER: OptionStatus[] = ["RESEARCHED", "OPTION", "SHORTLISTED", "RECOMMENDED", "NOT_AVAILABLE"];
const AVAILABILITY_ORDER: OptionAvailability[] = ["UNKNOWN", "AVAILABLE", "TBC", "UNAVAILABLE"];
const CLIENT_VISIBLE_STATUSES: OptionStatus[] = ["RECOMMENDED", "OPTION", "SHORTLISTED"];
const EMOJIS = ["📍", "🌸", "🍽", "🎹", "📷", "🌿", "🏛", "🚗", "✈️", "🎨", "🎭", "💐", "🍷", "🎬", "🎤"];
const COMMON_CATEGORIES = [
  { name: "Locations", emoji: "📍" },
  { name: "Florists", emoji: "🌸" },
  { name: "Caterers", emoji: "🍽" },
];
const OPTIONS_GRID_INTERNAL = "44px minmax(220px,360px) minmax(140px,180px) 96px 118px 100px minmax(132px,180px) minmax(132px,180px) minmax(120px,160px) minmax(120px,160px) 88px";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusClass(status: OptionStatus): string {
  if (status === "RECOMMENDED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "RESEARCHED") return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "SHORTLISTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "NOT_AVAILABLE") return "border-red-200 bg-red-50 text-red-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function availabilityClass(value: OptionAvailability): string {
  if (value === "AVAILABLE") return "text-emerald-700";
  if (value === "UNAVAILABLE") return "text-red-600";
  if (value === "TBC") return "text-amber-700";
  return "text-gray-400";
}

function label(value: string): string {
  return value.replace(/_/g, " ").toLowerCase();
}

interface EditableCellProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  placeholder?: string;
  type?: "text" | "number";
  multiline?: boolean;
}

function EditableCell({ value, onSave, className = "", placeholder = "", type = "text", multiline = false }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  async function save() {
    setEditing(false);
    if (draft !== value) await onSave(draft);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      setDraft(value);
      setEditing(false);
    }
    if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      void save();
    }
  }

  if (editing) {
    const base = `w-full border-0 bg-transparent p-0 text-inherit outline-none ${className}`;
    if (multiline) {
      return <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={keyDown} autoFocus className={`${base} resize-none`} rows={2} />;
    }
    return <input value={draft} type={type} step={type === "number" ? "any" : undefined} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={keyDown} autoFocus className={base} />;
  }

  return (
    <button onClick={() => setEditing(true)} className={`w-full truncate text-left ${className || "text-gray-700"}`}>
      {value || <span className="text-gray-300">{placeholder}</span>}
    </button>
  );
}

function PhotoThumb({ option, onOpen }: { option: BoardOption; onOpen: () => void }) {
  const photo = option.photos[0];
  return (
    <button onClick={onOpen} className="grid h-9 w-9 place-items-center overflow-hidden rounded border border-gray-200 bg-gray-100 text-gray-400">
      {photo ? <img src={photo.url} alt={photo.filename} className="h-full w-full object-cover" /> : <Camera size={14} />}
    </button>
  );
}

function ClientCard({ option, emoji }: { option: BoardOption; emoji: string | null }) {
  const photo = option.photos[0];
  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="h-40 bg-gray-100">
        {photo ? <img src={photo.url} alt={option.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl text-gray-300">{emoji ?? "□"}</div>}
      </div>
      <div className="p-3">
        <h4 className="text-sm font-semibold text-gray-900">{option.name}</h4>
        {option.subtitle && <p className="mt-1 text-xs text-gray-500">{option.subtitle}</p>}
        {option.clientNotes && <p className="mt-2 text-xs leading-6 text-gray-600">{option.clientNotes}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(option.status)}`}>{label(option.status)}</span>
          {option.website && (
            <a href={option.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700">
              Visit <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function PhotoManager({ option, onClose, onUploaded, onDelete, onCover }: {
  option: BoardOption;
  onClose: () => void;
  onUploaded: (files: FileList) => Promise<void>;
  onDelete: (photoId: string) => Promise<void>;
  onCover: (photoId: string) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await onUploaded(files);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[900] grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-[520px] rounded-lg bg-white shadow-xl">
        <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
          <h3 className="text-sm font-semibold text-gray-900">Photos — {option.name}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {option.photos.map((photo, index) => (
            <div key={photo.id} className="group relative overflow-hidden rounded-md border border-gray-200">
              <img src={photo.url} alt={photo.filename} className="h-[100px] w-full object-cover" />
              {index === 0 && <span className="absolute left-2 top-2 rounded bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
              <div className="absolute inset-x-0 bottom-0 hidden items-center justify-between bg-black/60 px-2 py-1 group-hover:flex">
                <button onClick={() => onCover(photo.id)} className="text-[10px] text-white">Set cover</button>
                <button onClick={() => onDelete(photo.id)} className="text-red-200"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          {option.photos.length < 10 && (
            <button
              onClick={() => inputRef.current?.click()}
              onDrop={(event) => { event.preventDefault(); void handleFiles(event.dataTransfer.files); }}
              onDragOver={(event) => event.preventDefault()}
              className="grid h-[100px] place-items-center rounded-md border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-500"
            >
              <span className="flex flex-col items-center gap-2"><ImagePlus size={18} /> Upload</span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files)} />
          <p className="text-xs text-gray-500">JPG, PNG or WEBP. Max 10MB each.</p>
          <button onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
            {uploading ? "Uploading..." : "Upload photos"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotePreview({ label, value, onClick }: { label: string; value: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-7 w-full items-center rounded border px-2 text-left text-xs transition ${
        value?.trim()
          ? "border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100"
          : "border-transparent text-gray-300 hover:border-amber-200 hover:bg-amber-50"
      }`}
      title={value ?? label}
    >
      <span className="truncate">{value?.trim() || label}</span>
    </button>
  );
}

function PillDropdown<T extends string>({ value, options, onChange, classNameForValue }: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => Promise<void>;
  classNameForValue: (value: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex min-h-7 items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold uppercase ${classNameForValue(value)}`}
      >
        {label(value)}
        <span className="text-[9px] opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[142px] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                setOpen(false);
                void onChange(option);
              }}
              className={`mb-1 flex w-full items-center rounded border px-2 py-1.5 text-left text-[10px] font-semibold uppercase last:mb-0 ${option === value ? classNameForValue(option) : "border-transparent text-gray-600 hover:bg-gray-50"}`}
            >
              {label(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StickyNoteEditor({ title, value, onClose, onSave }: {
  title: string;
  value: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[850] bg-black/10" onMouseDown={onClose}>
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute right-8 top-28 w-[360px] rotate-[-0.5deg] rounded-sm border border-amber-200 bg-[#fff8bf] p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-amber-950">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded text-amber-900 hover:bg-amber-200/60">
            <X size={15} />
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoFocus
          rows={10}
          className="w-full resize-none rounded-sm border border-amber-200/70 bg-[#fffbd1] p-3 text-sm leading-6 text-amber-950 outline-none placeholder:text-amber-700/50 focus:border-amber-400"
          placeholder="Write notes..."
        />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[11px] text-amber-800/70">Autosaves when you press Save.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200/60">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded bg-amber-950 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OptionsBoardView({ productionId, onBack }: { productionId: string; onBack: () => void }) {
  const [board, setBoard] = useState<OptionsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("internal");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("📍");
  const [photoOption, setPhotoOption] = useState<BoardOption | null>(null);
  const [exporting, setExporting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<OptionsBoard>(`/api/options/production/${productionId}`);
      setBoard(data);
      setActiveCategoryId((current) => current && data.categories.some((category) => category.id === current) ? current : data.categories[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [productionId]);

  const activeCategory = useMemo(() => board?.categories.find((category) => category.id === activeCategoryId) ?? board?.categories[0] ?? null, [board, activeCategoryId]);

  async function updateBoardTitle(title: string) {
    if (!board) return;
    const data = await api.patch<OptionsBoard>(`/api/options/boards/${board.id}`, { title });
    setBoard(data);
  }

  async function addCategory(name: string, emoji: string | null) {
    if (!board || !name.trim()) return;
    const data = await api.post<OptionsBoard>(`/api/options/boards/${board.id}/categories`, { name: name.trim(), emoji });
    setBoard(data);
    setActiveCategoryId(data.categories[data.categories.length - 1]?.id ?? null);
    setAddingCategory(false);
    setNewCategoryName("");
  }

  async function updateCategory(categoryId: string, patch: Partial<Pick<OptionsCategory, "name" | "emoji" | "order">>) {
    const data = await api.patch<OptionsBoard>(`/api/options/categories/${categoryId}`, patch);
    setBoard(data);
  }

  async function deleteCategory(category: OptionsCategory) {
    if (!window.confirm(`Delete ${category.name} and all ${category.options.length} options? This cannot be undone.`)) return;
    const data = await api.delete(`/api/options/categories/${category.id}`).then(() => api.get<OptionsBoard>(`/api/options/production/${productionId}`));
    setBoard(data);
    setActiveCategoryId(data.categories[0]?.id ?? null);
  }

  async function addOption(categoryId: string) {
    const data = await api.post<OptionsBoard>(`/api/options/categories/${categoryId}/options`, { name: "New option" });
    setBoard(data);
  }

  async function updateOption(optionId: string, patch: Partial<BoardOption>) {
    const data = await api.patch<OptionsBoard>(`/api/options/${optionId}`, patch);
    setBoard(data);
  }

  async function deleteOption(option: BoardOption) {
    if (!window.confirm(`Delete ${option.name}?`)) return;
    await api.delete(`/api/options/${option.id}`);
    await load();
  }

  async function duplicateOption(option: BoardOption) {
    if (!activeCategory) return;
    const data = await api.post<OptionsBoard>(`/api/options/categories/${activeCategory.id}/options`, {
      name: `${option.name} copy`,
      subtitle: option.subtitle,
      website: option.website,
      contactName: option.contactName,
      contactEmail: option.contactEmail,
      contactPhone: option.contactPhone,
      rate: option.rate,
      rateUnit: option.rateUnit,
      status: option.status,
      isAvailable: option.isAvailable,
      internalNotes: option.internalNotes,
      clientNotes: option.clientNotes,
    });
    setBoard(data);
  }

  async function uploadPhotos(optionId: string, files: FileList) {
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch(`/api/options/${optionId}/photos`, { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new Error("Photo upload failed");
    }
    await load();
  }

  async function deletePhoto(photoId: string) {
    await api.delete(`/api/options/photos/${photoId}`);
    await load();
  }

  async function setCover(option: BoardOption, photoId: string) {
    const orderedIds = [photoId, ...option.photos.filter((photo) => photo.id !== photoId).map((photo) => photo.id)];
    const data = await api.patch<OptionsBoard>(`/api/options/${option.id}/photos/reorder`, { orderedIds });
    setBoard(data);
    setPhotoOption(data.categories.flatMap((category) => category.options).find((item) => item.id === option.id) ?? null);
  }

  async function exportPdf() {
    if (!board) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/options/boards/${board.id}/export-pdf`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("PDF export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${board.production.jobCode ?? "JOB"}_Options_${today()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      window.alert("PDF saved to job folder");
    } catch {
      window.alert("PDF export failed — try again");
    } finally {
      setExporting(false);
    }
  }

  if (loading || !board) return <div className="grid h-full place-items-center text-sm text-gray-400">Loading options…</div>;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-gray-200 px-4">
        <button onClick={onBack} className="shrink-0 text-sm text-gray-500 hover:text-gray-900">← {board.production.jobCode ?? "Production"} {board.production.brand ?? board.production.client ?? ""}</button>
        <EditableCell value={board.title} onSave={updateBoardTitle} className="max-w-[360px] text-center text-base font-semibold text-gray-900" />
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
            <button onClick={() => setView("internal")} className={`rounded-md px-3 py-1.5 ${view === "internal" ? "bg-gray-900 text-white" : "text-gray-500"}`}>Internal</button>
            <button onClick={() => setView("client")} className={`rounded-md px-3 py-1.5 ${view === "client" ? "bg-gray-900 text-white" : "text-gray-500"}`}>Client</button>
          </div>
          <button onClick={() => setAddingCategory(true)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">+ Category</button>
          <button onClick={exportPdf} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            <Download size={13} /> {exporting ? "Generating..." : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="flex min-h-10 items-center gap-2 overflow-x-auto border-b border-gray-200 px-4">
        {board.categories.map((category) => (
          <div key={category.id} className="group flex shrink-0 items-center">
            <button onClick={() => setActiveCategoryId(category.id)} className={`border-b-2 px-3 py-3 text-sm ${activeCategory?.id === category.id ? "border-gray-900 font-semibold text-gray-900" : "border-transparent text-gray-500"}`}>
              {category.emoji} {category.name}
            </button>
            <button onClick={() => deleteCategory(category)} className="hidden px-1 text-gray-300 hover:text-red-600 group-hover:block">×</button>
          </div>
        ))}
        <button onClick={() => setAddingCategory(true)} className="shrink-0 px-3 py-2 text-sm text-gray-500">+</button>
        {addingCategory && (
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-sm">
            <select value={newCategoryEmoji} onChange={(event) => setNewCategoryEmoji(event.target.value)} className="text-sm outline-none">
              {EMOJIS.map((emoji) => <option key={emoji}>{emoji}</option>)}
            </select>
            <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Category" autoFocus className="w-36 text-sm outline-none" />
            <button onClick={() => addCategory(newCategoryName, newCategoryEmoji)} className="rounded bg-gray-900 px-2 py-1 text-xs text-white">Add</button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {board.categories.length === 0 ? (
          <div className="m-6 grid place-items-center rounded-lg border border-gray-200 p-10 text-center">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Start building your options board</h3>
              <p className="mt-2 max-w-md text-sm text-gray-500">Add categories for the types of options you're researching — locations, caterers, talent, and more.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {COMMON_CATEGORIES.map((category) => (
                  <button key={category.name} onClick={() => addCategory(category.name, category.emoji)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                    {category.emoji} Add {category.name}
                  </button>
                ))}
                <button onClick={() => setAddingCategory(true)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">+ Custom category</button>
              </div>
            </div>
          </div>
        ) : activeCategory ? (
          view === "internal" ? (
            <InternalTable
              category={activeCategory}
              onUpdateCategory={updateCategory}
              onAddOption={addOption}
              onUpdateOption={updateOption}
              onDeleteOption={deleteOption}
              onDuplicateOption={duplicateOption}
              onPhoto={setPhotoOption}
            />
          ) : (
            <ClientPresentation board={board} category={activeCategory} />
          )
        ) : null}
      </div>

      {photoOption && (
        <PhotoManager
          option={photoOption}
          onClose={() => setPhotoOption(null)}
          onUploaded={(files) => uploadPhotos(photoOption.id, files)}
          onDelete={deletePhoto}
          onCover={(photoId) => setCover(photoOption, photoId)}
        />
      )}
    </div>
  );
}

function InternalTable({ category, onUpdateCategory, onAddOption, onUpdateOption, onDeleteOption, onDuplicateOption, onPhoto }: {
  category: OptionsCategory;
  onUpdateCategory: (categoryId: string, patch: Partial<Pick<OptionsCategory, "name" | "emoji" | "order">>) => Promise<void>;
  onAddOption: (categoryId: string) => Promise<void>;
  onUpdateOption: (optionId: string, patch: Partial<BoardOption>) => Promise<void>;
  onDeleteOption: (option: BoardOption) => Promise<void>;
  onDuplicateOption: (option: BoardOption) => Promise<void>;
  onPhoto: (option: BoardOption) => void;
}) {
  const [noteEditor, setNoteEditor] = useState<{ option: BoardOption; field: "internalNotes" | "clientNotes" } | null>(null);

  return (
    <div className="min-w-[1120px]">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <EditableCell value={category.emoji ?? ""} onSave={(emoji) => onUpdateCategory(category.id, { emoji })} className="w-8 text-lg" />
          <EditableCell value={category.name} onSave={(name) => onUpdateCategory(category.id, { name })} className="text-sm font-semibold text-gray-900" />
        </div>
        <button disabled title="Coming soon" className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-400">+ Add from library</button>
      </div>
      <div className="grid min-h-7 w-max min-w-full max-w-[1500px] items-center gap-x-3 border-b border-gray-200 bg-[#f8f8f6] px-3 text-[10px] uppercase tracking-[0.05em] text-gray-400" style={{ gridTemplateColumns: OPTIONS_GRID_INTERNAL }}>
        <div>📷</div><div>Name</div><div>Subtitle</div><div className="text-right">Rate</div><div>Status</div><div>Available</div><div>Internal notes</div><div>Client notes</div><div>Website</div><div>Contact</div><div />
      </div>
      {category.options.map((option) => (
        <div key={option.id} className="group grid min-h-11 w-max min-w-full max-w-[1500px] items-center gap-x-3 border-b border-gray-100 px-3 text-xs hover:bg-[#f5f5f3]" style={{ gridTemplateColumns: OPTIONS_GRID_INTERNAL }}>
          <PhotoThumb option={option} onOpen={() => onPhoto(option)} />
          <EditableCell value={option.name} onSave={(name) => onUpdateOption(option.id, { name })} className="font-semibold text-gray-900" placeholder="Name" />
          <EditableCell value={option.subtitle ?? ""} onSave={(subtitle) => onUpdateOption(option.id, { subtitle })} className="text-gray-500" placeholder="Subtitle" />
          <EditableCell value={option.rate?.toString() ?? ""} type="number" onSave={(rate) => onUpdateOption(option.id, { rate: rate ? Number(rate) : null })} className="text-right tabular-nums text-gray-700" placeholder="£0" />
          <PillDropdown value={option.status} options={STATUS_ORDER} onChange={(status) => onUpdateOption(option.id, { status })} classNameForValue={statusClass} />
          <PillDropdown value={option.isAvailable} options={AVAILABILITY_ORDER} onChange={(isAvailable) => onUpdateOption(option.id, { isAvailable })} classNameForValue={(availability) => `border-transparent bg-transparent ${availabilityClass(availability)}`} />
          <NotePreview label="Internal notes" value={option.internalNotes} onClick={() => setNoteEditor({ option, field: "internalNotes" })} />
          <NotePreview label="Client notes" value={option.clientNotes} onClick={() => setNoteEditor({ option, field: "clientNotes" })} />
          {option.website ? <a href={option.website} target="_blank" rel="noreferrer" className="truncate text-blue-700">{option.website}</a> : <EditableCell value="" onSave={(website) => onUpdateOption(option.id, { website })} className="text-gray-300" placeholder="Website" />}
          <EditableCell value={option.contactName ?? option.contactEmail ?? ""} onSave={(contactName) => onUpdateOption(option.id, { contactName })} className="text-gray-500" placeholder="Contact" />
          <div className="hidden justify-end gap-1 group-hover:flex">
            <button onClick={() => onPhoto(option)} className="grid h-7 w-7 place-items-center rounded hover:bg-white"><ImagePlus size={14} /></button>
            <button onClick={() => onDuplicateOption(option)} className="grid h-7 w-7 place-items-center rounded hover:bg-white">⧉</button>
            <button onClick={() => onDeleteOption(option)} className="grid h-7 w-7 place-items-center rounded text-red-500 hover:bg-white"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      {category.options.length === 0 && (
        <div className="grid h-24 place-items-center text-center text-sm text-gray-500">
          <div>No options in this category yet.<br /><button onClick={() => onAddOption(category.id)} className="mt-2 text-gray-900 underline">+ Add option</button> <span className="text-gray-300">or</span> <span className="text-gray-300">+ Add from library (coming soon)</span></div>
        </div>
      )}
      <button onClick={() => onAddOption(category.id)} className="m-3 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-500 hover:text-gray-900">
        <Plus size={14} className="mr-1 inline" /> Add option
      </button>
      {noteEditor && (
        <StickyNoteEditor
          title={`${noteEditor.field === "internalNotes" ? "Internal notes" : "Client notes"} — ${noteEditor.option.name}`}
          value={noteEditor.option[noteEditor.field] ?? ""}
          onClose={() => setNoteEditor(null)}
          onSave={(value) => onUpdateOption(noteEditor.option.id, { [noteEditor.field]: value })}
        />
      )}
    </div>
  );
}

function ClientPresentation({ board, category }: { board: OptionsBoard; category: OptionsCategory }) {
  const groups = [
    { label: "Recommended", statuses: ["RECOMMENDED"] as OptionStatus[] },
    { label: "Also shortlisted", statuses: ["OPTION", "SHORTLISTED"] as OptionStatus[] },
  ];
  return (
    <div className="p-5">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Options — {[board.production.client, board.production.brand].filter(Boolean).join(" ") || board.production.title}</h3>
          <p className="mt-1 text-xs text-gray-500">Prepared by Conor Bond · {new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date())}</p>
        </div>
        <p className="text-sm font-semibold text-gray-900">unlimited.bond</p>
      </div>
      <div className="space-y-8">
        {groups.map((group) => {
          const options = category.options.filter((option) => group.statuses.includes(option.status) && CLIENT_VISIBLE_STATUSES.includes(option.status));
          if (options.length === 0) return null;
          return (
            <section key={group.label}>
              <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">{group.label}</h4>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {options.map((option) => <ClientCard key={option.id} option={option} emoji={category.emoji} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
