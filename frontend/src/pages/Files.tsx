import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, File, FileImage, FileText, FileVideo, FolderOpen, Search } from "lucide-react";
import { api } from "../lib/api";
import type { FileListResponse, JobFile, JobFolder, Production } from "../lib/types";
import { formatBytes, JOB_FOLDERS } from "../lib/types";
import { PreviewPanel } from "../components/files/FileBrowser";

function iconFor(file: JobFile) {
  if (file.mimeType === "application/pdf") return <FileText size={18} className="text-red-500" />;
  if (file.mimeType.startsWith("image/")) return <FileImage size={18} className="text-emerald-600" />;
  if (file.mimeType.startsWith("video/")) return <FileVideo size={18} className="text-blue-600" />;
  return <File size={18} className="text-gray-500" />;
}

export default function Files() {
  const [files, setFiles] = useState<JobFile[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [selectedFile, setSelectedFile] = useState<JobFile | null>(null);
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState<JobFolder | "All">("All");
  const [productionId, setProductionId] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (folder !== "All") params.set("folder", folder);
    if (productionId) params.set("productionId", productionId);
    return params.toString();
  }, [folder, page, productionId, search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<FileListResponse>(`/api/files/all?${query}`);
      setFiles((items) => page === 1 ? data.files : [...items, ...data.files]);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => { api.get<Production[]>("/api/productions?includeWrapped=true").then(setProductions).catch(console.error); }, []);
  useEffect(() => { load().catch(console.error); }, [load]);
  useEffect(() => { setPage(1); }, [folder, productionId, search]);

  async function patchSelected(patch: Partial<JobFile>) {
    if (!selectedFile) return;
    const updated = await api.patch<JobFile>(`/api/files/${selectedFile.id}`, patch);
    setSelectedFile(updated);
    setFiles((items) => items.map((file) => file.id === updated.id ? { ...file, ...updated, production: file.production } : file));
  }

  return (
    <div className="flex h-full bg-gray-50">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-gray-200 bg-white p-4">
          <h1 className="mb-3 text-xl font-semibold text-gray-900">Files</h1>
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files"
              className="min-h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-gray-400"
            />
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select value={folder} onChange={(e) => setFolder(e.target.value as JobFolder | "All")} className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              <option value="All">All folders</option>
              {JOB_FOLDERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={productionId} onChange={(e) => setProductionId(e.target.value)} className="min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm">
              <option value="">All jobs</option>
              {productions.map((production) => (
                <option key={production.id} value={production.id}>
                  {production.jobCode ?? "No code"} — {production.clientName ?? production.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading && files.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-gray-400">Loading…</div>
          ) : files.length === 0 ? (
            <div className="grid h-72 place-items-center rounded-lg border border-dashed border-gray-200 bg-white p-8 text-center">
              <div>
                <FolderOpen size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">No files yet</p>
                <p className="mt-1 text-xs text-gray-400">Files uploaded to productions will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className="flex min-h-[56px] w-full items-center gap-3 rounded-lg bg-white p-2 text-left hover:bg-gray-50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100">{iconFor(file)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{file.originalFilename}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {file.production?.jobCode ?? "No code"} · {file.production?.clientName ?? file.production?.title ?? "No job"} · {file.folder}
                    </span>
                  </span>
                  <span className="hidden text-right text-xs text-gray-500 sm:block">
                    {formatBytes(file.sizeBytes)}<br />
                    {new Date(file.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <a
                    href={`/api/files/${file.id}/download`}
                    onClick={(e) => e.stopPropagation()}
                    className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    <Download size={16} />
                  </a>
                </button>
              ))}
              {hasMore && (
                <button onClick={() => setPage((p) => p + 1)} className="mt-3 min-h-11 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700">
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedFile && (
        <PreviewPanel
          file={selectedFile}
          folders={JOB_FOLDERS}
          onClose={() => setSelectedFile(null)}
          onPatch={patchSelected}
        />
      )}
    </div>
  );
}
