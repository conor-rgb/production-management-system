import type { ProjectSummary } from "../lib/workspace";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { PRODUCTION_STATUS_LABELS, } from '../lib/types';
import { actionStatuses, isOpenAction, projectLink, shortDate, type WorkspaceAction } from '../lib/workspace';

export default function Home() {
  const { email } = useAuth();
  const [data, setData] = useState<{ projects: ProjectSummary[]; actions: WorkspaceAction[] }>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([api.get<ProjectSummary[]>('/api/productions/summary'), api.get<WorkspaceAction[]>('/api/project-actions')])
      .then(([projects, actions]) => { if (active) setData({ projects, actions }); })
      .catch(() => { if (active) setError('Could not load your workspace.'); });
    return () => { active = false; };
  }, [attempt]);
  const projects = data?.projects.filter(p => !['CLOSED', 'WRAPPED'].includes(p.status)) ?? [];
  const open = data?.actions.filter(isOpenAction) ?? [];
  const attention = [...open].sort((a, b) => Number(b.status === 'BLOCKED') - Number(a.status === 'BLOCKED') || (a.startAt || '9999').localeCompare(b.startAt || '9999')).slice(0, 8);
  const hour = new Date().getHours();
  return <div className="workspace-page">
    <div className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    <h1 className="mt-4 text-3xl font-medium tracking-tight">Good {hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}{email ? `, ${email.split('@')[0].split(/[._]/)[0].replace(/^./, c => c.toUpperCase())}` : ''}.</h1>
    <p className="mt-2 text-sm text-stone-500">Your productions, moving forward.</p>
    {error ? <div role="alert" className="mt-8">{error} <button className="underline" onClick={() => setAttempt(attempt + 1)}>Retry</button></div> : !data ? <p className="mt-8" role="status">Loading workspace…</p> : <>
      <section className="mt-12">
        <div className="section-heading"><h2>Things needing attention <span className="ml-2 text-stone-400">{open.length}</span></h2><Link to="/actions">All actions <ArrowUpRight size={14}/></Link></div>
        {attention.length ? <div className="border-t border-stone-200">{attention.map(action => <Link className="attention-row" key={action.id} to={action.productionId ? projectLink(action.productionId, 'Actions') : '/actions'}>
          <span className={`status-dot ${action.status === 'BLOCKED' ? 'bg-amber-600' : action.status === 'WAITING' ? 'bg-stone-300' : 'bg-emerald-700'}`} />
          <span className="min-w-0 flex-1"><span className="block text-xs text-stone-500">{action.production ? `${action.production.title} · ${action.production.jobCode || 'No job number'}` : 'General'}</span><span className="block truncate mt-1">{action.title}</span></span>
          <span className="hidden text-xs text-stone-500 sm:block">{actionStatuses[action.status]}</span><span className="w-16 text-right text-xs text-stone-500">{shortDate(action.startAt)}</span>
        </Link>)}</div> : <p className="empty-state">No outstanding actions. Open a project to add the next steps.</p>}
      </section>
      <section className="mt-12"><div className="section-heading"><h2>Active projects <span className="ml-2 text-stone-400">{projects.length}</span></h2><Link to="/productions">All projects <ArrowUpRight size={14}/></Link></div>
        <label className="flex items-center gap-2 mb-4 text-stone-400"><Search size={16}/><input aria-label="Filter active projects" placeholder="Filter projects…" className="bg-transparent text-sm outline-none text-stone-800" value={query} onChange={e => setQuery(e.target.value)}/></label>
        <div className="overflow-x-auto"><table className="workspace-table"><thead><tr><th>Job</th><th>Client</th><th>Project</th><th>Stage</th><th>Next</th></tr></thead><tbody>{projects.filter(p => `${p.jobCode} ${p.clientName} ${p.title}`.toLowerCase().includes(query.toLowerCase())).map(p => <tr key={p.id}><td className="font-mono text-xs">{p.jobCode || '—'}</td><td>{p.clientName || '—'}</td><td><Link className="font-medium hover:underline" to={projectLink(p.id)}>{p.title}</Link></td><td><span className="status-dot bg-emerald-700 inline-block mr-2"/>{PRODUCTION_STATUS_LABELS[p.status]}</td><td className="text-stone-500">{open.find(a => a.productionId === p.id)?.title || (p.nextDate ? shortDate(p.nextDate.date) : 'No next action')}</td></tr>)}</tbody></table></div>
        {!projects.length && <p className="empty-state">No active projects yet. <Link className="underline" to="/productions">Create your first project</Link>.</p>}
      </section>
    </>}
  </div>;
}
