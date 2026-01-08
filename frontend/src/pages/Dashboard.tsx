import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

type DashboardStats = {
  projectsActive: number;
  projectsTotal: number;
  clientsActive: number;
  crewActive: number;
  talentActive: number;
};

type FreeAgentStatus = {
  connected: boolean;
  expiresAt: string | null;
  accountId: string | null;
};

function getStoredUser() {
  const raw = localStorage.getItem("pms_user");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { fullName?: string; email?: string; role?: string };
  } catch (error) {
    return null;
  }
}

export default function Dashboard() {
  const user = useMemo(() => getStoredUser(), []);
  const { addToast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freeAgentStatus, setFreeAgentStatus] = useState<FreeAgentStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const data = await apiFetch<DashboardStats>("/dashboard/stats");
        if (isMounted) {
          setStats(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load stats");
        }
      }
    }

    async function loadFreeAgent() {
      try {
        const payload = await apiFetchRaw<FreeAgentStatus>("/freeagent/status");
        if (isMounted) {
          setFreeAgentStatus(payload.data ?? null);
        }
      } catch (err) {
        if (isMounted) {
          addToast(
            err instanceof Error ? err.message : "Failed to load FreeAgent status",
            "error"
          );
        }
      }
    }

    loadStats();
    loadFreeAgent();

    return () => {
      isMounted = false;
    };
  }, [addToast]);

  async function handleConnect() {
    setIsConnecting(true);
    try {
      const payload = await apiFetchRaw<{ url: string }>("/freeagent/authorize");
      if (!payload.data?.url) {
        throw new Error("Missing FreeAgent authorize URL.");
      }
      window.location.href = payload.data.url;
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to start FreeAgent auth", "error");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    try {
      const payload = await apiFetchRaw<{
        contacts: number;
        createdClients: number;
        updatedClients: number;
        skippedClientsMissingEmail: number;
        createdSuppliers: number;
        updatedSuppliers: number;
      }>("/freeagent/sync/contacts", { method: "POST" });
      const summary = payload.data;
      if (summary) {
        addToast(
          `FreeAgent synced: ${summary.createdClients} clients, ${summary.createdSuppliers} suppliers.`,
          "success"
        );
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : "FreeAgent sync failed", "error");
    } finally {
      setIsSyncing(false);
    }
  }

  const statCards = [
    { title: "Active projects", value: stats?.projectsActive },
    { title: "Total projects", value: stats?.projectsTotal },
    { title: "Active clients", value: stats?.clientsActive },
    { title: "Active crew", value: stats?.crewActive },
    { title: "Active talent", value: stats?.talentActive }
  ];

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-ink p-8 text-white shadow-[0_30px_70px_rgba(12,18,33,0.25)]">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">Dashboard</p>
          <h1 className="mt-4 font-display text-4xl font-semibold">
            Welcome back{user?.fullName ? `, ${user.fullName}` : ""}
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Role: {user?.role ?? "Unknown"} · {user?.email ?? "No email on file"}
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {statCards.map((card) => (
            <div
              key={card.title}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">{card.title}</p>
              <p className="mt-3 text-2xl font-semibold text-ink">
                {stats ? card.value : "—"}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Next actions</h2>
          <ul className="mt-4 space-y-3 text-sm text-dusk/80">
            <li>Review new client brief intake and assign producer.</li>
            <li>Confirm crew availability for the March studio shoot.</li>
            <li>Sync FreeAgent contacts before the next invoice run.</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6">
          <h2 className="font-display text-2xl font-semibold text-ink">FreeAgent</h2>
          <p className="mt-2 text-sm text-dusk/70">
            Status:{" "}
            {freeAgentStatus?.connected
              ? `Connected (expires ${freeAgentStatus.expiresAt ?? "unknown"})`
              : "Not connected"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect FreeAgent"}
            </button>
            <button
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-6 text-sm font-semibold text-ink disabled:opacity-50"
              type="button"
              onClick={handleSync}
              disabled={!freeAgentStatus?.connected || isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync contacts"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
