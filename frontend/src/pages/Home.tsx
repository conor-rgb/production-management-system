import { useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";

type HealthStatus = {
  status: string;
  time: string;
};

function StatusBadge({ status }: { status: "ok" | "down" | "loading" }) {
  const styles = {
    ok: "bg-mint/30 text-dusk",
    down: "bg-red-200 text-red-900",
    loading: "bg-amber-200 text-amber-900"
  };

  const labels = {
    ok: "API healthy",
    down: "API unreachable",
    loading: "Checking API"
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${styles[status]}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}

export default function Home() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [status, setStatus] = useState<"ok" | "down" | "loading">("loading");

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) {
          throw new Error("Health check failed");
        }
        const payload = await response.json();
        if (isMounted) {
          setHealth(payload.data);
          setStatus("ok");
        }
      } catch (error) {
        if (isMounted) {
          setStatus("down");
        }
      }
    }

    loadHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen px-6 py-10 lg:px-16">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Unlimited Bond</p>
          <h1 className="mt-4 max-w-xl font-display text-4xl font-bold text-ink md:text-5xl lg:text-6xl">
            Production Management System
          </h1>
          <p className="mt-4 max-w-xl text-lg text-dusk/80">
            A zero-friction command center for stills, motion, and live events. Built to keep projects calm,
            coordinated, and always client-ready.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-white/80 p-6 shadow-[0_25px_60px_rgba(15,23,42,0.1)] backdrop-blur">
          <StatusBadge status={status} />
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Environment</p>
            <p className="text-sm font-semibold text-ink">Production · Manchester VPS</p>
          </div>
          {health && (
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Last heartbeat</p>
              <p className="text-sm font-semibold text-ink">{new Date(health.time).toLocaleString()}</p>
            </div>
          )}
        </div>
      </header>

      <section className="mt-16 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: "Single Source of Truth",
            description:
              "Centralize briefs, budgets, options, and deliverables with role-specific visibility and real-time updates."
          },
          {
            title: "Producer-First Workflows",
            description:
              "Optimized for fast-moving production days: smart defaults, minimal clicks, and clear status cues."
          },
          {
            title: "Financial Confidence",
            description:
              "Estimates, invoices, and FreeAgent sync run on a clean pipeline with audit-ready tracking."
          }
        ].map((card) => (
          <div
            key={card.title}
            className="group rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)] backdrop-blur transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
          >
            <h3 className="font-display text-xl font-semibold text-ink">{card.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-dusk/80">{card.description}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-ink p-8 text-white shadow-[0_30px_70px_rgba(12,18,33,0.25)]">
          <h2 className="font-display text-3xl font-semibold">Phase 1 Foundation</h2>
          <p className="mt-4 text-sm text-white/70">
            Core infrastructure is live on the VPS. Next up: authentication, project setup, and crew/talent
            modules with production-ready workflows.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              "Auth + RBAC",
              "Projects + Clients",
              "Suppliers + Crew",
              "FreeAgent sync (contacts)"
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-white/10 p-4 text-sm font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_25px_60px_rgba(12,18,33,0.1)]">
          <h3 className="font-display text-2xl font-semibold text-ink">Immediate Next Steps</h3>
          <ol className="mt-6 space-y-4 text-sm text-dusk/80">
            <li>
              <span className="font-semibold text-ink">1.</span> Confirm initial admin user + seed data.
            </li>
            <li>
              <span className="font-semibold text-ink">2.</span> Finalize auth screens and role-based layouts.
            </li>
            <li>
              <span className="font-semibold text-ink">3.</span> Wire FreeAgent sandbox credentials.
            </li>
          </ol>
          <div className="mt-8 rounded-2xl bg-mist p-4 text-xs uppercase tracking-[0.3em] text-dusk/60">
            Ready for feature buildout
          </div>
        </div>
      </section>
    </div>
  );
}
