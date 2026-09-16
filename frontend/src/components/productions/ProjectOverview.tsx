import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { DATE_TYPE_LABELS, PRODUCTION_STATUS_LABELS, type Production } from '../../lib/types';
import { actionStatuses, isOpenAction, shortDate, type WorkspaceAction } from '../../lib/workspace';

export default function ProjectOverview({ production, onActions, onCrew }: { production: Production; onActions: () => void; onCrew: () => void }) {
  const [actions, setActions] = useState<WorkspaceAction[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get<WorkspaceAction[]>('/api/project-actions').then(data => { if (active) setActions(data.filter(a => a.productionId === production.id)); }).catch(() => { if (active) setError('Actions could not be loaded. Open Actions to retry.'); });
    return () => { active = false; };
  }, [production.id]);
  const next = production.dates.filter(d => new Date(d.date).getTime() >= new Date().setHours(0, 0, 0, 0)).sort((a, b) => a.date.localeCompare(b.date));
  const confirmed = production.crewMembers.filter(c => c.status === 'CONFIRMED' && !c.hiddenFromCrewList);
  const open = actions?.filter(isOpenAction).sort((a, b) => Number(b.status === 'BLOCKED') - Number(a.status === 'BLOCKED'));
  const recent = actions ? [...actions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5) : [];
  return <div className="max-w-5xl mx-auto py-5">
    <p className="eyebrow">{production.jobCode || 'Project'}</p><h1 className="text-4xl tracking-tight font-medium mt-3">{production.title}</h1>
    <p className="mt-3 text-sm uppercase tracking-wide text-stone-500">{[production.clientName, production.brand, next[0]?.location].filter(Boolean).join(' · ') || 'Project details to be confirmed'}</p>
    <div className="flex flex-wrap gap-12 mt-8 pb-8 border-b border-stone-200"><div><p className="eyebrow">Stage</p><p className="mt-2 text-sm"><span className="status-dot inline-block mr-2 bg-emerald-700"/>{PRODUCTION_STATUS_LABELS[production.status]}</p></div><div><p className="eyebrow">Next date</p><p className="mt-2 text-sm">{next[0] ? `${shortDate(next[0].date)} · ${next[0].label || DATE_TYPE_LABELS[next[0].dateType]}` : 'Not scheduled'}</p></div><div><p className="eyebrow">Crew confirmed</p><button onClick={onCrew} className="mt-2 text-sm hover:underline">{confirmed.length} people ↗</button></div></div>
    <div className="grid gap-10 lg:grid-cols-2 mt-8"><section><div className="section-heading"><h2>Next up</h2><button className="text-xs text-stone-500" onClick={onActions}>All actions ↗</button></div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : !actions ? <p className="empty-state">Loading actions…</p> : open?.length ? open.slice(0, 6).map(a => <button key={a.id} onClick={onActions} className="attention-row w-full text-left"><span className={`status-dot ${a.status === 'BLOCKED' ? 'bg-amber-600' : 'bg-stone-400'}`}/><span className="flex-1">{a.title}</span><span className="text-xs text-stone-500">{actionStatuses[a.status]}</span></button>) : <p className="empty-state">No outstanding actions.</p>}
    </section><section><div className="section-heading"><h2>Production</h2></div>{next.slice(0, 4).map(d => <div key={d.id} className="attention-row"><span className="w-14 text-stone-500 text-xs">{shortDate(d.date)}</span><div><p>{d.label || DATE_TYPE_LABELS[d.dateType]}</p><p className="text-xs text-stone-500 mt-1">{d.location || 'Location to be confirmed'}</p></div></div>)}{!next.length && <p className="empty-state">No upcoming dates.</p>}
      <p className="eyebrow mt-6">Confirmed crew</p><p className="mt-2 text-sm text-stone-600">{confirmed.map(c => c.name).join(', ') || 'No crew confirmed yet.'}</p>
    </section></div>
    <section className="mt-10"><div className="section-heading"><h2>Recent action updates</h2></div>{recent.map(a => <div key={a.id} className="flex justify-between gap-4 py-3 border-b border-stone-200 text-sm"><span>{a.title} <span className="text-stone-500">· {actionStatuses[a.status]}</span></span><span className="text-stone-500 text-xs whitespace-nowrap">{shortDate(a.updatedAt)}</span></div>)}{actions && !recent.length && <p className="empty-state">No action updates yet.</p>}</section>
  </div>;
}
