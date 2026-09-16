import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderOpen, RefreshCw, CloudUpload, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";

type Connection = { configured: boolean; connected: boolean; rootFolderId: string };
type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string };
type Page = { files: DriveFile[]; nextPageToken?: string };
type ProjectDrive = { driveFolderId: string | null; driveFolderName: string | null; counts: Record<string, number>; failures: { id: string; originalFilename: string; driveSyncError: string }[] };
const folderType = "application/vnd.google-apps.folder";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50";
const message = (error: unknown) => error instanceof Error ? error.message : "Could not reach Google Drive.";

export default function DriveWorkspace({ productionId }: { productionId?: string }) {
  const [connection, setConnection] = useState<Connection>();
  const [project, setProject] = useState<ProjectDrive>();
  const [folders, setFolders] = useState<Page>({ files: [] });
  const [selection, setSelection] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [browse, setBrowse] = useState(false);
  const refresh = useCallback(async () => {
    const status = await api.get<Connection>("/api/drive/status");
    setConnection(status);
    if (productionId) setProject(await api.get<ProjectDrive>(`/api/drive/projects/${productionId}`));
  }, [productionId]);
  useEffect(() => {
    let active = true;
    setConnection(undefined); setProject(undefined); setFolders({ files: [] }); setError(""); setBrowse(false);
    Promise.all([api.get<Connection>("/api/drive/status"), productionId ? api.get<ProjectDrive>(`/api/drive/projects/${productionId}`) : Promise.resolve(undefined)])
      .then(([status, data]) => { if (active) { setConnection(status); setProject(data); } }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [productionId, attempt]);
  useEffect(() => {
    if (!connection?.connected || !productionId || project?.driveFolderId) return;
    let active = true;
    api.get<Page>("/api/drive/folders").then(data => { if (active) setFolders(data); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [connection?.connected, productionId, project?.driveFolderId]);
  useEffect(() => {
    if (!productionId || !connection?.connected) return;
    let active = true;
    const timer = setInterval(() => { api.get<ProjectDrive>(`/api/drive/projects/${productionId}`).then(data => { if (active) setProject(data); }).catch(() => { if (active) setError("Could not refresh publishing status. Retry to check your files."); }); }, 15_000);
    return () => { active = false; clearInterval(timer); };
  }, [productionId, connection?.connected]);
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await refresh(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className="rounded-lg border border-stone-200 bg-[#fafaf8] p-4" aria-label="Google Drive workspace">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3"><FolderOpen size={20} className="mt-0.5 text-emerald-700"/><div><h2 className="text-sm font-semibold">{project?.driveFolderName || "Project files & exports"}</h2><p className="mt-1 text-xs text-stone-500">{project?.driveFolderId ? "New uploads and filed exports are automatically published to this project’s Drive folder." : "Keep project documents and published exports together in Google Drive."}</p></div></div>
      {connection && <a className={button} href={`https://drive.google.com/drive/folders/${project?.driveFolderId || connection.rootFolderId}`} target="_blank" rel="noreferrer">Open {project?.driveFolderId ? "project" : "_PROJECTS"} <ExternalLink size={13}/></a>}
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-red-700">{error} <button className="underline" onClick={() => setAttempt(a => a + 1)}>Retry</button></p>}
    {!connection && !error && <p role="status" className="mt-3 text-xs text-stone-500">Checking Drive connection…</p>}
    {connection && !connection.connected && <div className="mt-4 flex flex-wrap items-center gap-3">{connection.configured ? <a className={button} href="/api/drive/oauth/start">Connect Google Drive</a> : <span className="text-xs text-amber-800">Google Drive needs server configuration before you can connect.</span>}<span className="text-xs text-stone-500">Connect the Google account that manages your project folders.</span></div>}
    {connection?.connected && !productionId && <p className="mt-3 text-xs text-emerald-800">Drive connected. Select a project below to link its folder, browse documents and manage publishing. <a className="ml-2 underline" href="/api/drive/oauth/start">Reconnect</a></p>}
    {connection?.connected && productionId && project && !project.driveFolderId && <div className="mt-4 space-y-2"><label className="block text-xs font-medium" htmlFor={`drive-folder-${productionId}`}>Link this project to its existing Drive folder</label><div className="flex flex-wrap gap-2"><select id={`drive-folder-${productionId}`} className="min-h-10 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 text-sm" value={selection} onChange={e => setSelection(e.target.value)}><option value="">Choose a project folder…</option>{folders.files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select><button className={button} disabled={busy || !selection} onClick={() => void act(async () => { await api.post(`/api/drive/projects/${productionId}/link`, { folderId: selection }); setNotice("Project folder linked. New files will publish automatically."); })}>Link folder</button></div>{folders.nextPageToken && <button className="text-xs underline" disabled={busy} onClick={() => void act(async () => { const page = await api.get<Page>(`/api/drive/folders?pageToken=${encodeURIComponent(folders.nextPageToken!)}`); setFolders(old => ({ ...page, files: [...old.files, ...page.files] })); })}>More folders</button>}<p className="text-xs text-stone-500">Existing documents stay in place. App uploads and exports use a Production Hub subfolder.</p><button className="text-xs text-emerald-800 underline underline-offset-4 disabled:opacity-50" disabled={busy} onClick={() => void act(async () => { await api.post(`/api/drive/projects/${productionId}/create-folder`, {}); setNotice("Project folder ready. New files will publish automatically."); })}>New job? Create its project folder</button></div>}
    {project?.driveFolderId && <div className="mt-4"><div className="flex flex-wrap items-center gap-2"><button className={button} onClick={() => setBrowse(v => !v)}><FolderOpen size={14}/>{browse ? "Hide documents" : "Browse Drive"}</button><button className={button} disabled={busy || !connection?.connected} onClick={() => void act(async () => { const result = await api.post<{ queued: number }>(`/api/drive/projects/${productionId}/publish`, {}); setNotice(result.queued ? `${result.queued} files queued for Drive.` : "No files need publishing."); })}><CloudUpload size={14}/>Publish existing files / retry</button><button aria-label="Refresh Drive status" className={button} disabled={busy} onClick={() => void act(async () => {})}><RefreshCw size={14}/></button><span className="text-xs text-stone-500">{project.counts.SYNCED || 0} saved · {(project.counts.PENDING || 0) + (project.counts.SYNCING || 0)} waiting · {project.counts.ERROR || 0} need attention · {project.counts.LOCAL || 0} local</span></div>{project.failures.map(f => <p key={f.id} className="mt-2 text-xs text-red-700">{f.originalFilename}: {f.driveSyncError}</p>)}{browse && productionId && <DriveBrowser key={productionId} productionId={productionId} root={{ id: project.driveFolderId, name: project.driveFolderName || "Project" }}/>}</div>}
    {notice && <p role="status" className="mt-3 text-xs text-emerald-800">{notice}</p>}
  </section>;
}

function DriveBrowser({ productionId, root }: { productionId: string; root: { id: string; name: string } }) {
  const [trail, setTrail] = useState([root]);
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [attempt, setAttempt] = useState(0);
  const folder = trail[trail.length - 1];
  useEffect(() => {
    const refreshOnReturn = () => setAttempt(value => value + 1);
    window.addEventListener("focus", refreshOnReturn);
    return () => window.removeEventListener("focus", refreshOnReturn);
  }, []);
  useEffect(() => {
    let active = true;
    setPage(undefined); setError("");
    api.get<Page>(`/api/drive/projects/${productionId}/browse?folderId=${encodeURIComponent(folder.id)}&pageToken=${encodeURIComponent(token)}`).then(data => { if (active) setPage(data); }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [productionId, folder.id, token, attempt]);
  return <div className="mt-4 border-t border-stone-200 pt-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-stone-500">Open a document to edit it in Google. This list refreshes when you return. PDF exports remain snapshots.</p><button className={button} onClick={() => setAttempt(value => value + 1)} aria-label="Refresh Drive files"><RefreshCw size={13}/>Refresh</button></div><nav aria-label="Drive folders" className="mb-3 flex flex-wrap items-center gap-1 text-xs">{trail.map((item, index) => <span key={item.id} className="inline-flex items-center gap-1"><button className="hover:underline" onClick={() => { setTrail(trail.slice(0, index + 1)); setToken(""); }}>{item.name}</button><ChevronRight size={12}/></span>)}</nav>{error ? <p role="alert" className="text-xs text-red-700">{error} <button className="underline" onClick={() => setAttempt(a => a + 1)}>Retry</button></p> : !page ? <p role="status" className="text-xs text-stone-500">Loading documents…</p> : <><div className="max-h-72 overflow-auto divide-y divide-stone-100">{page.files.map(file => <div key={file.id} className="flex min-h-10 items-center gap-2 py-2 text-sm">{file.mimeType === folderType ? <button className="flex items-center gap-2 hover:underline" onClick={() => { setTrail([...trail, { id: file.id, name: file.name }]); setToken(""); }}><FolderOpen size={15}/>{file.name}</button> : file.webViewLink ? <a className="flex items-center gap-2 hover:underline" href={file.webViewLink} target="_blank" rel="noreferrer">{file.name}<ExternalLink size={12}/></a> : <span>{file.name}</span>}</div>)}</div>{!page.files.length && <p className="text-xs text-stone-500">This folder is empty.</p>}<div className="mt-2 flex gap-3">{token && <button className="text-xs underline" onClick={() => setToken("")}>First page</button>}{page.nextPageToken && <button className="text-xs underline" onClick={() => setToken(page.nextPageToken!)}>Next page</button>}</div></>}</div>;
}
