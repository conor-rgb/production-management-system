import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

const typeColors: Record<string, string> = {
  DIRECT_BRAND: "bg-emerald-100 text-emerald-900",
  AGENCY: "bg-blue-100 text-blue-900",
  CORPORATE: "bg-amber-100 text-amber-900"
};

type Project = {
  id: string;
  name: string;
  code: string;
  status: string;
  type: string;
};

type Client = {
  id: string;
  companyName: string;
  clientType: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
  active: boolean;
  projects?: Project[];
};

const clientTypes = ["DIRECT_BRAND", "AGENCY", "CORPORATE"] as const;

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formValues, setFormValues] = useState({
    companyName: "",
    clientType: "DIRECT_BRAND",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: ""
  });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!clientId) {
        return;
      }
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetchRaw<{ client: Client }>(`/clients/${clientId}`);
        if (isMounted) {
          const record = payload.data?.client ?? null;
          setClient(record);
          setFormValues({
            companyName: record?.companyName ?? "",
            clientType: (record?.clientType as (typeof clientTypes)[number]) ?? "DIRECT_BRAND",
            primaryContactName: record?.primaryContactName ?? "",
            primaryContactEmail: record?.primaryContactEmail ?? "",
            primaryContactPhone: record?.primaryContactPhone ?? ""
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load client");
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [clientId]);

  async function handleDeactivate() {
    if (!clientId) {
      return;
    }

    const confirmed = window.confirm("Deactivate this client? This hides them from active lists.");
    if (!confirmed) {
      return;
    }

    setFormError(null);
    setSuccess(null);
    setIsDeleting(true);

    try {
      await apiFetchRaw(`/clients/${clientId}`, { method: "DELETE" });
      addToast("Client deactivated.", "success");
      navigate("/clients");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deactivate client";
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

    if (!clientId) {
      return;
    }

    if (!formValues.companyName.trim()) {
      setFormError("Company name is required.");
      return;
    }

    if (!formValues.primaryContactName.trim()) {
      setFormError("Primary contact name is required.");
      return;
    }

    if (!formValues.primaryContactEmail.trim()) {
      setFormError("Primary contact email is required.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = await apiFetchRaw<{ client: Client }>(`/clients/${clientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          companyName: formValues.companyName.trim(),
          clientType: formValues.clientType,
          primaryContactName: formValues.primaryContactName.trim(),
          primaryContactEmail: formValues.primaryContactEmail.trim(),
          primaryContactPhone: formValues.primaryContactPhone.trim() || undefined
        })
      });
      setClient(payload.data?.client ?? null);
      setSuccess("Client updated.");
      addToast("Client updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update client";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (!clientId) {
    return (
      <div className="min-h-screen px-6 py-10">
        <p className="text-sm text-dusk/80">Client ID missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link className="text-xs uppercase tracking-[0.3em] text-dusk/60" to="/clients">
          ← Back to clients
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {client && (
          <div className="rounded-3xl bg-white/90 p-8 shadow-[0_30px_70px_rgba(12,18,33,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Client</p>
                <h1 className="mt-2 font-display text-3xl font-semibold text-ink">{client.companyName}</h1>
                <p className="mt-2 text-sm text-dusk/70">
                  {client.primaryContactName} · {client.primaryContactEmail}
                </p>
                {client.primaryContactPhone && (
                  <p className="mt-1 text-xs text-dusk/60">{client.primaryContactPhone}</p>
                )}
              </div>
              <span
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  typeColors[client.clientType] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {client.clientType.replace("_", " ")}
              </span>
            </div>
          </div>
        )}

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6"
          onSubmit={handleSave}
        >
          <h2 className="font-display text-2xl font-semibold text-ink">Edit client</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Company name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.companyName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, companyName: event.target.value }))
                }
              />
            </label>
            <label className="text-sm text-ink">
              Client type
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.clientType}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, clientType: event.target.value }))
                }
              >
                {clientTypes.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Primary contact name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.primaryContactName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, primaryContactName: event.target.value }))
                }
              />
            </label>
            <label className="text-sm text-ink">
              Primary contact email
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.primaryContactEmail}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, primaryContactEmail: event.target.value }))
                }
                type="email"
              />
            </label>
            <label className="text-sm text-ink">
              Primary contact phone (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.primaryContactPhone}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, primaryContactPhone: event.target.value }))
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
              className="h-11 rounded-2xl border border-red-200 bg-red-50 px-6 text-sm font-semibold text-red-700 disabled:opacity-50"
              type="button"
              onClick={handleDeactivate}
              disabled={isDeleting}
            >
              {isDeleting ? "Deactivating..." : "Deactivate client"}
            </button>
          </div>
        </form>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6">
          <h2 className="font-display text-2xl font-semibold text-ink">Projects</h2>
          {client?.projects && client.projects.length > 0 ? (
            <div className="mt-4 space-y-3">
              {client.projects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dusk/10 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{project.name}</p>
                    <p className="text-xs text-dusk/70">{project.code} · {project.type}</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em] text-dusk/60">
                    {project.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-dusk/70">No projects linked yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
