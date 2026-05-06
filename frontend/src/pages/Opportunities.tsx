import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { OpportunityListItem } from "../lib/types";
import { STAGE_LABELS, STAGE_COLOURS, STAGE_ORDER, daysOverdue, formatCurrency } from "../lib/types";
import BudgetView from "../components/budgets/BudgetView";
import OpportunityModal from "../components/opportunities/OpportunityModal";
import OpportunityDetail from "../components/opportunities/OpportunityDetail";
import LostModal from "../components/opportunities/LostModal";
import { Plus, List, LayoutGrid, AlertCircle, TrendingUp } from "lucide-react";

type PendingWon = { id: string; title: string };

export default function Opportunities() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<"kanban" | "list">(() => {
    return (localStorage.getItem("opp_view") as "kanban" | "list") ?? "kanban";
  });
  const [opportunities, setOpportunities] = useState<OpportunityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OpportunityListItem | null>(null);
  const [editOpp, setEditOpp] = useState<OpportunityListItem | null | "new">(null);
  const [lostTarget, setLostTarget] = useState<string | null>(null);
  const [pendingWon, setPendingWon] = useState<PendingWon | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const budgetViewOpen = searchParams.get("view") === "budget" && Boolean(searchParams.get("opportunity"));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<OpportunityListItem[]>("/api/opportunities");
      setOpportunities(data);
      const requested = searchParams.get("opportunity");
      if (requested) {
        const match = data.find((item) => item.id === requested);
        if (match) setSelected(match);
      }
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => { load(); }, [load]);

  function changeView(v: "kanban" | "list") {
    setView(v);
    localStorage.setItem("opp_view", v);
  }

  async function moveStage(oppId: string, stage: string) {
    if (stage === "LOST") {
      setLostTarget(oppId);
      return;
    }
    if (stage === "WON") {
      const opp = opportunities.find((item) => item.id === oppId) ?? selected;
      setPendingWon({ id: oppId, title: opp?.title ?? "this opportunity" });
      return;
    }
    await api.patch(`/api/opportunities/${oppId}`, { stage });
    await load();
  }

  async function confirmWon() {
    if (!pendingWon) return;
    const target = pendingWon;
    const res = await api.patch<{ opportunity: OpportunityListItem; production?: { id: string; jobCode: string } }>(
      `/api/opportunities/${target.id}`,
      { stage: "WON" }
    );
    if (!res.production) throw new Error("Production was not returned after marking opportunity Won");

    if (selected?.id === target.id) setSelected(null);
    setSearchParams({}, { replace: true });
    setPendingWon(null);
    navigate(`/productions?production=${res.production.id}`);
  }

  function onDragStart(oppId: string) { setDragging(oppId); }
  function onDragEnd() { setDragging(null); setDragOver(null); }

  function onDragOverColumn(stage: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(stage);
  }

  function onDropColumn(stage: string) {
    if (dragging) moveStage(dragging, stage);
    setDragging(null);
    setDragOver(null);
  }

  function openBudget(opportunityId: string) {
    setSearchParams({ opportunity: opportunityId, view: "budget" }, { replace: true });
  }

  function closeBudget() {
    if (selected) setSearchParams({ opportunity: selected.id, tab: "Budget" }, { replace: true });
    else setSearchParams({}, { replace: true });
  }

  const byStage = STAGE_ORDER.reduce((acc, s) => {
    acc[s] = opportunities.filter((o) => o.stage === s);
    return acc;
  }, {} as Record<string, OpportunityListItem[]>);

  if (budgetViewOpen) {
    const opportunityId = searchParams.get("opportunity");
    if (!opportunityId || (!selected && loading)) {
      return <div className="grid h-full place-items-center text-sm text-gray-400">Loading budget…</div>;
    }
    return (
      <BudgetView
        entity={{ type: "opportunity", id: opportunityId, data: selected ?? undefined }}
        onBack={closeBudget}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Main panel */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-gray-200 bg-white shrink-0">
          <h1 className="font-semibold text-gray-900">Opportunities</h1>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => changeView("kanban")}
                title="Kanban view"
                className={`px-3 py-1.5 ${view === "kanban" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => changeView("list")}
                title="List view"
                className={`px-3 py-1.5 border-l border-gray-200 ${view === "list" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <List size={15} />
              </button>
            </div>
            <button
            onClick={() => setEditOpp("new")}
              className="flex items-center gap-1 text-sm bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
            >
              <Plus size={15} /> New
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
        ) : opportunities.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <TrendingUp size={36} className="opacity-30" />
            <p className="text-sm">No opportunities yet.</p>
            <button onClick={() => setEditOpp("new")} className="text-sm text-indigo-600 hover:underline">Add one</button>
          </div>
        ) : view === "kanban" ? (
          <KanbanView
            byStage={byStage}
            selected={selected?.id ?? null}
            dragging={dragging}
            dragOver={dragOver}
            onSelect={(opp) => { setSelected(opp); setSearchParams({ opportunity: opp.id }, { replace: true }); }}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOverColumn={onDragOverColumn}
            onDropColumn={onDropColumn}
          />
        ) : (
          <ListView
            opportunities={opportunities}
            selected={selected?.id ?? null}
            onSelect={(opp) => { setSelected(opp); setSearchParams({ opportunity: opp.id }, { replace: true }); }}
          />
        )}
      </div>

      {/* Detail panel — desktop */}
      {selected && (
        <div className="hidden md:flex flex-col w-[420px] border-l border-gray-200 bg-white">
          <OpportunityDetail
            opportunityId={selected.id}
            onEdit={() => setEditOpp(selected)}
            onClose={() => { setSelected(null); setSearchParams({}, { replace: true }); }}
            onStageChange={moveStage}
            onRefresh={load}
            initialTab={searchParams.get("tab") === "Budget" ? "Budget" : "Overview"}
            onOpenBudget={() => openBudget(selected.id)}
          />
        </div>
      )}

      {/* Modals */}
      {editOpp && (
        <OpportunityModal
          opp={editOpp === "new" ? null : editOpp}
          onClose={() => setEditOpp(null)}
          onSaved={() => { setEditOpp(null); load(); }}
        />
      )}
      {lostTarget && (
        <LostModal
          oppId={lostTarget}
          onClose={() => setLostTarget(null)}
          onSaved={() => { setLostTarget(null); if (selected?.id === lostTarget) setSelected(null); load(); }}
        />
      )}
      {pendingWon && (
        <WonConfirmPrompt
          opportunityTitle={pendingWon.title}
          onClose={() => setPendingWon(null)}
          onConfirm={confirmWon}
        />
      )}
      {/* Mobile detail sheet */}
      {selected && (
        <div className="md:hidden fixed inset-0 bg-white z-40 overflow-auto">
          <OpportunityDetail
            opportunityId={selected.id}
            onEdit={() => setEditOpp(selected)}
            onClose={() => { setSelected(null); setSearchParams({}, { replace: true }); }}
            onStageChange={moveStage}
            onRefresh={load}
            initialTab={searchParams.get("tab") === "Budget" ? "Budget" : "Overview"}
            onOpenBudget={() => openBudget(selected.id)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

interface KanbanProps {
  byStage: Record<string, OpportunityListItem[]>;
  selected: string | null;
  dragging: string | null;
  dragOver: string | null;
  onSelect: (opp: OpportunityListItem) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverColumn: (stage: string, e: React.DragEvent) => void;
  onDropColumn: (stage: string) => void;
}

function KanbanView({ byStage, selected, dragging, dragOver, onSelect, onDragStart, onDragEnd, onDragOverColumn, onDropColumn }: KanbanProps) {
  return (
    <div className="flex-1 flex gap-0 overflow-x-auto p-4">
      {STAGE_ORDER.map((stage) => {
        const items = byStage[stage] ?? [];
        const isOver = dragOver === stage;
        return (
          <div
            key={stage}
            className="flex-shrink-0 w-60 flex flex-col mr-3 last:mr-0"
            onDragOver={(e) => onDragOverColumn(stage, e)}
            onDrop={() => onDropColumn(stage)}
            onDragLeave={() => {}}
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-2 rounded-t-xl bg-gray-50 border border-gray-200 border-b-0">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {STAGE_LABELS[stage]}
              </span>
              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 font-medium min-w-5 text-center">
                {items.length}
              </span>
            </div>
            {/* Cards */}
            <div className={`flex-1 rounded-b-xl border border-gray-200 p-2 space-y-2 min-h-40 transition-colors ${isOver ? "bg-indigo-50 border-indigo-300" : "bg-gray-50"}`}>
              {items.map((opp) => (
                <KanbanCard
                  key={opp.id}
                  opp={opp}
                  isSelected={opp.id === selected}
                  isDragging={opp.id === dragging}
                  onClick={() => onSelect(opp)}
                  onDragStart={() => onDragStart(opp.id)}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  opp, isSelected, isDragging, onClick, onDragStart, onDragEnd,
}: {
  opp: OpportunityListItem;
  isSelected: boolean;
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const overdue = opp.followUpDate ? daysOverdue(opp.followUpDate) > 0 : false;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`bg-white rounded-xl border p-3 cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging ? "opacity-40 shadow-lg" : "hover:shadow-sm"
      } ${isSelected ? "border-indigo-400 ring-1 ring-indigo-400" : "border-gray-200"}`}
    >
      <p className="text-sm font-medium text-gray-900 leading-snug truncate">{opp.title}</p>
      {(opp.clientName || opp.company?.name) && (
        <p className="text-xs text-gray-500 truncate mt-0.5">
          {opp.company?.name ?? opp.clientName}{opp.brand ? ` · ${opp.brand}` : ""}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        {opp.budgetClientGrandTotal ? (
          <span className="text-xs font-medium text-indigo-700">
            {formatCurrency(opp.budgetClientGrandTotal)}
          </span>
        ) : opp.value ? (
          <span className="text-xs font-medium text-gray-700">
            £{parseFloat(opp.value).toLocaleString()}
          </span>
        ) : <span />}
        {opp.followUpDate && (
          <span className={`text-xs flex items-center gap-0.5 ${overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
            {overdue && <AlertCircle size={11} />}
            {new Date(opp.followUpDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({
  opportunities, selected, onSelect,
}: {
  opportunities: OpportunityListItem[];
  selected: string | null;
  onSelect: (opp: OpportunityListItem) => void;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Title</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Client</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Value</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Follow-up</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {opportunities.map((opp) => {
            const overdue = opp.followUpDate ? daysOverdue(opp.followUpDate) > 0 : false;
            const isActive = opp.stage !== "WON" && opp.stage !== "LOST";
            return (
              <tr
                key={opp.id}
                onClick={() => onSelect(opp)}
                className={`cursor-pointer hover:bg-gray-50 transition-colors ${opp.id === selected ? "bg-indigo-50" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{opp.title}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell truncate max-w-xs">
                  {opp.company?.name ?? opp.clientName ?? "—"}
                  {opp.brand ? ` · ${opp.brand}` : ""}
                </td>
                <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                  {opp.budgetClientGrandTotal ? formatCurrency(opp.budgetClientGrandTotal) : opp.value ? `£${parseFloat(opp.value).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLOURS[opp.stage] ?? "bg-gray-100 text-gray-600"}`}>
                    {STAGE_LABELS[opp.stage] ?? opp.stage}
                  </span>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {opp.followUpDate ? (
                    <span className={`text-xs flex items-center gap-1 ${overdue && isActive ? "text-red-600 font-medium" : "text-gray-500"}`}>
                      {overdue && isActive && <AlertCircle size={11} />}
                      {new Date(opp.followUpDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Won confirmation ─────────────────────────────────────────────────────────

function WonConfirmPrompt({ opportunityTitle, onClose, onConfirm }: {
  opportunityTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark opportunity Won");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-900 text-lg mb-1">Mark opportunity as Won?</h2>
        <p className="text-sm text-gray-500 mb-4">
          This will create a production record for {opportunityTitle}.
        </p>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 min-h-11 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving}
            className="flex-1 min-h-11 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
