import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ImagePlus, Plus, Search, Tag, Upload, X } from "lucide-react";
import { api } from "../../lib/api";
import type { ProductionSku, SelectsPayload, StillImage } from "../../lib/types";

function imageSrc(image: StillImage) {
  return `/api/productions/${image.productionId}/selects/images/${image.id}/thumbnail`;
}

function skuThumbnailSrc(sku: ProductionSku) {
  return sku.thumbnailJobFileId ? `/api/files/${sku.thumbnailJobFileId}/preview` : null;
}

function skuLabel(sku: ProductionSku) {
  return sku.code?.trim() || [sku.name, sku.colorway].filter(Boolean).join(" · ") || "Untitled SKU";
}

function skuInitials(sku: ProductionSku) {
  return skuLabel(sku).slice(0, 2).toUpperCase();
}

type SkuView = "all" | "missing-image" | "tagged" | "untagged";

const VIEWS: Array<{ key: SkuView; label: string; icon: string }> = [
  { key: "all", label: "All SKUs", icon: "▦" },
  { key: "missing-image", label: "Missing image", icon: "□" },
  { key: "tagged", label: "Tagged in shots", icon: "✓" },
  { key: "untagged", label: "Untagged", icon: "○" },
];

export default function SkuSheetBuilder({ productionId }: { productionId: string }) {
  const [payload, setPayload] = useState<SelectsPayload | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SkuView>("all");
  const [pickerSku, setPickerSku] = useState<ProductionSku | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [draftRows, setDraftRows] = useState<Array<{ id: string; code: string; name: string; colorway: string; materialName: string; hardware: string; notes: string }>>([]);

  const load = useCallback(async () => {
    setPayload(await api.get<SelectsPayload>(`/api/productions/${productionId}/selects`));
  }, [productionId]);

  useEffect(() => { load().catch(console.error); }, [load]);

  const skus = useMemo(() => payload?.skus ?? [], [payload?.skus]);
  const images = useMemo(() => payload?.images ?? [], [payload?.images]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const image of images) {
      for (const sku of image.skus) map.set(sku.id, (map.get(sku.id) ?? 0) + 1);
    }
    return map;
  }, [images]);

  const filteredSkus = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skus.filter((sku) => {
      const count = counts.get(sku.id) ?? 0;
      if (view === "missing-image" && sku.thumbnailJobFileId) return false;
      if (view === "tagged" && count === 0) return false;
      if (view === "untagged" && count > 0) return false;
      if (!needle) return true;
      return [sku.code, sku.name, sku.description, sku.colorway, sku.materialName, sku.hardware, sku.sourceSheet, sku.notes].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [counts, query, skus, view]);

  function addDraftRow() {
    setDraftRows((current) => [{ id: crypto.randomUUID(), code: "", name: "", colorway: "", materialName: "", hardware: "", notes: "" }, ...current]);
    setView("all");
    setQuery("");
  }

  async function saveDraft(row: { id: string; code: string; name: string; colorway: string; materialName: string; hardware: string; notes: string }) {
    if (![row.code, row.name, row.colorway, row.materialName, row.hardware].some((value) => value.trim())) return;
    await api.post<ProductionSku>(`/api/productions/${productionId}/selects/skus`, {
      code: row.code.trim(),
      name: row.name.trim() || undefined,
      colorway: row.colorway.trim() || undefined,
      materialName: row.materialName.trim() || undefined,
      hardware: row.hardware.trim() || undefined,
      notes: row.notes.trim() || undefined,
    });
    setDraftRows((current) => current.filter((item) => item.id !== row.id));
    await load();
  }

  async function importSkus() {
    const csv = window.prompt("Paste CSV rows: code,name,description,colorway,notes");
    if (!csv?.trim()) return;
    await api.post<ProductionSku[]>(`/api/productions/${productionId}/selects/skus/import`, { csv });
    await load();
  }

  async function updateSku(sku: ProductionSku, patch: Partial<ProductionSku>) {
    await api.patch<ProductionSku>(`/api/productions/${productionId}/selects/skus/${sku.id}`, patch);
    await load();
  }

  async function deleteSku(sku: ProductionSku) {
    if (!window.confirm(`Delete SKU ${skuLabel(sku)}?`)) return;
    await api.delete(`/api/productions/${productionId}/selects/skus/${sku.id}`);
    await load();
  }

  async function uploadThumbnail(sku: ProductionSku, file: File) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/productions/${productionId}/selects/skus/${sku.id}/thumbnail`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Upload failed");
    await load();
  }

  async function setThumbnailFromImage(sku: ProductionSku, image: StillImage) {
    await api.post(`/api/productions/${productionId}/selects/skus/${sku.id}/thumbnail-from-image`, { imageId: image.id });
    setPickerSku(null);
    await load();
  }

  const viewCounts = {
    all: skus.length,
    "missing-image": skus.filter((sku) => !sku.thumbnailJobFileId).length,
    tagged: skus.filter((sku) => (counts.get(sku.id) ?? 0) > 0).length,
    untagged: skus.filter((sku) => (counts.get(sku.id) ?? 0) === 0).length,
  } satisfies Record<SkuView, number>;

  return (
    <div className="flex h-full min-h-[640px] overflow-hidden rounded-lg border border-gray-200 bg-white">
      <aside className="hidden w-[260px] shrink-0 border-r border-gray-200 bg-[#fbfbfa] lg:flex lg:flex-col">
        <div className="border-b border-gray-200 p-3">
          <button onClick={addDraftRow} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-gray-700 hover:bg-gray-100">
            <Plus size={18} /> Create new SKU
          </button>
          <button onClick={importSkus} className="mt-1 flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] text-gray-500 hover:bg-gray-100">
            <Upload size={16} /> Import CSV
          </button>
        </div>
        <div className="space-y-1 p-3">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] ${view === item.key ? "bg-[#eeeeec] font-semibold text-gray-800" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <span className="grid h-4 w-4 place-items-center rounded border border-gray-300 text-[10px] text-gray-500">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="text-[11px] text-gray-400">{viewCounts[item.key]}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto border-t border-gray-200 p-4 text-[12px] leading-5 text-gray-500">
          <div className="mb-2 font-semibold uppercase tracking-[0.05em] text-gray-400">Sheet settings</div>
          <p>This SKU sheet feeds the Selects portal. Thumbnails appear in client SKU filters and internal SKU lists.</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        <div className="flex h-[40px] shrink-0 items-center border-b border-[#d7ece8] bg-[#e6fbf7]">
          <button className="flex h-full shrink-0 items-center border-r border-[#c7ebe4] bg-white px-4 text-[14px] font-semibold text-gray-900 shadow-[inset_0_-2px_0_#111827]">
            SKU Sheet
          </button>
          <button onClick={addDraftRow} className="flex h-full w-11 shrink-0 items-center justify-center text-xl text-gray-500 hover:bg-white/60 hover:text-gray-900">+</button>
          <div className="ml-auto flex items-center gap-2 px-3 text-xs text-gray-500">
            <span>{skus.length} SKUs</span>
            <span>{images.length} stills</span>
          </div>
        </div>

        <div className="flex min-h-0 h-[calc(100%-40px)] flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-3">
            <label className="relative min-w-64 flex-1">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, name, colorway, notes" className="h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400" />
            </label>
            <button onClick={addDraftRow} className="flex h-10 items-center gap-2 rounded-md bg-gray-950 px-3 text-sm font-medium text-white"><Plus size={16} /> SKU</button>
            <button onClick={importSkus} className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700"><Tag size={16} /> Import</button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[92px_140px_1fr_150px_150px_100px_1fr_70px_120px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase text-gray-500">
                <span>Image</span>
                <span>Code</span>
                <span>Name</span>
                <span>Colorway</span>
                <span>Material</span>
                <span>Hardware</span>
                <span>Notes</span>
                <span>Shots</span>
                <span>Actions</span>
              </div>
              {draftRows.map((row) => (
                <NewSkuSheetRow
                  key={row.id}
                  row={row}
                  onChange={(patch) => setDraftRows((current) => current.map((item) => item.id === row.id ? { ...item, ...patch } : item))}
                  onCancel={() => setDraftRows((current) => current.filter((item) => item.id !== row.id))}
                  onSave={() => saveDraft(row).catch(console.error)}
                />
              ))}
              {filteredSkus.length === 0 ? (
                <div className="p-10 text-center text-sm text-gray-400">No SKUs match this view.</div>
              ) : filteredSkus.map((sku) => (
                <SkuSheetRow
                  key={sku.id}
                  sku={sku}
                  count={counts.get(sku.id) ?? 0}
                  onUpdate={(patch) => updateSku(sku, patch).catch(console.error)}
                  onDelete={() => deleteSku(sku).catch(console.error)}
                  onUpload={(file) => uploadThumbnail(sku, file).catch(console.error)}
                  onPick={() => setPickerSku(sku)}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      {pickerSku && (
        <SkuImagePicker
          sku={pickerSku}
          images={images}
          query={pickerQuery}
          onQuery={setPickerQuery}
          onClose={() => setPickerSku(null)}
          onPick={(image) => setThumbnailFromImage(pickerSku, image).catch(console.error)}
        />
      )}
    </div>
  );
}

function SkuSheetRow({ sku, count, onUpdate, onDelete, onUpload, onPick }: {
  sku: ProductionSku;
  count: number;
  onUpdate: (patch: Partial<ProductionSku>) => void;
  onDelete: () => void;
  onUpload: (file: File) => void;
  onPick: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbnail = skuThumbnailSrc(sku);

  return (
    <div className="grid min-h-[76px] grid-cols-[92px_140px_1fr_150px_150px_100px_1fr_70px_120px] items-center border-b border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
      <div className="flex items-center gap-2">
        {thumbnail ? <img src={thumbnail} alt="" className="h-14 w-14 rounded-md object-cover" loading="lazy" /> : <div className="grid h-14 w-14 place-items-center rounded-md bg-gray-100 text-xs font-semibold text-gray-400">{skuInitials(sku)}</div>}
      </div>
      <EditableCell value={sku.code ?? ""} placeholder="Blank" onCommit={(value) => onUpdate({ code: value.trim() || null })} strong />
      <EditableCell value={sku.name ?? ""} placeholder="Product name" onCommit={(value) => onUpdate({ name: value || null })} />
      <EditableCell value={sku.colorway ?? ""} placeholder="Colorway" onCommit={(value) => onUpdate({ colorway: value || null })} />
      <EditableCell value={sku.materialName ?? ""} placeholder="Material" onCommit={(value) => onUpdate({ materialName: value || null })} />
      <EditableCell value={sku.hardware ?? ""} placeholder="Hardware" onCommit={(value) => onUpdate({ hardware: value || null })} />
      <EditableCell value={sku.notes ?? ""} placeholder="Notes" onCommit={(value) => onUpdate({ notes: value || null })} />
      <span className="text-gray-500">{count}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => inputRef.current?.click()} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 text-gray-600" title="Upload thumbnail"><Upload size={14} /></button>
        <button onClick={onPick} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 text-gray-600" title="Pick from Selects"><ImagePlus size={14} /></button>
        <button onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 text-gray-400 hover:text-rose-600" title="Delete"><X size={14} /></button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }} />
      </div>
    </div>
  );
}

function NewSkuSheetRow({ row, onChange, onCancel, onSave }: {
  row: { id: string; code: string; name: string; colorway: string; materialName: string; hardware: string; notes: string };
  onChange: (patch: Partial<typeof row>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const codeRef = useRef<HTMLInputElement>(null);
  useEffect(() => { codeRef.current?.focus(); }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") onSave();
    if (event.key === "Escape") onCancel();
  }

  return (
    <div className="grid min-h-[76px] grid-cols-[92px_140px_1fr_150px_150px_100px_1fr_70px_120px] items-center border-b border-emerald-100 bg-emerald-50/45 px-3 py-2 text-sm">
      <div className="grid h-14 w-14 place-items-center rounded-md border border-dashed border-emerald-300 bg-white text-xs font-semibold text-emerald-600">New</div>
      <input
        ref={codeRef}
        value={row.code}
        onChange={(event) => onChange({ code: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="SKU code"
        className="min-h-9 w-full rounded-md border border-emerald-200 bg-white px-2 text-sm font-semibold text-gray-900 outline-none focus:border-emerald-500"
      />
      <input
        value={row.name}
        onChange={(event) => onChange({ name: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Product name"
        className="min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 outline-none hover:border-emerald-200 focus:border-emerald-300 focus:bg-white"
      />
      <input
        value={row.colorway}
        onChange={(event) => onChange({ colorway: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Colorway"
        className="min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 outline-none hover:border-emerald-200 focus:border-emerald-300 focus:bg-white"
      />
      <input
        value={row.materialName}
        onChange={(event) => onChange({ materialName: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Material"
        className="min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 outline-none hover:border-emerald-200 focus:border-emerald-300 focus:bg-white"
      />
      <input
        value={row.hardware}
        onChange={(event) => onChange({ hardware: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Hardware"
        className="min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 outline-none hover:border-emerald-200 focus:border-emerald-300 focus:bg-white"
      />
      <input
        value={row.notes}
        onChange={(event) => onChange({ notes: event.target.value })}
        onKeyDown={handleKeyDown}
        placeholder="Notes"
        className="min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 outline-none hover:border-emerald-200 focus:border-emerald-300 focus:bg-white"
      />
      <span className="text-gray-400">0</span>
      <div className="flex items-center gap-1">
        <button onClick={onSave} disabled={![row.code, row.name, row.colorway, row.materialName, row.hardware].some((value) => value.trim())} className="h-8 rounded-md bg-gray-950 px-3 text-xs font-medium text-white disabled:bg-gray-200 disabled:text-gray-400">Save</button>
        <button onClick={onCancel} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 bg-white text-gray-500" title="Cancel"><X size={14} /></button>
      </div>
    </div>
  );
}

function EditableCell({ value, placeholder, strong = false, onCommit }: { value: string; placeholder?: string; strong?: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
      className={`min-h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-gray-200 focus:border-gray-300 focus:bg-white ${strong ? "font-semibold text-gray-900" : "text-gray-700"}`}
    />
  );
}

function SkuImagePicker({ sku, images, query, onQuery, onClose, onPick }: {
  sku: ProductionSku;
  images: StillImage[];
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  onPick: (image: StillImage) => void;
}) {
  const matches = images.filter((image) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return image.jobFile.originalFilename.toLowerCase().includes(needle) || image.skus.some((item) => skuLabel(item).toLowerCase().includes(needle));
  });

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-950/40 p-4">
      <div className="m-auto flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex min-h-14 items-center gap-3 border-b border-gray-200 px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">Pick thumbnail for {skuLabel(sku)}</p>
            <p className="text-xs text-gray-500">Choose any still already uploaded to Selects.</p>
          </div>
          <label className="relative hidden min-w-80 sm:block">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search images" className="h-10 w-full rounded-md border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400" />
          </label>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><X size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {matches.map((image) => (
              <button key={image.id} onClick={() => onPick(image)} className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left hover:border-gray-900">
                <img src={imageSrc(image)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="block truncate p-2 text-xs font-medium text-gray-700">{image.jobFile.originalFilename}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
