import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

type CrewMember = {
  id: string;
  fullName: string;
  email: string;
  mobile?: string | null;
  primaryRole: string;
  experienceLevel?: string | null;
  taxStatus?: string | null;
  dayRate?: number | null;
  halfDayRate?: number | null;
  overtimeRate?: number | null;
  kitFee?: number | null;
  active: boolean;
};

type CrewResponse = {
  data: CrewMember[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const taxStatuses = ["PAYE", "SELF_EMPLOYED", "LTD_COMPANY"] as const;

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function Crew() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    fullName: "",
    email: "",
    mobile: "",
    primaryRole: "",
    experienceLevel: "",
    taxStatus: "",
    dayRate: "",
    halfDayRate: "",
    overtimeRate: "",
    kitFee: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "12");
    if (search) {
      params.set("search", search);
    }
    if (roleFilter) {
      params.set("role", roleFilter);
    }
    return params.toString();
  }, [page, search, roleFilter]);

  async function fetchCrew() {
    const payload = await apiFetchRaw<CrewMember[] & { pagination?: CrewResponse["pagination"] }>(
      `/crew?${query}`
    );
    const list = Array.isArray(payload.data) ? payload.data : [];
    const pagination = (payload as unknown as CrewResponse).pagination;
    setCrew(list);
    setTotalPages(pagination?.totalPages ?? 1);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadCrew() {
      setError(null);
      try {
        const payload = await apiFetchRaw<CrewMember[] & { pagination?: CrewResponse["pagination"] }>(
          `/crew?${query}`
        );
        if (isMounted) {
          const list = Array.isArray(payload.data) ? payload.data : [];
          const pagination = (payload as unknown as CrewResponse).pagination;
          setCrew(list);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load crew");
        }
      }
    }

    loadCrew();

    return () => {
      isMounted = false;
    };
  }, [query]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!formValues.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }

    if (!formValues.email.trim()) {
      setFormError("Email is required.");
      return;
    }

    if (!formValues.primaryRole.trim()) {
      setFormError("Primary role is required.");
      return;
    }

    setIsSaving(true);

    try {
      await apiFetchRaw("/crew", {
        method: "POST",
        body: JSON.stringify({
          fullName: formValues.fullName.trim(),
          email: formValues.email.trim(),
          mobile: formValues.mobile.trim() || undefined,
          primaryRole: formValues.primaryRole.trim(),
          experienceLevel: formValues.experienceLevel.trim() || undefined,
          taxStatus: formValues.taxStatus || undefined,
          dayRate: formValues.dayRate ? toOptionalNumber(formValues.dayRate) : undefined,
          halfDayRate: formValues.halfDayRate ? toOptionalNumber(formValues.halfDayRate) : undefined,
          overtimeRate: formValues.overtimeRate ? toOptionalNumber(formValues.overtimeRate) : undefined,
          kitFee: formValues.kitFee ? toOptionalNumber(formValues.kitFee) : undefined
        })
      });

      setFormValues({
        fullName: "",
        email: "",
        mobile: "",
        primaryRole: "",
        experienceLevel: "",
        taxStatus: "",
        dayRate: "",
        halfDayRate: "",
        overtimeRate: "",
        kitFee: ""
      });
      addToast("Crew member created.", "success");
      setPage(1);
      await fetchCrew();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create crew member";
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
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Crew</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Crew Directory</h1>
        </div>

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
          onSubmit={handleCreate}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Add crew member</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Full name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.fullName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder="Crew member name"
              />
            </label>
            <label className="text-sm text-ink">
              Email
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.email}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="crew@email.com"
                type="email"
              />
            </label>
            <label className="text-sm text-ink">
              Mobile (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.mobile}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, mobile: event.target.value }))
                }
                placeholder="+44 7xxx"
              />
            </label>
            <label className="text-sm text-ink">
              Primary role
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.primaryRole}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, primaryRole: event.target.value }))
                }
                placeholder="Photographer, Producer, etc."
              />
            </label>
            <label className="text-sm text-ink">
              Experience level (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.experienceLevel}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, experienceLevel: event.target.value }))
                }
                placeholder="Senior, Mid, Junior"
              />
            </label>
            <label className="text-sm text-ink">
              Tax status (optional)
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.taxStatus}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, taxStatus: event.target.value }))
                }
              >
                <option value="">Select status</option>
                {taxStatuses.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Day rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.dayRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, dayRate: event.target.value }))
                }
                placeholder="850"
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-ink">
              Half day rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.halfDayRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, halfDayRate: event.target.value }))
                }
                placeholder="500"
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-ink">
              Overtime rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.overtimeRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, overtimeRate: event.target.value }))
                }
                placeholder="120"
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-ink">
              Kit fee (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.kitFee}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, kitFee: event.target.value }))
                }
                placeholder="75"
                inputMode="decimal"
              />
            </label>
          </div>
          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <button
            className="mt-4 h-11 rounded-2xl bg-ink px-6 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Add crew member"}
          </button>
        </form>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              placeholder="Search by name or email"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
            />
            <input
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              placeholder="Filter by role"
              value={roleFilter}
              onChange={(event) => {
                setPage(1);
                setRoleFilter(event.target.value);
              }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {crew.map((member) => (
            <div
              key={member.id}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 text-left shadow-[0_20px_50px_rgba(12,18,33,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
              onClick={() => navigate(`/crew/${member.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  navigate(`/crew/${member.id}`);
                }
              }}
            >
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">{member.primaryRole}</p>
              <h3 className="mt-4 text-xl font-semibold text-ink">{member.fullName}</h3>
              <p className="mt-2 text-sm text-dusk/70">{member.email}</p>
              {member.mobile && <p className="mt-1 text-xs text-dusk/60">{member.mobile}</p>}
              {(member.dayRate ?? member.halfDayRate) && (
                <p className="mt-3 text-xs text-dusk/60">
                  {member.dayRate ? `Day £${member.dayRate}` : ""}{" "}
                  {member.halfDayRate ? `· Half £${member.halfDayRate}` : ""}
                </p>
              )}
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
