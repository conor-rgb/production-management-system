import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetchRaw } from "../lib/api";
import { useToast } from "../components/ToastProvider";

type TalentProfile = {
  id: string;
  fullName: string;
  stageName?: string | null;
  email?: string | null;
  phone?: string | null;
  talentType: string;
  experienceLevel?: string | null;
  dayRate?: number | null;
  halfDayRate?: number | null;
  hourlyRate?: number | null;
  active: boolean;
};

type TalentResponse = {
  data: TalentProfile[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

const talentTypes = [
  "MODEL",
  "ACTOR",
  "PRESENTER",
  "INFLUENCER",
  "HAND_MODEL",
  "DANCER",
  "VOICE_ARTIST",
  "EXTRA"
] as const;

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function Talent() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [talent, setTalent] = useState<TalentProfile[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState({
    fullName: "",
    stageName: "",
    email: "",
    phone: "",
    talentType: "MODEL",
    experienceLevel: "",
    dayRate: "",
    halfDayRate: "",
    hourlyRate: ""
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "12");
    if (search) {
      params.set("search", search);
    }
    if (typeFilter) {
      params.set("talentType", typeFilter);
    }
    return params.toString();
  }, [page, search, typeFilter]);

  async function fetchTalent() {
    const payload = await apiFetchRaw<TalentProfile[] & { pagination?: TalentResponse["pagination"] }>(
      `/talent?${query}`
    );
    const list = Array.isArray(payload.data) ? payload.data : [];
    const pagination = (payload as unknown as TalentResponse).pagination;
    setTalent(list);
    setTotalPages(pagination?.totalPages ?? 1);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadTalent() {
      setError(null);
      try {
        const payload = await apiFetchRaw<TalentProfile[] & { pagination?: TalentResponse["pagination"] }>(
          `/talent?${query}`
        );
        if (isMounted) {
          const list = Array.isArray(payload.data) ? payload.data : [];
          const pagination = (payload as unknown as TalentResponse).pagination;
          setTalent(list);
          setTotalPages(pagination?.totalPages ?? 1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load talent");
        }
      }
    }

    loadTalent();

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

    setIsSaving(true);

    try {
      await apiFetchRaw("/talent", {
        method: "POST",
        body: JSON.stringify({
          fullName: formValues.fullName.trim(),
          stageName: formValues.stageName.trim() || undefined,
          email: formValues.email.trim() || undefined,
          phone: formValues.phone.trim() || undefined,
          talentType: formValues.talentType,
          experienceLevel: formValues.experienceLevel.trim() || undefined,
          dayRate: formValues.dayRate ? toOptionalNumber(formValues.dayRate) : undefined,
          halfDayRate: formValues.halfDayRate ? toOptionalNumber(formValues.halfDayRate) : undefined,
          hourlyRate: formValues.hourlyRate ? toOptionalNumber(formValues.hourlyRate) : undefined
        })
      });

      setFormValues({
        fullName: "",
        stageName: "",
        email: "",
        phone: "",
        talentType: "MODEL",
        experienceLevel: "",
        dayRate: "",
        halfDayRate: "",
        hourlyRate: ""
      });
      addToast("Talent created.", "success");
      setPage(1);
      await fetchTalent();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create talent profile";
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
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Talent</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Talent Directory</h1>
        </div>

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_20px_50px_rgba(12,18,33,0.08)]"
          onSubmit={handleCreate}
        >
          <h2 className="font-display text-xl font-semibold text-ink">Add talent</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Full name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.fullName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, fullName: event.target.value }))
                }
                placeholder="Talent full name"
              />
            </label>
            <label className="text-sm text-ink">
              Stage name (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.stageName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, stageName: event.target.value }))
                }
                placeholder="Stage name"
              />
            </label>
            <label className="text-sm text-ink">
              Email (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.email}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="talent@email.com"
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
            <label className="text-sm text-ink">
              Talent type
              <select
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.talentType}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, talentType: event.target.value }))
                }
              >
                {talentTypes.map((value) => (
                  <option key={value} value={value}>
                    {value.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
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
              Day rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.dayRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, dayRate: event.target.value }))
                }
                placeholder="1000"
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
                placeholder="650"
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-ink">
              Hourly rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.hourlyRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, hourlyRate: event.target.value }))
                }
                placeholder="120"
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
            {isSaving ? "Creating..." : "Add talent"}
          </button>
        </form>

        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-11 rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
              placeholder="Search by name, stage name, or email"
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
              {talentTypes.map((value) => (
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
          {talent.map((profile) => (
            <div
              key={profile.id}
              className="rounded-3xl border border-white/70 bg-white/90 p-6 text-left shadow-[0_20px_50px_rgba(12,18,33,0.08)] transition hover:-translate-y-1 hover:shadow-[0_30px_70px_rgba(12,18,33,0.12)]"
              onClick={() => navigate(`/talent/${profile.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  navigate(`/talent/${profile.id}`);
                }
              }}
            >
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                {profile.talentType.replace("_", " ").toLowerCase()}
              </p>
              <h3 className="mt-4 text-xl font-semibold text-ink">{profile.fullName}</h3>
              {profile.stageName && (
                <p className="mt-1 text-xs text-dusk/60">Stage: {profile.stageName}</p>
              )}
              {profile.email && <p className="mt-2 text-sm text-dusk/70">{profile.email}</p>}
              {profile.phone && <p className="mt-1 text-xs text-dusk/60">{profile.phone}</p>}
              {(profile.dayRate ?? profile.hourlyRate) && (
                <p className="mt-3 text-xs text-dusk/60">
                  {profile.dayRate ? `Day £${profile.dayRate}` : ""}{" "}
                  {profile.hourlyRate ? `· Hour £${profile.hourlyRate}` : ""}
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
