import type { ProjectSummary } from "../lib/workspace";
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import type { ProjectActionStatus } from '../lib/types';
import { actionStatuses, isOpenAction, projectLink, shortDate, type WorkspaceAction } from '../lib/workspace';

export default function Actions({ productionId }: { productionId?: string }) {
  const [rows, setRows] = useState<WorkspaceAction[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('OPEN');
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string>();
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(productionId || '');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [undo, setUndo] = useState<WorkspaceAction[]>([]);
  const [showDate, setShowDate] = useState(true);
  const [sort, setSort] = useState<'date' | 'title'>('date');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([api.get<WorkspaceAction[]>('/api/project-actions'), api.get<ProjectSummary[]>('/api/productions/summary')]).then(([actions, productions]) => {
      if (active) { setRows(actions.filter(a => !productionId || a.productionId === productionId)); setProjects(productions); }
    }).catch(() => { if (active) setError('Could not load actions. Please retry.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productionId, attempt]);

  async function update(changes: { row: WorkspaceAction; patch: Partial<WorkspaceAction> }[], remember = true) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const originals: WorkspaceAction[] = [];
    for (const { row, patch } of changes) {
      setRows(previous => previous.map(r => r.id === row.id ? { ...r, ...patch } : r));
      try {
        const saved = await api.patch<WorkspaceAction>(`/api/project-actions/actions/${row.id}`, patch);
        originals.push(row);
        setRows(previous => previous.map(r => r.id === row.id ? { ...r, ...saved } : r));
      } catch {
        setRows(previous => previous.map(r => r.id === row.id ? row : r));
        setError('An update could not be saved. That row was restored; successful changes were kept.');
      }
    }
    if (remember) setUndo(originals);
    lock.current = false; setBusy(false);
  }
  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !project || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const row = await api.post<WorkspaceAction>(`/api/project-actions/production/${project}/actions`, { title: title.trim(), status: 'TODO', actionType: 'TASK' });
      setRows(current => [...current, { ...row, production: projects.find(p => p.id === project) }]); setTitle('');
    } catch { setError('Could not create the action. Your text has been kept.'); }
    finally { lock.current = false; setBusy(false); }
  }
  const visible = rows.filter(r => (filter === 'ALL' || (filter === 'OPEN' ? isOpenAction(r) : r.status === filter)) && `${r.title} ${r.production?.title || ''} ${r.production?.jobCode || ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : (a.startAt || '9999').localeCompare(b.startAt || '9999'));
  const active = rows.find(r => r.id === detail);
  return <div className={productionId ? '' : 'workspace-page'}>
    <div className="eyebrow">{productionId ? 'Project workspace' : 'Across your productions'}</div>
    <h1 className="mt-3 text-3xl font-medium tracking-tight">Actions</h1>
    <p className="mt-2 text-sm text-stone-500">Next steps, chases and decisions. Edit directly in the table.</p>
    <div className="mt-8 flex flex-wrap gap-3 items-center">
      <label className="flex gap-2 items-center mr-auto"><Search size={16} className="text-stone-400"/><input aria-label="Search actions" className="bg-transparent outline-none text-sm" placeholder="Find an action…" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <select aria-label="Filter action status" className="workspace-select" value={filter} onChange={e => { setFilter(e.target.value); setSelected([]); }}><option value="OPEN">Open actions</option><option value="ALL">All actions</option>{Object.entries(actionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="Sort actions" className="workspace-select" value={sort} onChange={e => setSort(e.target.value as 'date' | 'title')}><option value="date">By date</option><option value="title">By title</option></select>
      <label className="text-xs text-stone-500 flex gap-1 items-center"><input type="checkbox" checked={showDate} onChange={e => setShowDate(e.target.checked)}/>Date column</label>
      {!!undo.length && <button disabled={busy} className="flex gap-1 items-center text-sm" onClick={() => { const previous = undo; setUndo([]); void update(previous.map(row => ({ row: rows.find(r => r.id === row.id)!, patch: { title: row.title, status: row.status, description: row.description } })), false); }}><Undo2 size={14}/>Undo</button>}
    </div>
    {error && <p role="alert" className="my-4 text-sm text-red-700">{error} <button className="underline" onClick={() => setAttempt(a => a + 1)}>Reload</button></p>}
    {!!selected.length && <div className="my-3 flex gap-3 items-center text-sm"><span>{selected.length} selected</span><select aria-label="Bulk update status" disabled={busy} className="workspace-select" value="" onChange={e => { void update(rows.filter(r => selected.includes(r.id)).map(row => ({ row, patch: { status: e.target.value as ProjectActionStatus } }))); }}><option value="" disabled>Change status…</option>{Object.entries(actionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button onClick={() => setSelected([])}>Clear</button></div>}
    <div className="mt-4 overflow-auto"><table className="workspace-table"><thead><tr><th className="w-10"><input aria-label="Select visible actions" type="checkbox" checked={visible.length > 0 && visible.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? visible.map(r => r.id) : [])}/></th><th className="resizable-column">Action</th>{!productionId && <th>Project</th>}<th>Status</th>{showDate && <th>Date</th>}<th></th></tr></thead><tbody>{visible.map(row => <tr key={row.id}>
      <td><input aria-label={`Select ${row.title}`} type="checkbox" checked={selected.includes(row.id)} onChange={e => setSelected(s => e.target.checked ? [...s, row.id] : s.filter(id => id !== row.id))}/></td>
      <td className="min-w-64 frozen-action"><input key={`${row.id}:${row.title}`} className="cell-input" aria-label={`Title for ${row.title}`} defaultValue={row.title} disabled={busy} onPaste={e => {
        const lines = e.clipboardData.getData('text/plain').replace(/\r/g, '').replace(/\n$/, '').split('\n');
        if (lines.length < 2) return;
        e.preventDefault();
        const start = visible.findIndex(r => r.id === row.id);
        if (lines.some(line => line.includes('\t') || !line.trim()) || start + lines.length > visible.length) {
          setError('Paste one title per line into existing rows. Add more rows first if needed.'); return;
        }
        void update(lines.map((line, index) => ({ row: visible[start + index], patch: { title: line.trim() } })));
      }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = row.title; e.currentTarget.blur(); } }} onBlur={e => { const value = e.target.value.trim(); if (value && value !== row.title) void update([{ row, patch: { title: value } }]); else e.target.value = row.title; }}/></td>
      {!productionId && <td>{row.production ? <Link className="text-stone-500 hover:underline" to={projectLink(row.productionId, 'Actions')}>{row.production.jobCode} · {row.production.title}</Link> : 'General'}</td>}
      <td><select aria-label={`Status for ${row.title}`} className="cell-input" value={row.status} disabled={busy} onChange={e => void update([{ row, patch: { status: e.target.value as ProjectActionStatus } }])}>{Object.entries(actionStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td>
      {showDate && <td className="text-stone-500 whitespace-nowrap">{shortDate(row.startAt)}</td>}<td><button className="text-xs underline" onClick={() => setDetail(row.id)}>Details</button></td>
    </tr>)}</tbody></table></div>
    {loading ? <p className="empty-state" role="status">Loading actions…</p> : !visible.length && <p className="empty-state">{query || filter !== 'OPEN' ? 'No actions match this view.' : 'No open actions. Add the next step below.'}</p>}
    <form onSubmit={add} className="mt-4 flex flex-wrap gap-2 items-center border-t border-stone-200 pt-4">
      <Plus size={16} className="text-stone-400"/><input required aria-label="New action title" className="min-w-48 flex-1 bg-transparent outline-none text-sm py-2" placeholder="Add a next step…" value={title} onChange={e => setTitle(e.target.value)}/>
      {!productionId && <select required aria-label="Project for new action" className="workspace-select max-w-60" value={project} onChange={e => setProject(e.target.value)}><option value="">Choose project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.jobCode} · {p.title}</option>)}</select>}
      <button disabled={busy || !title.trim() || !project} className="rounded bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-40">Add action</button>
    </form>
    {active && <ActionDrawer key={active.id} row={active} busy={busy} error={error} onClose={() => setDetail(undefined)} onSave={description => void update([{ row: active, patch: { description } }])}/>}
  </div>;
}
function ActionDrawer({ row, busy, error, onClose, onSave }: { row: WorkspaceAction; busy: boolean; error: string; onClose: () => void; onSave: (description: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState(row.description || '');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }} className="action-drawer">
    <div className="flex items-center justify-between"><span className="eyebrow">Action details</span><button aria-label="Close action details" onClick={onClose}><X size={20}/></button></div>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    <h2 className="mt-8 text-2xl font-medium">{row.title}</h2><p className="mt-3 text-sm text-stone-500">{row.production?.title || 'General'} · {actionStatuses[row.status]}</p>
    <label className="block mt-8 text-sm">Notes<textarea className="mt-2 w-full min-h-48 border border-stone-200 rounded p-3" value={description} onChange={e => setDescription(e.target.value)}/></label><button disabled={busy} className="mt-3 rounded bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-40" onClick={() => onSave(description)}>{busy ? 'Saving…' : 'Save notes'}</button>
  </dialog>;
}
