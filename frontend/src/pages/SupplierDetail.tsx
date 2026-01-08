import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

export default function SupplierDetail() {
  const { supplierId } = useParams();
  const { addToast } = useToast();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [formValues, setFormValues] = useState({
    companyName: "",
    category: "VENUE",
    email: "",
    phone: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!supplierId) {
        return;
      }
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetchRaw<{ supplier: Supplier }>(`/suppliers/${supplierId}`);
        if (isMounted) {
          const record = payload.data?.supplier ?? null;
          setSupplier(record);
          setFormValues({
            companyName: record?.companyName ?? "",
            category: record?.category ?? "VENUE",
            email: record?.email ?? "",
            phone: record?.phone ?? ""
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load supplier");
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [supplierId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!supplierId) {
      return;
    }

    if (!formValues.companyName.trim()) {
      setFormError("Company name is required.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = await apiFetchRaw<{ supplier: Supplier }>(`/suppliers/${supplierId}`, {
        method: "PATCH",
        body: JSON.stringify({
          companyName: formValues.companyName.trim(),
          category: formValues.category,
          email: formValues.email.trim() || undefined,
          phone: formValues.phone.trim() || undefined
        })
      });
      setSupplier(payload.data?.supplier ?? null);
      setSuccess("Supplier updated.");
      addToast("Supplier updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update supplier";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (!supplierId) {
    return (
      <div className="min-h-screen px-6 py-10">
        <p className="text-sm text-dusk/80">Supplier ID missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link className="text-xs uppercase tracking-[0.3em] text-dusk/60" to="/suppliers">
          ← Back to suppliers
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {supplier && (
          <div className="rounded-3xl bg-white/90 p-8 shadow-[0_30px_70px_rgba(12,18,33,0.12)]">
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Supplier</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
              {supplier.companyName}
            </h1>
            <p className="mt-2 text-sm text-dusk/70">
              {supplier.category.replace("_", " ").toLowerCase()}
            </p>
          </div>
        )}

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6"
          onSubmit={handleSave}
        >
          <h2 className="font-display text-2xl font-semibold text-ink">Edit supplier</h2>
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
              />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
          <button
            className="mt-4 h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
