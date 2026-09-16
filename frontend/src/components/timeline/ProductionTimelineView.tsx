import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Mail, Plus, X } from "lucide-react";
import { api } from "../../lib/api";
import type { ProductionDate, ProjectAction, ProjectActionStatus, ProjectActionType, ProjectWorkstream } from "../../lib/types";

type TimelineResponse = {
  production: { id: string; title: string; jobCode?: string | null; clientName?: string | null; brand?: string | null };
  workstreams: ProjectWorkstream[];
  actions: ProjectAction[];
  dates: ProductionDate[];
  unassignedOptionGroups: TimelineOptionGroup[];
};

type TimelineOptionGroup = NonNullable<ProjectWorkstream["optionGroups"]>[number];

type DraftAction = {
  id?: string;
  title: string;
  description: string;
  workstreamId: string;
  actionType: ProjectActionType;
  status: ProjectActionStatus;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  visibility: "INTERNAL" | "CLIENT";
  location: string;
  zoomLink: string;
};

const STATUS_LABELS: Record<ProjectActionStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  DONE: "Done",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<ProjectActionStatus, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  WAITING: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
  BLOCKED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-50 text-gray-400",
};

const ACTION_TYPES: ProjectActionType[] = ["TASK", "DEADLINE", "EVENT", "MEETING", "TRAVEL", "SHOOT", "REMINDER"];
const STATUSES: ProjectActionStatus[] = ["TODO", "IN_PROGRESS", "WAITING", "DONE", "BLOCKED", "CANCELLED"];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function productionDateLabel(date: ProductionDate): string {
  const base = date.label || date.dateType.replace(/_/g, " ");
  return `${base}${date.status === "CONFIRMED" ? " confirmed" : date.status === "OPTIONED" ? " optioned" : ""}`;
}

function blankAction(workstreamId: string, date: Date): DraftAction {
  return {
    title: "",
    description: "",
    workstreamId,
    actionType: "TASK",
    status: "TODO",
    startAt: isoDate(date),
    endAt: "",
    isAllDay: true,
    visibility: "INTERNAL",
    location: "",
    zoomLink: "",
  };
}

export default function ProductionTimelineView({ productionId }: { productionId: string }) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [start, setStart] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [editing, setEditing] = useState<DraftAction | null>(null);
  const [editingLane, setEditingLane] = useState<{ id?: string; name: string; color: string; optionGroupIds: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const next = await api.get<TimelineResponse>(`/api/project-actions/production/${productionId}`);
    setData(next);
  }, [productionId]);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load timeline"));
  }, [load]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  }), [start]);

  const actionsByLaneDay = useMemo(() => {
    const map = new Map<string, ProjectAction[]>();
    for (const action of data?.actions ?? []) {
      if (!action.workstreamId || !action.startAt) continue;
      const key = `${action.workstreamId}:${dateKey(action.startAt)}`;
      map.set(key, [...(map.get(key) ?? []), action]);
    }
    return map;
  }, [data?.actions]);

  const datesByDay = useMemo(() => {
    const map = new Map<string, ProductionDate[]>();
    for (const date of data?.dates ?? []) {
      const key = dateKey(date.date);
      map.set(key, [...(map.get(key) ?? []), date]);
    }
    return map;
  }, [data?.dates]);

  const workstreams = useMemo(() => data?.workstreams ?? [], [data?.workstreams]);
  const allOptionGroups = useMemo(() => {
    const grouped = workstreams.flatMap((lane) => lane.optionGroups ?? []);
    return [...grouped, ...(data?.unassignedOptionGroups ?? [])].filter((group, index, list) => list.findIndex((item) => item.id === group.id) === index);
  }, [data?.unassignedOptionGroups, workstreams]);

  function openAction(action: ProjectAction) {
    setEditing({
      id: action.id,
      title: action.title,
      description: action.description ?? "",
      workstreamId: action.workstreamId ?? workstreams[0]?.id ?? "",
      actionType: action.actionType,
      status: action.status,
      startAt: action.startAt ? dateKey(action.startAt) : "",
      endAt: action.endAt ? dateKey(action.endAt) : "",
      isAllDay: action.isAllDay,
      visibility: action.visibility,
      location: action.location ?? "",
      zoomLink: action.zoomLink ?? "",
    });
  }

  async function saveAction() {
    if (!editing?.title.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      title: editing.title.trim(),
      description: editing.description.trim() || null,
      workstreamId: editing.workstreamId || null,
      actionType: editing.actionType,
      status: editing.status,
      startAt: editing.startAt ? new Date(`${editing.startAt}T09:00:00`).toISOString() : null,
      endAt: editing.endAt ? new Date(`${editing.endAt}T10:00:00`).toISOString() : null,
      isAllDay: editing.isAllDay,
      visibility: editing.visibility,
      location: editing.location.trim() || null,
      zoomLink: editing.zoomLink.trim() || null,
    };
    try {
      if (editing.id) {
        await api.patch<ProjectAction>(`/api/project-actions/actions/${editing.id}`, payload);
      } else {
        await api.post<ProjectAction>(`/api/project-actions/production/${productionId}/actions`, payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save action");
    } finally {
      setSaving(false);
    }
  }

  async function removeAction() {
    if (!editing?.id) return;
    await api.delete(`/api/project-actions/actions/${editing.id}`);
    setEditing(null);
    await load();
  }

  async function saveLane() {
    if (!editingLane?.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: editingLane.name.trim(),
        color: editingLane.color || null,
        optionGroupIds: editingLane.optionGroupIds,
      };
      const lane = editingLane.id
        ? await api.patch<ProjectWorkstream>(`/api/project-actions/workstreams/${editingLane.id}`, payload)
        : await api.post<ProjectWorkstream>(`/api/project-actions/production/${productionId}/workstreams`, payload);
      await api.patch(`/api/project-actions/workstreams/${lane.id}/option-groups`, { optionGroupIds: editingLane.optionGroupIds });
      setEditingLane(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workstream");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#1f1f1f]">
      <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-[#dcdfe3] px-4">
        <div>
          <p className="text-[13px] font-semibold">Timeline</p>
          <p className="text-[11px] text-gray-500">Build project lanes manually, then attach the option sheets that feed each lane.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setStart((current) => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 bg-white hover:bg-gray-50"><ChevronLeft size={15} /></button>
          <button onClick={() => setStart(new Date())} className="h-8 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium hover:bg-gray-50">Today</button>
          <button onClick={() => setStart((current) => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })} className="grid h-8 w-8 place-items-center rounded-md border border-gray-200 bg-white hover:bg-gray-50"><ChevronRight size={15} /></button>
          <button onClick={() => setEditingLane({ name: "", color: "#f7c59f", optionGroupIds: [] })} className="flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 hover:bg-gray-50"><Plus size={14} /> Lane</button>
          <button onClick={() => setEditing(blankAction(workstreams[0]?.id ?? "", start))} className="flex h-8 items-center gap-1.5 rounded-md bg-[#101827] px-3 text-[12px] font-medium text-white"><Plus size={14} /> Action</button>
        </div>
      </div>

      {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-700">{error}</div>}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[1180px]">
          <div className="sticky top-0 z-10 grid grid-cols-[190px_repeat(14,minmax(110px,1fr))] border-b border-[#dcdfe3] bg-[#f7f7f5]">
            <div className="border-r border-[#dcdfe3] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">Workstream</div>
            {days.map((day) => (
              <div key={day.toISOString()} className="min-h-[42px] border-r border-[#e6e6e3] px-2 py-1.5">
                <p className="text-[11px] font-semibold text-gray-800">{shortDate(day)}</p>
                {(datesByDay.get(isoDate(day)) ?? []).map((date) => (
                  <p key={date.id} className="mt-0.5 truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{productionDateLabel(date)}</p>
                ))}
              </div>
            ))}
          </div>

          {workstreams.length === 0 ? (
            <div className="grid h-64 place-items-center text-center text-[13px] text-gray-500">
              <div>
                <p className="font-medium text-gray-700">No workstream lanes yet.</p>
                <button onClick={() => setEditingLane({ name: "Photo", color: "#f7c59f", optionGroupIds: [] })} className="mt-3 rounded-md bg-[#101827] px-3 py-2 text-[12px] font-medium text-white">Create first lane</button>
              </div>
            </div>
          ) : workstreams.map((lane) => (
            <div key={lane.id} className="grid min-h-[88px] grid-cols-[190px_repeat(14,minmax(110px,1fr))] border-b border-[#ededeb]">
              <div className="border-r border-[#e6e6e3] px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: lane.color ?? "#d9d9d6" }} />
                  <p className="truncate text-[13px] font-semibold text-gray-900">{lane.name}</p>
                  <button
                    onClick={() => setEditingLane({ id: lane.id, name: lane.name, color: lane.color ?? "#f7c59f", optionGroupIds: (lane.optionGroups ?? []).map((group) => group.id) })}
                    className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    Sheets
                  </button>
                </div>
                {(lane.optionGroups ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(lane.optionGroups ?? []).map((group) => (
                      <span key={group.id} className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">{group.name}</span>
                    ))}
                  </div>
                )}
                <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-gray-500">
                  {(lane.optionGroups ?? []).flatMap((group) => group.requirements ?? []).slice(0, 4).map((requirement) => {
                    const confirmed = requirement.assignments?.find((assignment) => assignment.candidate?.name);
                    return confirmed ? `${requirement.displayLabel}: ${confirmed.candidate?.name}` : requirement.displayLabel;
                  }).join(" · ") || "No required roles yet"}
                </p>
              </div>
              {days.map((day) => {
                const key = `${lane.id}:${isoDate(day)}`;
                const actions = actionsByLaneDay.get(key) ?? [];
                return (
                  <div
                    key={key}
                    onDoubleClick={() => setEditing(blankAction(lane.id, day))}
                    className="min-h-[88px] border-r border-[#f0f0ee] p-1.5 hover:bg-[#fbfbfa]"
                    title="Double click to add an action"
                  >
                    {actions.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => openAction(action)}
                        className="mb-1 w-full rounded border border-white/60 px-2 py-1.5 text-left shadow-sm"
                        style={{ background: lane.color ? `${lane.color}55` : "#f0f0ee" }}
                      >
                        <span className="block truncate text-[11px] font-semibold text-gray-900">{action.title}</span>
                        <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLES[action.status]}`}>{STATUS_LABELS[action.status]}</span>
                        {action.emailMessageId && <Mail size={11} className="ml-1 inline text-gray-500" />}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-y-0 right-0 z-[700] w-[380px] border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
            <p className="text-[14px] font-semibold">{editing.id ? "Edit action" : "New action"}</p>
            <button onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-gray-100"><X size={17} /></button>
          </div>
          <div className="space-y-3 p-4">
            <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Title</label>
            <input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="h-10 w-full rounded-md border border-gray-200 px-3 text-[13px] outline-none focus:border-gray-900" autoFocus />

            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] text-gray-500">Lane<select value={editing.workstreamId} onChange={(event) => setEditing({ ...editing, workstreamId: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px]">{workstreams.map((lane) => <option key={lane.id} value={lane.id}>{lane.name}</option>)}</select></label>
              <label className="text-[12px] text-gray-500">Type<select value={editing.actionType} onChange={(event) => setEditing({ ...editing, actionType: event.target.value as ProjectActionType })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px]">{ACTION_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] text-gray-500">Date<input type="date" value={editing.startAt} onChange={(event) => setEditing({ ...editing, startAt: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-[12px]" /></label>
              <label className="text-[12px] text-gray-500">Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value as ProjectActionStatus })} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px]">{STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label>
            </div>
            <label className="block text-[12px] text-gray-500">Location<input value={editing.location} onChange={(event) => setEditing({ ...editing, location: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-[12px]" /></label>
            <label className="block text-[12px] text-gray-500">Zoom / link<input value={editing.zoomLink} onChange={(event) => setEditing({ ...editing, zoomLink: event.target.value })} className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-[12px]" /></label>
            <label className="block text-[12px] text-gray-500">Notes<textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} rows={5} className="mt-1 w-full resize-none rounded-md border border-gray-200 p-2 text-[12px]" /></label>
            <div className="flex items-center justify-between pt-2">
              {editing.id ? <button onClick={removeAction} className="text-[12px] font-medium text-red-500">Delete</button> : <span />}
              <button onClick={saveAction} disabled={saving || !editing.title.trim()} className="flex h-9 items-center gap-2 rounded-md bg-[#101827] px-4 text-[12px] font-semibold text-white disabled:opacity-50">
                <Check size={14} /> {saving ? "Saving..." : "Save action"}
              </button>
            </div>
            <div className="rounded-md bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">
              <CalendarDays size={13} className="mr-1 inline" /> Dated actions are written to Google Calendar, so reminders and phone notifications can be managed there.
            </div>
          </div>
        </div>
      )}

      {editingLane && (
        <div className="fixed inset-y-0 right-0 z-[710] w-[380px] border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex h-12 items-center justify-between border-b border-gray-200 px-4">
            <p className="text-[14px] font-semibold">{editingLane.id ? "Edit workstream" : "New workstream"}</p>
            <button onClick={() => setEditingLane(null)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-gray-100"><X size={17} /></button>
          </div>
          <div className="space-y-4 p-4">
            <label className="block text-[12px] text-gray-500">Lane name<input value={editingLane.name} onChange={(event) => setEditingLane({ ...editingLane, name: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-[13px] outline-none focus:border-gray-900" autoFocus /></label>
            <label className="block text-[12px] text-gray-500">Color<input type="color" value={editingLane.color} onChange={(event) => setEditingLane({ ...editingLane, color: event.target.value })} className="mt-1 h-10 w-20 rounded-md border border-gray-200 bg-white p-1" /></label>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">Option sheets feeding this lane</p>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">Example: a Photo lane can contain Photographer, Camera Kit, Digital Tech, and Photo Assistant sheets. Individual slots still live inside each sheet.</p>
              <div className="mt-3 max-h-[360px] space-y-1 overflow-auto rounded-md border border-gray-200 p-2">
                {allOptionGroups.length === 0 ? (
                  <p className="p-2 text-[12px] text-gray-400">No option sheets yet.</p>
                ) : allOptionGroups.map((group) => {
                  const checked = editingLane.optionGroupIds.includes(group.id);
                  return (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-[12px] hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => setEditingLane({
                          ...editingLane,
                          optionGroupIds: event.target.checked
                            ? [...editingLane.optionGroupIds, group.id]
                            : editingLane.optionGroupIds.filter((id) => id !== group.id),
                        })}
                      />
                      <span className="font-medium text-gray-800">{group.name}</span>
                      <span className="ml-auto text-[10px] text-gray-400">{group.requirements?.length ?? 0} slots</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={saveLane} disabled={saving || !editingLane.name.trim()} className="h-9 rounded-md bg-[#101827] px-4 text-[12px] font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save lane"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
