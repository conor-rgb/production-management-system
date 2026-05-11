import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Download,
  File,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  MoreHorizontal,
  Pencil,
  ReceiptText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api } from "../../lib/api";
import type { Budget, BudgetLineItem, FileTree, JobFile, JobFolder } from "../../lib/types";
import { formatBytes, JOB_FOLDERS } from "../../lib/types";

interface Props {
  productionId: string;
}

type UploadMode = "camera" | "photos" | "files";

function iconFor(file: JobFile) {
  if (file.isReceipt) return <ReceiptText size={18} className="text-amber-600" />;
  if (file.mimeType === "application/pdf") return <FileText size={18} className="text-red-500" />;
  if (file.mimeType.startsWith("image/")) return <FileImage size={18} className="text-emerald-600" />;
  if (file.mimeType.startsWith("video/")) return <FileVideo size={18} className="text-blue-600" />;
  if (file.mimeType.includes("word") || file.mimeType.includes("text")) return <FileText size={18} className="text-indigo-600" />;
  return <File size={18} className="text-gray-500" />;
}

async function uploadFiles(productionId: string, folder: JobFolder, files: FileList, onProgress: (name: string) => void) {
  const uploaded: JobFile[] = [];
  for (const file of Array.from(files)) {
    onProgress(file.name);
    const form = new FormData();
    form.append("folder", folder);
    form.append("files", file);

    const res = await fetch(`/api/files/production/${productionId}/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload failed: ${res.status}`);
    }
    const data = await res.json() as JobFile | JobFile[];
    uploaded.push(...(Array.isArray(data) ? data : [data]));
  }
  return uploaded;
}

export default function FileBrowser({ productionId }: Props) {
  const [tree, setTree] = useState<FileTree | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<JobFolder>("Briefs");
  const [selectedFile, setSelectedFile] = useState<JobFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [uploadChoiceOpen, setUploadChoiceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api.get<FileTree>(`/api/files/production/${productionId}/tree`);
    setTree(data);
  }, [productionId]);

  useEffect(() => { load().catch(console.error); }, [load]);

  const folders = tree?.folders ?? JOB_FOLDERS.map((name) => ({ name, files: [] }));
  const current = folders.find((folder) => folder.name === selectedFolder) ?? folders[0];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      await uploadFiles(productionId, selectedFolder, files, (name) => setUploading((items) => [...items, name]));
      await load();
    } finally {
      setUploading([]);
      setUploadChoiceOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (photosInputRef.current) photosInputRef.current.value = "";
    }
  }

  function openUpload(mode?: UploadMode) {
    if (mode === "camera") cameraInputRef.current?.click();
    else if (mode === "photos") photosInputRef.current?.click();
    else fileInputRef.current?.click();
  }

  async function patchFile(file: JobFile, patch: Partial<JobFile>) {
    const updated = await api.patch<JobFile>(`/api/files/${file.id}`, patch);
    setSelectedFile((currentFile) => currentFile?.id === updated.id ? updated : currentFile);
    await load();
  }

  async function deleteFile(file: JobFile) {
    if (!window.confirm(`Delete ${file.originalFilename}?`)) return;
    await api.delete(`/api/files/${file.id}`);
    if (selectedFile?.id === file.id) setSelectedFile(null);
    await load();
  }

  async function renameFile(file: JobFile) {
    const next = window.prompt("Rename file", file.originalFilename);
    if (!next || next === file.originalFilename) return;
    await patchFile(file, { originalFilename: next });
  }

  async function moveFile(file: JobFile) {
    const next = window.prompt(`Move to folder: ${JOB_FOLDERS.join(", ")}`, file.folder);
    if (!next || next === file.folder) return;
    if (!JOB_FOLDERS.includes(next as JobFolder)) {
      window.alert("Invalid folder");
      return;
    }
    await patchFile(file, { folder: next as JobFolder });
  }

  return (
    <div className="flex h-full min-h-[520px] flex-col md:flex-row">
      <div className="border-b border-gray-200 md:w-40 md:border-b-0 md:border-r">
        <div className="flex gap-2 overflow-x-auto p-2 md:block md:space-y-1">
          {folders.map((folder) => (
            <button
              key={folder.name}
              onClick={() => setSelectedFolder(folder.name)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm md:w-full md:justify-between ${selectedFolder === folder.name ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-50"}`}
            >
              <span>{folder.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${selectedFolder === folder.name ? "bg-white/20" : "bg-gray-100 text-gray-500"}`}>
                {folder.files.length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className={`relative flex min-w-0 flex-1 flex-col ${dragging ? "bg-indigo-50" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files).catch(console.error);
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{selectedFolder}</h3>
            <p className="text-xs text-gray-500">{current.files.length} files</p>
          </div>
          <button
            onClick={() => setUploadChoiceOpen(true)}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
          >
            <Upload size={16} /> Upload
          </button>
        </div>

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files).catch(console.error)} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files).catch(console.error)} />
        <input ref={photosInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files).catch(console.error)} />

        {uploading.length > 0 && (
          <div className="border-b border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700">
            {uploading.map((name) => <p key={name}>Uploading {name}…</p>)}
          </div>
        )}

        {current.files.length === 0 ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div>
              <Folder size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">No files in {selectedFolder}</p>
              <button onClick={() => setUploadChoiceOpen(true)} className="mt-3 min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
                Upload files
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-2">
            {current.files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                selected={selectedFile?.id === file.id}
                onOpen={() => setSelectedFile(file)}
                onRename={() => renameFile(file)}
                onMove={() => moveFile(file)}
                onDelete={() => deleteFile(file)}
              />
            ))}
          </div>
        )}

        {uploadChoiceOpen && (
          <UploadChoice
            onClose={() => setUploadChoiceOpen(false)}
            onPick={openUpload}
          />
        )}
      </div>

      {selectedFile && (
        <PreviewPanel
          file={selectedFile}
          productionId={productionId}
          folders={JOB_FOLDERS}
          onClose={() => setSelectedFile(null)}
          onPatch={(patch) => patchFile(selectedFile, patch)}
        />
      )}
    </div>
  );
}

function FileRow({ file, selected, onOpen, onRename, onMove, onDelete }: {
  file: JobFile;
  selected: boolean;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const touchStart = useRef<number | null>(null);

  return (
    <div
      className={`group mb-1 overflow-hidden rounded-lg border ${selected ? "border-gray-900" : "border-transparent"}`}
      onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const end = e.changedTouches[0]?.clientX ?? touchStart.current;
        if (touchStart.current - end > 40) setActionsOpen(true);
        touchStart.current = null;
      }}
    >
      <div className="flex min-h-[52px] items-center gap-3 bg-white p-2 hover:bg-gray-50">
        <button onClick={onOpen} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-100">{iconFor(file)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-gray-900">{file.originalFilename}</span>
            <span className="block truncate text-xs text-gray-500">
              {file.isReceipt && (file.receiptVendor || file.receiptAmount)
                ? `${file.receiptVendor ?? "Unknown vendor"} · ${file.receiptAmount ? `£${(file.receiptAmount / 100).toFixed(2)}` : "Amount pending"}`
                : `${formatBytes(file.sizeBytes)} · ${new Date(file.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
            </span>
          </span>
        </button>
        <div className="hidden items-center gap-1 group-hover:flex">
          <ActionButton label="Rename" onClick={onRename}><Pencil size={15} /></ActionButton>
          <ActionButton label="Move" onClick={onMove}><Folder size={15} /></ActionButton>
          <a className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" href={`/api/files/${file.id}/download`}>
            <Download size={15} />
          </a>
          <ActionButton label="Delete" danger onClick={onDelete}><Trash2 size={15} /></ActionButton>
        </div>
        <button onClick={() => setActionsOpen(!actionsOpen)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 md:hidden">
          <MoreHorizontal size={17} />
        </button>
      </div>
      {actionsOpen && (
        <div className="flex justify-end gap-2 bg-gray-50 p-2 md:hidden">
          <button onClick={onRename} className="min-h-11 rounded-lg bg-gray-200 px-3 text-sm text-gray-700">Rename</button>
          <button onClick={onMove} className="min-h-11 rounded-lg bg-gray-200 px-3 text-sm text-gray-700">Move</button>
          <a href={`/api/files/${file.id}/download`} className="grid min-h-11 place-items-center rounded-lg bg-gray-200 px-3 text-sm text-gray-700">Download</a>
          <button onClick={onDelete} className="min-h-11 rounded-lg bg-red-600 px-3 text-sm text-white">Delete</button>
        </div>
      )}
    </div>
  );
}

export function PreviewPanel({ file, productionId, folders, onClose, onPatch }: {
  file: JobFile;
  productionId?: string;
  folders: JobFolder[];
  onClose: () => void;
  onPatch: (patch: Partial<JobFile>) => Promise<void>;
}) {
  const [notes, setNotes] = useState(file.notes ?? "");
  const [budgetLines, setBudgetLines] = useState<{ sectionCode: string; line: BudgetLineItem }[]>([]);
  const [linkMessage, setLinkMessage] = useState("");
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";
  const isVideo = file.mimeType.startsWith("video/");

  useEffect(() => { setNotes(file.notes ?? ""); }, [file]);
  useEffect(() => {
    if (!productionId) return;
    api.get<Budget>(`/api/budgets/production/${productionId}`)
      .then((budget) => {
        const lines = budget.currentRevision?.sections.flatMap((section) =>
          section.lineItems.map((line) => ({ sectionCode: section.code, line }))
        ) ?? [];
        setBudgetLines(lines);
      })
      .catch(console.error);
  }, [productionId]);

  async function linkBudgetLine(lineId: string) {
    await onPatch({ linkedBudgetLineId: lineId || undefined });
    if (file.isReceipt && lineId && file.receiptAmount) {
      await api.post(`/api/budgets/lines/${lineId}/subcosts`, {
        description: file.notes || file.originalFilename,
        supplierName: file.receiptVendor || file.originalFilename,
        amount: file.receiptAmount / 100,
        status: "PAID",
        invoiceFileId: file.id,
        invoiceDate: file.receiptDate,
      });
      setLinkMessage("Receipt sub-cost created.");
    } else {
      setLinkMessage(lineId ? "Budget line linked." : "Budget line cleared.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white md:static md:z-auto md:w-80 md:border-l md:border-gray-200">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">{file.originalFilename}</h3>
          <p className="text-xs text-gray-500">{formatBytes(file.sizeBytes)}</p>
        </div>
        <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {isImage ? (
          <img src={`/api/files/${file.id}/preview`} alt={file.originalFilename} className="w-full touch-pinch-zoom rounded-lg object-contain" />
        ) : isPdf ? (
          <iframe title={file.originalFilename} src={`/api/files/${file.id}/preview`} className="h-[70vh] w-full rounded-lg border border-gray-200" />
        ) : isVideo ? (
          <video controls src={`/api/files/${file.id}/preview`} className="w-full rounded-lg bg-black" />
        ) : (
          <div className="grid min-h-56 place-items-center rounded-lg border border-gray-200 text-center">
            <div>
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-xl bg-gray-100">{iconFor(file)}</div>
              <p className="max-w-56 break-words text-sm font-medium text-gray-900">{file.originalFilename}</p>
              <p className="mt-1 text-xs text-gray-500">{formatBytes(file.sizeBytes)} · {new Date(file.uploadedAt).toLocaleDateString("en-GB")}</p>
              <a href={`/api/files/${file.id}/download`} className="mt-4 inline-grid min-h-11 place-items-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
                Download
              </a>
            </div>
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => onPatch({ notes })}
            rows={4}
            className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-gray-400"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Budget line</span>
          <select
            value={file.linkedBudgetLineId ?? ""}
            onChange={(e) => linkBudgetLine(e.target.value).catch(console.error)}
            disabled={!productionId}
            className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-500"
          >
            <option value="">{productionId ? (budgetLines.length ? "No linked budget line" : "No budget lines yet") : "Link to a production to assign budget lines"}</option>
            {budgetLines.map(({ sectionCode, line }) => (
              <option key={line.id} value={line.id}>
                {sectionCode} — {line.lineCode} — {line.description}
              </option>
            ))}
          </select>
        </label>
        {linkMessage && <p className="mt-1 text-xs text-emerald-700">{linkMessage}</p>}

        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Move to folder</span>
          <select
            value={file.folder}
            onChange={(e) => onPatch({ folder: e.target.value as JobFolder })}
            disabled={!productionId}
            className="min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"
          >
            {folders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
          </select>
        </label>

        {file.isReceipt && (
          <div className="mt-4 rounded-lg border border-gray-200 p-3">
            <h4 className="text-sm font-semibold text-gray-900">Receipt</h4>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Vendor</dt><dd>{file.receiptVendor ?? "Pending Phase 7"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Amount</dt><dd>{file.receiptAmount ? `£${(file.receiptAmount / 100).toFixed(2)}` : "Pending"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Date</dt><dd>{file.receiptDate ? new Date(file.receiptDate).toLocaleDateString("en-GB") : "Pending"}</dd></div>
            </dl>
            {!file.linkedBudgetLineId && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Assign to a budget line using the dropdown above.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function UploadChoice({ onClose, onPick }: { onClose: () => void; onPick: (mode?: UploadMode) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-3 md:grid md:place-items-center">
      <div className="rounded-lg bg-white p-4 shadow-xl md:w-80">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Upload</h3>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={18} /></button>
        </div>
        <div className="space-y-2">
          <button onClick={() => onPick("camera")} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm"><Camera size={17} /> Camera</button>
          <button onClick={() => onPick("photos")} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm"><FileImage size={17} /> Photo Library</button>
          <button onClick={() => onPick("files")} className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-gray-200 px-3 text-sm"><File size={17} /> Files App</button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button title={label} onClick={onClick} className={`grid min-h-11 min-w-11 place-items-center rounded-lg ${danger ? "text-red-500 hover:bg-red-50" : "text-gray-500 hover:bg-gray-100"}`}>
      {children}
    </button>
  );
}
