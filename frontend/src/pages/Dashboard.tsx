import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  ACTIVE_STAGES,
  DATE_TYPE_LABELS,
  PRODUCTION_STATUS_LABELS,
  STAGE_COLOURS,
  STAGE_LABELS,
  daysOverdue,
  formatCurrency,
  type ProductionDate,
  type ProductionStatus,
} from "../lib/types";
import { AlertCircle, TrendingUp, Film, Users, Calendar, Mail } from "lucide-react";

interface OverdueItem {
  id: string;
  title: string;
  clientName?: string;
  brand?: string;
  followUpDate: string;
  stage: string;
  value?: string;
}

interface DashboardData {
  opportunityCount: number;
  productionCount: number;
  contactCount: number;
  companyCount: number;
  stageCounts: Record<string, number>;
  overdueOpportunities: OverdueItem[];
  todaysAgenda: ProductionDate[];
  activeProductions: {
    id: string;
    title: string;
    jobCode?: string;
    clientName?: string;
    brand?: string;
    status: ProductionStatus;
    variance: number;
    overBudget: boolean;
    nextDate?: ProductionDate;
  }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [emailUnread, setEmailUnread] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<DashboardData>("/api/dashboard").then(setData).catch(console.error);
    async function loadUnread() {
      const unread = await api.get<{ count: number }>("/api/email/unread-count");
      setEmailUnread(unread.count);
    }
    loadUnread().catch(console.error);
    const timer = window.setInterval(() => loadUnread().catch(console.error), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const statCards = [
    { label: "Active opportunities", value: data?.opportunityCount, icon: <TrendingUp size={18} />, onClick: () => navigate("/opportunities") },
    { label: "Productions", value: data?.productionCount, icon: <Film size={18} />, onClick: () => navigate("/productions") },
    { label: "Contacts", value: data?.contactCount, icon: <Users size={18} />, onClick: () => navigate("/contacts") },
    { label: "Unread email", value: emailUnread, icon: <Mail size={18} />, onClick: () => navigate("/email") },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-5">Dashboard</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((c) => (
          <button
            key={c.label}
            onClick={c.onClick}
            className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-gray-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-gray-400 mb-2">{c.icon}</div>
            <p className="text-2xl font-semibold text-gray-900">{c.value ?? "—"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Calendar size={15} /> Today's agenda
            </h2>
            <button onClick={() => navigate("/productions")} className="text-xs text-indigo-600 hover:underline">View productions</button>
          </div>
          {data ? (
            data.todaysAgenda.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No production dates today</p>
            ) : (
              <div className="space-y-2">
                {data.todaysAgenda.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/productions?production=${item.production?.id}`)}
                    className="w-full rounded-xl p-2.5 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{DATE_TYPE_LABELS[item.dateType]} · {item.production?.title}</p>
                      <span className="shrink-0 text-xs text-gray-500">{item.time || "All day"}</span>
                    </div>
                    <p className="truncate text-xs text-gray-500">{item.location || item.production?.clientName || ""}</p>
                    {item.zoomLink && <span className="mt-1 inline-block text-xs font-medium text-indigo-600">Zoom</span>}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>

        {/* Pipeline by stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Pipeline</h2>
            <button
              onClick={() => navigate("/opportunities")}
              className="text-xs text-indigo-600 hover:underline"
            >
              View all
            </button>
          </div>
          {data ? (
            <div className="space-y-2">
              {ACTIVE_STAGES.map((stage) => {
                const count = data.stageCounts[stage] ?? 0;
                const total = ACTIVE_STAGES.reduce((s, st) => s + (data.stageCounts[st] ?? 0), 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium px-2 py-0.5 rounded-full ${STAGE_COLOURS[stage]}`}>
                        {STAGE_LABELS[stage]}
                      </span>
                      <span className="text-gray-500 font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {ACTIVE_STAGES.every((s) => (data.stageCounts[s] ?? 0) === 0) && (
                <p className="text-sm text-gray-400 text-center py-3">No active opportunities</p>
              )}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Active productions</h2>
            <button onClick={() => navigate("/productions")} className="text-xs text-indigo-600 hover:underline">View all</button>
          </div>
          {data ? (
            data.activeProductions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active productions</p>
            ) : (
              <div className="space-y-2">
                {data.activeProductions.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/productions?production=${item.id}`)}
                    className="w-full rounded-xl p-2.5 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        <span className="font-mono text-xs text-indigo-700">{item.jobCode}</span> {item.clientName ?? item.title}
                      </p>
                      <span className="shrink-0 text-xs text-gray-500">{PRODUCTION_STATUS_LABELS[item.status]}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-gray-500">{item.nextDate ? `${DATE_TYPE_LABELS[item.nextDate.dateType]} · ${new Date(item.nextDate.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "No next date"}</span>
                      <span className={`font-semibold ${item.overBudget ? "text-red-600" : "text-emerald-700"}`}>{formatCurrency(item.variance)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>

        {/* Overdue follow-ups */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              Overdue follow-ups
              {data && data.overdueOpportunities.length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 font-semibold rounded-full px-1.5 py-0.5">
                  {data.overdueOpportunities.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => navigate("/opportunities")}
              className="text-xs text-indigo-600 hover:underline"
            >
              View all
            </button>
          </div>
          {data ? (
            data.overdueOpportunities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">All follow-ups up to date</p>
            ) : (
              <div className="space-y-2">
                {data.overdueOpportunities.slice(0, 5).map((item) => {
                  const days = daysOverdue(item.followUpDate);
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(`/opportunities?opportunity=${item.id}`)}
                      className="w-full flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors"
                    >
                      <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {item.clientName ?? item.brand ?? ""}
                        </p>
                      </div>
                      <span className="text-xs text-red-600 font-medium shrink-0">
                        {days === 1 ? "1 day" : `${days} days`}
                      </span>
                    </button>
                  );
                })}
                {data.overdueOpportunities.length > 5 && (
                  <button
                    onClick={() => navigate("/opportunities")}
                    className="w-full text-xs text-center text-indigo-600 hover:underline pt-1"
                  >
                    +{data.overdueOpportunities.length - 5} more
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="h-24 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
