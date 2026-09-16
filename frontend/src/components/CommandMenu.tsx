import type { ProjectSummary } from "../lib/workspace";
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api';
import { projectLink } from '../lib/workspace';
const destinations = [{ title: 'What needs my attention today?', path: '/' }, { title: 'Actions', path: '/actions' }, { title: 'Projects', path: '/productions' }, { title: 'People', path: '/contacts' }, { title: 'Finance', path: '/budgets' }, { title: 'Files & exports', path: '/files' }];
export default function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (trigger.current?.offsetParent !== null && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); } };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal(); setQuery(''); setError('');
    let active = true;
    api.get<ProjectSummary[]>('/api/productions/summary').then(data => { if (active) setProjects(data); }).catch(() => { if (active) setError('Project search is unavailable. Navigation is still available.'); });
    return () => { active = false; };
  }, [open]);
  const results = [...destinations, ...projects.map(p => ({ title: `${p.jobCode || ''} · ${p.title}`, path: projectLink(p.id) }))].filter(r => r.title.toLowerCase().includes(query.toLowerCase())).slice(0, 12);
  function go(path: string) { setOpen(false); navigate(path); }
  return <><button ref={trigger} onClick={() => setOpen(true)} className="command-trigger"><Search size={15}/><span>Ask Unlimited…</span><kbd className="ml-auto text-[10px]">⌘ K</kbd></button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) setOpen(false); }} className="command-dialog">
      <div className="flex gap-3 items-center p-4 border-b border-stone-200"><Search size={18}/><input autoFocus aria-label="Search projects and navigation" placeholder="Find a project or jump to…" value={query} onChange={e => setQuery(e.target.value)} className="flex-1 min-w-0 outline-none" onKeyDown={e => {
        if (e.key === 'Enter' && results[0]) go(results[0].path);
        if (e.key === 'ArrowDown') { e.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('[data-result]')?.focus(); }
      }}/><button aria-label="Close search" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <div className="p-2">{results.map(result => <button data-result key={result.path + result.title} className="block w-full rounded px-3 py-3 text-left text-sm hover:bg-stone-100 focus:bg-stone-100" onClick={() => go(result.path)}>{result.title}</button>)}{!results.length && <p className="p-4 text-sm text-stone-500">No matching projects or pages.</p>}</div>
      <p className="p-4 border-t border-stone-200 text-xs text-stone-500">{error || 'Project search and shortcuts · AI suggestions are not connected yet.'}</p>
    </dialog>
  </>;
}
