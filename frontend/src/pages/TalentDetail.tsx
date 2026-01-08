import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  notes?: string | null;
  active: boolean;
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

export default function TalentDetail() {
  const { talentId } = useParams();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [formValues, setFormValues] = useState({
    fullName: "",
    stageName: "",
    email: "",
    phone: "",
    talentType: "MODEL",
    experienceLevel: "",
    dayRate: "",
    halfDayRate: "",
    hourlyRate: "",
    notes: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!talentId) {
        return;
      }
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetchRaw<{ profile: TalentProfile }>(`/talent/${talentId}`);
        if (isMounted) {
          const record = payload.data?.profile ?? null;
          setProfile(record);
          setFormValues({
            fullName: record?.fullName ?? "",
            stageName: record?.stageName ?? "",
            email: record?.email ?? "",
            phone: record?.phone ?? "",
            talentType: record?.talentType ?? "MODEL",
            experienceLevel: record?.experienceLevel ?? "",
            dayRate: record?.dayRate ? String(record.dayRate) : "",
            halfDayRate: record?.halfDayRate ? String(record.halfDayRate) : "",
            hourlyRate: record?.hourlyRate ? String(record.hourlyRate) : "",
            notes: record?.notes ?? ""
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load talent");
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [talentId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!talentId) {
      return;
    }

    if (!formValues.fullName.trim()) {
      setFormError("Full name is required.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = await apiFetchRaw<{ profile: TalentProfile }>(`/talent/${talentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: formValues.fullName.trim(),
          stageName: formValues.stageName.trim() || undefined,
          email: formValues.email.trim() || undefined,
          phone: formValues.phone.trim() || undefined,
          talentType: formValues.talentType,
          experienceLevel: formValues.experienceLevel.trim() || undefined,
          dayRate: formValues.dayRate ? toOptionalNumber(formValues.dayRate) : undefined,
          halfDayRate: formValues.halfDayRate ? toOptionalNumber(formValues.halfDayRate) : undefined,
          hourlyRate: formValues.hourlyRate ? toOptionalNumber(formValues.hourlyRate) : undefined,
          notes: formValues.notes.trim() || undefined
        })
      });
      setProfile(payload.data?.profile ?? null);
      setSuccess("Talent updated.");
      addToast("Talent updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update talent";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (!talentId) {
    return (
      <div className="min-h-screen px-6 py-10">
        <p className="text-sm text-dusk/80">Talent ID missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link className="text-xs uppercase tracking-[0.3em] text-dusk/60" to="/talent">
          ← Back to talent
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {profile && (
          <div className="rounded-3xl bg-white/90 p-8 shadow-[0_30px_70px_rgba(12,18,33,0.12)]">
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Talent profile</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
              {profile.fullName}
            </h1>
            <p className="mt-2 text-sm text-dusk/70">
              {profile.talentType.replace("_", " ").toLowerCase()}
              {profile.stageName ? ` · ${profile.stageName}` : ""}
            </p>
          </div>
        )}

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6"
          onSubmit={handleSave}
        >
          <h2 className="font-display text-2xl font-semibold text-ink">Edit talent</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-ink">
              Full name
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.fullName}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, fullName: event.target.value }))
                }
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
                inputMode="decimal"
              />
            </label>
            <label className="text-sm text-ink md:col-span-2">
              Notes (optional)
              <textarea
                className="mt-2 min-h-[100px] w-full rounded-2xl border border-dusk/10 bg-white px-4 py-3 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.notes}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, notes: event.target.value }))
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
