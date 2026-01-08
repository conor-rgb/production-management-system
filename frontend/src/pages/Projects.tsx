import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";

const statusColors: Record<string, string> = {
  INQUIRY: "bg-blue-100 text-blue-900",
  CONFIRMED: "bg-emerald-100 text-emerald-900",
  IN_PRODUCTION: "bg-amber-100 text-amber-900",
  DELIVERED: "bg-indigo-100 text-indigo-900",
  INVOICED: "bg-violet-100 text-violet-900",
  CLOSED: "bg-slate-200 text-slate-800",
  ARCHIVED: "bg-slate-200 text-slate-600"
};

type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  type: string;
  client?: { companyName: string } | null;
  owner?: { fullName?: string } | null;
  createdAt?: string;
};

type ProjectsResponse = {
  data: Project[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

type Client = {
  id: string;
  companyName: string;
};

type ClientsResponse = {
  data: Client[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const projectTypes = ["EVENT", "STILLS", "MOTION", "HYBRID"] as const;
const projectStatuses = [
  "INQUIRY",
  "CONFIRMED",
  "IN_PRODUCTION",
  "DELIVERED",
  "INVOICED",
  "CLOSED",
  "ARCHIVED"
] as const;

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    name: "",
    type: "MOTION",
    status: "INQUIRY",
    clientId: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "12");
    if (search) {
      params.set("search", search);
    }
    if (status) {
      params.set("status", status);
    }
    return params.toString();
  }, [page, search, status]);

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      setError(null);
      try {
        const payload = await apiFetchRaw<Project[] & { pagination?: ProjectsResponse["pagination"] }>(
          `/projects?${query}`
        );
        if (isMounted) {
          const list = Array.isArray(payload.data) ? payload.data : [];
          const pagination = (payload as unknown as ProjectsResponse).pagination;
          setProjects(list);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load projects");
        }
      }
    }

    loadProjects();

    return () => {
      isMounted = false;
    };
  }, [query]);

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      try {
        const payload = await apiFetchRaw<Client[] & { pagination?: ClientsResponse["pagination"] }>(
          "/clients?active=true&limit=200"
        );
        if (isMounted) {
          setClients(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (err) {
        if (isMounted) {
          setFormError(err instanceof Error ? err.message : "Failed to load clients");
        }
      }
    }

    loadClients();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!formValues.name.trim()) {
      setFormError("Project name is required.");
      return;
    }

    if (!formValues.clientId) {
      setFormError("Select a client.");
      return;
    }

    setIsSaving(true);

    try {
      await apiFetchRaw("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: formValues.name.trim(),
          type: formValues.type,
          status: formValues.status,
          clientId: formValues.clientId
        })
      });

      setFormValues({ name: "", type: "MOTION", status: "INQUIRY", clientId: "" });
      setPage(1);
      const payload = await apiFetchRaw<Project[] & { pagination?: ProjectsResponse["pagination"] }>(
        `/projects?page=1&limit=12`
      );
      const list = Array.isArray(payload.data) ? payload.data : [];
      const pagination = (payload as unknown as ProjectsResponse).pagination;
      setProjects(list);
      setTotalPages(pagination?.totalPages ?? 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Projects</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Project Pipeline</h1>
          </div>
        </div>

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
          onSubmit={handleCreate}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Create project</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.name}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Project name"
              />
            </label>
            <label className="text-sm text-ink">
              Client
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.clientId}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, clientId: event.target.value }))
                }
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Type
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.type}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                {projectTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Status
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.status}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                {projectStatuses.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <button
            className="mt-4 h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Create project"}
          </button>
        </form>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              placeholder="Search by name or code"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <select
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="INQUIRY">Inquiry</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="IN_PRODUCTION">In production</option>
              <option value="DELIVERED">Delivered</option>
              <option value="INVOICED">Invoiced</option>
              <option value="CLOSED">Closed</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 text-left shadow-[0_20px_50px_rgba(12,18,33,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
              onClick={() => navigate(`/projects/${project.id}`)}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.3em] text-dusk/60">{project.code}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusColors[project.status] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {project.status.replace("_", " ")}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-ink">{project.name}</h3>
              <p className="mt-2 text-sm text-dusk/70">
                {project.client?.companyName ?? "No client"} · {project.type}
              </p>
              <p className="mt-4 text-xs text-dusk/60">
                Owner: {project.owner?.fullName ?? "Unassigned"}
              </p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            className="rounded-2xl border border-dusk/10 bg-white px-4 py-2 text-sm text-dusk/80 disabled:opacity-50"
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
            Page {page} of {totalPages}
          </p>
          <button
            className="rounded-2xl border border-dusk/10 bg-white px-4 py-2 text-sm text-dusk/80 disabled:opacity-50"
            onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
