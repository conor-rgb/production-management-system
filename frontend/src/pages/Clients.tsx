import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

const tierColors: Record<string, string> = {
  DIRECT_BRAND: "bg-emerald-100 text-emerald-900",
  AGENCY: "bg-blue-100 text-blue-900",
  CORPORATE: "bg-amber-100 text-amber-900"
};

type Client = {
  id: string;
  companyName: string;
  clientType: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string | null;
  active: boolean;
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

const clientTypes = ["DIRECT_BRAND", "AGENCY", "CORPORATE"] as const;

export default function Clients() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    companyName: "",
    clientType: "DIRECT_BRAND",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "12");
    if (search) {
      params.set("search", search);
    }
    if (typeFilter) {
      params.set("clientType", typeFilter);
    }
    return params.toString();
  }, [page, search, typeFilter]);

  async function fetchClients() {
    const payload = await apiFetchRaw<Client[] & { pagination?: ClientsResponse["pagination"] }>(
      `/clients?${query}`
    );
    const list = Array.isArray(payload.data) ? payload.data : [];
    const pagination = (payload as unknown as ClientsResponse).pagination;
    setClients(list);
    setTotalPages(pagination?.totalPages ?? 1);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadClients() {
      setError(null);
      try {
        const payload = await apiFetchRaw<Client[] & { pagination?: ClientsResponse["pagination"] }>(
          `/clients?${query}`
        );
        if (isMounted) {
          const list = Array.isArray(payload.data) ? payload.data : [];
          const pagination = (payload as unknown as ClientsResponse).pagination;
          setClients(list);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load clients");
        }
      }
    }

    loadClients();

    return () => {
      isMounted = false;
    };
  }, [query]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

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
      await apiFetchRaw("/clients", {
        method: "POST",
        body: JSON.stringify({
          companyName: formValues.companyName.trim(),
          clientType: formValues.clientType,
          primaryContactName: formValues.primaryContactName.trim(),
          primaryContactEmail: formValues.primaryContactEmail.trim(),
          primaryContactPhone: formValues.primaryContactPhone.trim() || undefined
        })
      });

      setFormValues({
        companyName: "",
        clientType: "DIRECT_BRAND",
        primaryContactName: "",
        primaryContactEmail: "",
        primaryContactPhone: ""
      });
      addToast("Client created.", "success");
      setPage(1);
      await fetchClients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create client";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Clients</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Client Directory</h1>
          </div>
        </div>

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
          onSubmit={handleCreate}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Add client</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Company name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.companyName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, companyName: event.target.value }))
                }
                placeholder="Client company"
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
                placeholder="Contact name"
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
                placeholder="email@client.com"
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
                placeholder="+44 7xxx"
              />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <button
            className="mt-4 h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Add client"}
          </button>
        </form>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              placeholder="Search by company or email"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <select
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              value={typeFilter}
              onChange={(event) => {
                setPage(1);
                setTypeFilter(event.target.value);
              }}
            >
              <option value="">All types</option>
              <option value="DIRECT_BRAND">Direct brand</option>
              <option value="AGENCY">Agency</option>
              <option value="CORPORATE">Corporate</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => (
            <button
              key={client.id}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 text-left shadow-[0_20px_50px_rgba(12,18,33,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
              onClick={() => navigate(`/clients/${client.id}`)}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.3em] text-dusk/60">{client.primaryContactName}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    tierColors[client.clientType] ?? "bg-slate-100 text-slate-700"
                  }`}
                >
                  {client.clientType.replace("_", " ")}
                </span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-ink">{client.companyName}</h3>
              <p className="mt-2 text-sm text-dusk/70">{client.primaryContactEmail}</p>
              {client.primaryContactPhone && (
                <p className="mt-1 text-xs text-dusk/60">{client.primaryContactPhone}</p>
              )}
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
