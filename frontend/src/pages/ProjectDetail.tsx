import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

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
  description?: string | null;
  status: string;
  type: string;
  client?: { companyName: string } | null;
  owner?: { fullName?: string; email?: string } | null;
};

type Assignment = {
  id: string;
  roleOnProject: string;
  user: { id: string; fullName: string; email: string; role: string };
};

type User = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  active: boolean;
};

type UsersResponse = {
  data: User[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const projectStatuses = [
  "INQUIRY",
  "CONFIRMED",
  "IN_PRODUCTION",
  "DELIVERED",
  "INVOICED",
  "CLOSED",
  "ARCHIVED"
] as const;

const projectTypes = ["EVENT", "STILLS", "MOTION", "HYBRID"] as const;

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [roleOnProject, setRoleOnProject] = useState("Coordinator");
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
    status: "INQUIRY",
    type: "EVENT"
  });

  const availableUsers = useMemo(() => {
    const assignedIds = new Set(assignments.map((assignment) => assignment.user.id));
    return users.filter((user) => !assignedIds.has(user.id));
  }, [assignments, users]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!projectId) {
        return;
      }
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetchRaw<{ project: Project }>(`/projects/${projectId}`);
        const teamPayload = await apiFetchRaw<Assignment[]>(`/projects/${projectId}/team`);
        const usersPayload = await apiFetchRaw<User[] & { pagination?: UsersResponse["pagination"] }>(
          `/users?active=true&limit=200`
        );

        if (isMounted) {
          const record = payload.data?.project ?? null;
          setProject(record);
          setFormValues({
            name: record?.name ?? "",
            description: record?.description ?? "",
            status: (record?.status as (typeof projectStatuses)[number]) ?? "INQUIRY",
            type: (record?.type as (typeof projectTypes)[number]) ?? "EVENT"
          });
          setAssignments(Array.isArray(teamPayload.data) ? teamPayload.data : []);
          setUsers(Array.isArray(usersPayload.data) ? usersPayload.data : []);
          setSelectedUserId("");
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load project");
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  async function handleArchive() {
    if (!projectId) {
      return;
    }

    const confirmed = window.confirm("Archive this project? It will be read-only.");
    if (!confirmed) {
      return;
    }

    setFormError(null);
    setSuccess(null);
    setIsDeleting(true);

    try {
      await apiFetchRaw(`/projects/${projectId}`, { method: "DELETE" });
      addToast("Project archived.", "success");
      navigate("/projects");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to archive project";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!projectId) {
      return;
    }

    if (!formValues.name.trim()) {
      setFormError("Project name is required.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = await apiFetchRaw<{ project: Project }>(`/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: formValues.name.trim(),
          description: formValues.description.trim() || undefined,
          status: formValues.status,
          type: formValues.type
        })
      });
      setProject(payload.data?.project ?? null);
      setSuccess("Project updated.");
      addToast("Project updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update project";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAssign() {
    if (!projectId || !selectedUserId) {
      return;
    }
    setActionError(null);
    setIsSaving(true);

    try {
      const payload = await apiFetchRaw<{ assignment: Assignment }>(
        `/projects/${projectId}/assignments`,
        {
          method: "POST",
          body: JSON.stringify({ userId: selectedUserId, roleOnProject })
        }
      );
      if (payload.data?.assignment) {
        setAssignments((prev) => [...prev, payload.data!.assignment]);
        setSelectedUserId("");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to assign user");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!projectId) {
      return;
    }
    setActionError(null);
    setIsSaving(true);

    try {
      await apiFetchRaw(`/projects/${projectId}/assignments/${userId}`, { method: "DELETE" });
      setAssignments((prev) => prev.filter((assignment) => assignment.user.id !== userId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove assignment");
    } finally {
      setIsSaving(false);
    }
  }

  if (!projectId) {
    return (
      <div className="min-h-screen px-6 py-10">
        <p className="text-sm text-dusk/80">Project ID missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link className="text-xs uppercase tracking-[0.3em] text-dusk/60" to="/projects">
          ← Back to projects
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {project && (
          <div className="rounded-3xl bg-white/90 p-8 shadow-[0_30px_70px_rgba(12,18,33,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">{project.code}</p>
                <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{project.name}</h1>
                <p className="mt-2 text-sm text-dusk/70">
                  {project.client?.companyName ?? "No client"} · {project.type}
                </p>
              </div>
              <span
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  statusColors[project.status] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {project.status.replace("_", " ")}
              </span>
            </div>

            {project.description && (
              <p className="mt-6 text-sm text-dusk/80">{project.description}</p>
            )}

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-dusk/10 bg-mist/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Owner</p>
                <p className="mt-2 font-semibold text-ink">
                  {project.owner?.fullName ?? "Unassigned"}
                </p>
                <p className="text-xs text-dusk/70">{project.owner?.email ?? ""}</p>
              </div>
              <div className="rounded-2xl border border-dusk/10 bg-mist/60 p-4 text-sm">
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Client</p>
                <p className="mt-2 font-semibold text-ink">
                  {project.client?.companyName ?? "No client"}
                </p>
              </div>
            </div>
          </div>
        )}

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6"
          onSubmit={handleSave}
        >
          <h2 className="font-display text-2xl font-semibold text-ink">Edit project</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Project name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.name}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </label>
            <label className="text-sm text-ink">
              Project type
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.type}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                {projectTypes.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ")}
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
            <label className="text-sm text-ink md:col-span-2">
              Description (optional)
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.description}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            <button
              className="h-11 rounded-2xl border border-amber-200 bg-amber-50 px-6 text-sm font-semibold text-amber-900 disabled:opacity-50"
              type="button"
              onClick={handleArchive}
              disabled={isDeleting}
            >
              {isDeleting ? "Archiving..." : "Archive project"}
            </button>
          </div>
        </form>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Project team</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.3em] text-dusk/60">Team member</label>
              <select
                className="h-11 min-w-[220px] rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">Select user</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} · {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs uppercase tracking-[0.3em] text-dusk/60">Role</label>
              <input
                className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={roleOnProject}
                onChange={(event) => setRoleOnProject(event.target.value)}
              />
            </div>
            <button
              className="h-11 rounded-2xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50"
              onClick={handleAssign}
              disabled={!selectedUserId || isSaving}
              type="button"
            >
              {isSaving ? "Saving..." : "Assign"}
            </button>
          </div>

          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

          {assignments.length === 0 ? (
            <p className="mt-4 text-sm text-dusk/70">No team assigned yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dusk/10 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{assignment.user.fullName}</p>
                    <p className="text-xs text-dusk/70">{assignment.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-[0.2em] text-dusk/60">
                      {assignment.roleOnProject}
                    </span>
                    <button
                      className="text-xs font-semibold text-red-600 hover:text-red-800"
                      onClick={() => handleRemove(assignment.user.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
