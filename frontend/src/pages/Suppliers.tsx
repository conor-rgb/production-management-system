import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

type Supplier = {
  id: string;
  companyName: string;
  category: string;
  email?: string | null;
  phone?: string | null;
  active: boolean;
};

type SuppliersResponse = {
  data: Supplier[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const supplierCategories = [
  "VENUE",
  "CATERING",
  "EQUIPMENT_RENTAL",
  "TRANSPORT",
  "POST_PRODUCTION",
  "TALENT_AGENCY",
  "CREW_AGENCY",
  "PRINTING",
  "PROPS",
  "WARDROBE",
  "OTHER"
] as const;

export default function Suppliers() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    companyName: "",
    category: "VENUE",
    email: "",
    phone: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "12");
    if (search) {
      params.set("search", search);
    }
    if (categoryFilter) {
      params.set("category", categoryFilter);
    }
    return params.toString();
  }, [page, search, categoryFilter]);

  async function fetchSuppliers() {
    const payload = await apiFetchRaw<Supplier[] & { pagination?: SuppliersResponse["pagination"] }>(
      `/suppliers?${query}`
    );
    const list = Array.isArray(payload.data) ? payload.data : [];
    const pagination = (payload as unknown as SuppliersResponse).pagination;
    setSuppliers(list);
    setTotalPages(pagination?.totalPages ?? 1);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadSuppliers() {
      setError(null);
      try {
        const payload = await apiFetchRaw<Supplier[] & { pagination?: SuppliersResponse["pagination"] }>(
          `/suppliers?${query}`
        );
        if (isMounted) {
          const list = Array.isArray(payload.data) ? payload.data : [];
          const pagination = (payload as unknown as SuppliersResponse).pagination;
          setSuppliers(list);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load suppliers");
        }
      }
    }

    loadSuppliers();

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

    setIsSaving(true);

    try {
      await apiFetchRaw("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          companyName: formValues.companyName.trim(),
          category: formValues.category,
          email: formValues.email.trim() || undefined,
          phone: formValues.phone.trim() || undefined
        })
      });

      setFormValues({
        companyName: "",
        category: "VENUE",
        email: "",
        phone: ""
      });
      addToast("Supplier created.", "success");
      setPage(1);
      await fetchSuppliers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create supplier";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Suppliers</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Supplier Directory</h1>
        </div>

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
          onSubmit={handleCreate}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Add supplier</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Company name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.companyName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, companyName: event.target.value }))
                }
                placeholder="Supplier company"
              />
            </label>
            <label className="text-sm text-ink">
              Category
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.category}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                {supplierCategories.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Email (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.email}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="team@supplier.com"
                type="email"
              />
            </label>
            <label className="text-sm text-ink">
              Phone (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.phone}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, phone: event.target.value }))
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
            {isSaving ? "Creating..." : "Add supplier"}
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
              value={categoryFilter}
              onChange={(event) => {
                setPage(1);
                setCategoryFilter(event.target.value);
              }}
            >
              <option value="">All categories</option>
              {supplierCategories.map((value) => (
                <option key={value} value={value}>
                  {value.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 text-left shadow-[0_20px_50px_rgba(12,18,33,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
              onClick={() => navigate(`/suppliers/${supplier.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  navigate(`/suppliers/${supplier.id}`);
                }
              }}
            >
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                {supplier.category.replace("_", " ").toLowerCase()}
              </p>
              <h3 className="mt-4 text-xl font-semibold text-ink">{supplier.companyName}</h3>
              {supplier.email && <p className="mt-2 text-sm text-dusk/70">{supplier.email}</p>}
              {supplier.phone && <p className="mt-1 text-xs text-dusk/60">{supplier.phone}</p>}
            </div>
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
