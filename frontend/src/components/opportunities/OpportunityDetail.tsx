import { useCallback, useState, useEffect, useRef } from "react";
import { api } from "../../lib/api";
import type { EmailThread, EmailThreadsResponse, Opportunity, OpportunityNote, OpportunityTask } from "../../lib/types";
import { STAGE_LABELS, STAGE_COLOURS, STAGE_ORDER, daysOverdue } from "../../lib/types";
import {
  X, Edit2, Plus, Check, Trash2, AlertCircle,
  Calendar, Building2, User, TrendingUp, ChevronDown, Mail,
} from "lucide-react";

interface Props {
  opportunityId: string;
  onEdit: () => void;
  onClose: () => void;
  onStageChange: (id: string, stage: string) => void;
  onRefresh: () => void;
  initialTab?: DetailTab;
  onOpenBudget: () => void;
}

type AddMode = "note" | "task" | null;
type DetailTab = "Overview" | "Comms" | "Budget";

type TimelineItem =
  | { kind: "note"; item: OpportunityNote }
  | { kind: "task"; item: OpportunityTask }
  | { kind: "email"; item: EmailThread };

export default function OpportunityDetail({ opportunityId, onEdit, onClose, onStageChange, onRefresh, initialTab = "Overview", onOpenBudget }: Props) {
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [addText, setAddText] = useState("");
  const [addDueDate, setAddDueDate] = useState("");
  const [stageOpen, setStageOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailResults, setEmailResults] = useState<EmailThread[]>([]);
  const addRef = useRef<HTMLTextAreaElement>(null);

  const reload = useCallback(() => {
    api.get<Opportunity>(`/api/opportunities/${opportunityId}`).then(setOpp).catch(console.error);
  }, [opportunityId]);

  useEffect(() => { reload(); setTab(initialTab); }, [reload, initialTab]);
  useEffect(() => {
    if (addMode && addRef.current) addRef.current.focus();
  }, [addMode]);
  useEffect(() => {
    if (!linkOpen || !emailSearch.trim()) {
      setEmailResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.get<EmailThreadsResponse>(`/api/email/threads?search=${encodeURIComponent(emailSearch)}`).then((data) => setEmailResults(data.threads)).catch(console.error);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [linkOpen, emailSearch]);

  if (!opp) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  const timeline: TimelineItem[] = [
    ...opp.activityNotes.map((n) => ({ kind: "note" as const, item: n as OpportunityNote })),
    ...opp.tasks.map((t) => ({ kind: "task" as const, item: t as OpportunityTask })),
    ...(opp.emailThreads ?? []).map((thread) => ({ kind: "email" as const, item: thread as EmailThread })),
  ].sort((a, b) => {
    const aDate = a.kind === "email" ? a.item.lastMessageAt : a.item.createdAt;
    const bDate = b.kind === "email" ? b.item.lastMessageAt : b.item.createdAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });

  const oppId = opp.id;
  const overdue = opp.followUpDate ? daysOverdue(opp.followUpDate) > 0 : false;
  const clientDisplay = opp.company?.name ?? opp.clientName;
  const contactDisplay = opp.contact
    ? `${opp.contact.firstName}${opp.contact.lastName ? " " + opp.contact.lastName : ""}`
    : null;

  async function handleAddNote() {
    if (!addText.trim()) return;
    await api.post(`/api/opportunities/${opportunityId}/notes`, { body: addText.trim() });
    setAddText("");
    setAddMode(null);
    reload();
  }

  async function handleAddTask() {
    if (!addText.trim()) return;
    await api.post(`/api/opportunities/${opportunityId}/tasks`, {
      body: addText.trim(),
      dueDate: addDueDate || undefined,
    });
    setAddText("");
    setAddDueDate("");
    setAddMode(null);
    reload();
  }

  async function handleSaveNote(noteId: string, body: string) {
    await api.patch(`/api/opportunities/${opportunityId}/notes/${noteId}`, { body });
    setEditingNoteId(null);
    reload();
  }

  async function handleDeleteNote(noteId: string) {
    await api.delete(`/api/opportunities/${opportunityId}/notes/${noteId}`);
    reload();
  }

  async function handleToggleTask(taskId: string, completed: boolean) {
    await api.patch(`/api/opportunities/${opportunityId}/tasks/${taskId}`, { completed });
    reload();
    onRefresh();
  }

  async function handleSaveTask(taskId: string, body: string) {
    await api.patch(`/api/opportunities/${opportunityId}/tasks/${taskId}`, { body });
    setEditingTaskId(null);
    reload();
  }

  async function handleDeleteTask(taskId: string) {
    await api.delete(`/api/opportunities/${opportunityId}/tasks/${taskId}`);
    reload();
  }

  async function linkThread(threadId: string) {
    await api.patch(`/api/email/threads/${threadId}/link`, { opportunityId });
    setLinkOpen(false);
    setEmailSearch("");
    reload();
  }

  async function unlinkThread(threadId: string) {
    await api.patch(`/api/email/threads/${threadId}/unlink`, {});
    reload();
  }

  function handleStageChange(stage: string) {
    setStageOpen(false);
    onStageChange(oppId, stage);
  }

  const stageColour = STAGE_COLOURS[opp.stage as keyof typeof STAGE_COLOURS] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1 min-w-0 pr-2">
          <h2 className="font-semibold text-gray-900 leading-snug">{opp.title}</h2>
          {clientDisplay && (
            <p className="text-sm text-gray-500 mt-0.5">
              {clientDisplay}{opp.brand ? ` · ${opp.brand}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <Edit2 size={16} />
          </button>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="border-b border-gray-100 px-4 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {(["Overview", "Comms", "Budget"] as DetailTab[]).map((item) => (
              <button
                key={item}
                onClick={() => item === "Budget" ? onOpenBudget() : setTab(item)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-medium ${tab === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {tab === "Overview" && <div className="p-4 space-y-3 border-b border-gray-100">
          {/* Stage control */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setStageOpen(!stageOpen)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${stageColour}`}
              >
                {STAGE_LABELS[opp.stage as keyof typeof STAGE_LABELS] ?? opp.stage}
                <ChevronDown size={12} />
              </button>
              {stageOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10 w-36">
                  {STAGE_ORDER.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${opp.stage === s ? "font-medium text-gray-900" : "text-gray-700"}`}
                    >
                      {STAGE_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {overdue && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertCircle size={12} /> Overdue
              </span>
            )}
          </div>

          {/* Info rows */}
          <div className="space-y-1.5 text-sm">
            {contactDisplay && (
              <div className="flex items-center gap-2 text-gray-600">
                <User size={14} className="text-gray-400 shrink-0" />
                <span>{contactDisplay}</span>
              </div>
            )}
            {opp.company && (
              <div className="flex items-center gap-2 text-gray-600">
                <Building2 size={14} className="text-gray-400 shrink-0" />
                <span>{opp.company.name}</span>
              </div>
            )}
            {opp.value && (
              <div className="flex items-center gap-2 text-gray-600">
                <TrendingUp size={14} className="text-gray-400 shrink-0" />
                <span>£{parseFloat(opp.value).toLocaleString()}</span>
              </div>
            )}
            {opp.followUpDate && (
              <div className={`flex items-center gap-2 ${overdue ? "text-red-600 font-medium" : "text-gray-600"}`}>
                <Calendar size={14} className={overdue ? "text-red-400 shrink-0" : "text-gray-400 shrink-0"} />
                <span>
                  Follow-up:{" "}
                  {new Date(opp.followUpDate).toLocaleDateString("en-GB", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </div>
            )}
            {opp.lostReason && (
              <p className="text-xs text-gray-500 italic">
                Lost: {opp.lostReason.replace(/_/g, " ").toLowerCase()}
                {opp.lostNote && ` — ${opp.lostNote}`}
              </p>
            )}
          </div>

          {opp.description && (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{opp.description}</p>
          )}

          {/* Linked productions */}
          {opp.productions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Productions</p>
              {opp.productions.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm text-gray-700">
                  {p.jobCode && (
                    <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                      {p.jobCode}
                    </span>
                  )}
                  <span>{p.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>}

        {/* Comms timeline */}
        {tab === "Comms" && <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity</p>
            <div className="flex gap-1">
              <button
                onClick={() => setLinkOpen(!linkOpen)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors text-gray-600 hover:bg-gray-100"
              >
                <Mail size={11} /> Link email
              </button>
              <button
                onClick={() => { setAddMode(addMode === "note" ? null : "note"); setAddText(""); setAddDueDate(""); }}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${addMode === "note" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <Plus size={11} /> Note
              </button>
              <button
                onClick={() => { setAddMode(addMode === "task" ? null : "task"); setAddText(""); setAddDueDate(""); }}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${addMode === "task" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <Plus size={11} /> Task
              </button>
            </div>
          </div>
          {linkOpen && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <input value={emailSearch} onChange={(e) => setEmailSearch(e.target.value)} placeholder="Search subject or sender" className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" />
              <div className="mt-2 divide-y divide-gray-100">
                {emailResults.map((thread) => (
                  <button key={thread.id} onClick={() => linkThread(thread.id)} className="min-h-11 w-full text-left text-sm">
                    <span className="block truncate font-medium text-gray-900">{thread.subject}</span>
                    <span className="block truncate text-xs text-gray-500">{thread.latestPreview}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick-add form */}
          {addMode && (
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
              <textarea
                ref={addRef}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                rows={2}
                placeholder={addMode === "note" ? "Add a note…" : "Task description…"}
                className="w-full text-sm bg-transparent resize-none focus:outline-none text-gray-900 placeholder-gray-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    if (addMode === "note") handleAddNote();
                    else handleAddTask();
                  }
                }}
              />
              {addMode === "task" && (
                <div className="mt-2">
                  <input
                    type="date"
                    value={addDueDate}
                    onChange={(e) => setAddDueDate(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setAddMode(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">
                  Cancel
                </button>
                <button
                  onClick={addMode === "note" ? handleAddNote : handleAddTask}
                  disabled={!addText.trim()}
                  className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg hover:bg-gray-700 disabled:opacity-40"
                >
                  Add {addMode}
                </button>
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No activity yet. Add a note or task above.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((entry) =>
                entry.kind === "note" ? (
                  <NoteItem
                    key={entry.item.id}
                    note={entry.item}
                    editing={editingNoteId === entry.item.id}
                    onEdit={() => setEditingNoteId(entry.item.id)}
                    onSave={(body) => handleSaveNote(entry.item.id, body)}
                    onCancel={() => setEditingNoteId(null)}
                    onDelete={() => handleDeleteNote(entry.item.id)}
                  />
                ) : entry.kind === "task" ? (
                  <TaskItem
                    key={entry.item.id}
                    task={entry.item}
                    editing={editingTaskId === entry.item.id}
                    onToggle={(completed) => handleToggleTask(entry.item.id, completed)}
                    onEdit={() => setEditingTaskId(entry.item.id)}
                    onSave={(body) => handleSaveTask(entry.item.id, body)}
                    onCancel={() => setEditingTaskId(null)}
                    onDelete={() => handleDeleteTask(entry.item.id)}
                  />
                ) : (
                  <div key={entry.item.id} className="rounded-xl border border-gray-200 bg-white p-3">
                    <button onClick={() => { window.location.href = `/email?thread=${entry.item.id}`; }} className="w-full text-left">
                      <div className="flex items-start gap-2">
                        <Mail size={16} className="mt-0.5 text-gray-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{entry.item.subject}</p>
                          <p className="truncate text-xs text-gray-500">{entry.item.latestPreview ?? entry.item.messages.at(-1)?.bodyText?.slice(0, 60)}</p>
                          <p className="mt-1 text-xs text-gray-400">{new Date(entry.item.lastMessageAt).toLocaleString("en-GB")}</p>
                        </div>
                        {!entry.item.isRead && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
                        <span onClick={(event) => { event.stopPropagation(); unlinkThread(entry.item.id); }} className="grid min-h-8 min-w-8 place-items-center text-gray-400 hover:text-red-500"><X size={14} /></span>
                      </div>
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>}

        {tab === "Budget" && (
          <div className="p-4">
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Estimate</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{opp.value ? `£${parseFloat(opp.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "No value yet"}</p>
              <p className="mt-2 text-sm text-gray-500">Budget figures are managed in the full-screen bid view.</p>
            </div>
            <button onClick={onOpenBudget} className="mt-4 min-h-11 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">
              Open full budget →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteItem({
  note, editing, onEdit, onSave, onCancel, onDelete,
}: {
  note: OpportunityNote;
  editing: boolean;
  onEdit: () => void;
  onSave: (body: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(note.body);

  useEffect(() => { setBody(note.body); }, [note.body]);

  return (
    <div className="group flex gap-2.5">
      <div className="w-2 h-2 rounded-full bg-gray-300 mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-2.5">
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              className="w-full text-sm bg-transparent resize-none focus:outline-none text-gray-900"
            />
            <div className="flex justify-end gap-2 mt-1.5">
              <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5">Cancel</button>
              <button onClick={() => onSave(body)} className="text-xs bg-gray-900 text-white px-2.5 py-0.5 rounded-lg">Save</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(note.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </p>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task, editing, onToggle, onEdit, onSave, onCancel, onDelete,
}: {
  task: OpportunityTask;
  editing: boolean;
  onToggle: (completed: boolean) => void;
  onEdit: () => void;
  onSave: (body: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(task.body);
  const taskOverdue = task.dueDate && !task.completed && daysOverdue(task.dueDate) > 0;

  useEffect(() => { setBody(task.body); }, [task.body]);

  return (
    <div className="group flex gap-2.5">
      <button
        onClick={() => onToggle(!task.completed)}
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          task.completed ? "bg-gray-900 border-gray-900" : "border-gray-300 hover:border-gray-500"
        }`}
      >
        {task.completed && <Check size={10} className="text-white" />}
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-2.5">
            <input
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-sm bg-transparent focus:outline-none text-gray-900"
            />
            <div className="flex justify-end gap-2 mt-1.5">
              <button onClick={onCancel} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-0.5">Cancel</button>
              <button onClick={() => onSave(body)} className="text-xs bg-gray-900 text-white px-2.5 py-0.5 rounded-lg">Save</button>
            </div>
          </div>
        ) : (
          <>
            <p className={`text-sm ${task.completed ? "line-through text-gray-400" : "text-gray-700"}`}>
              {task.body}
            </p>
            {task.dueDate && (
              <p className={`text-xs mt-0.5 ${taskOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
                {taskOverdue ? "Overdue · " : ""}
                Due {new Date(task.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            )}
          </>
        )}
      </div>
      {!editing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <button onClick={onEdit} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500 rounded">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
