import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
  notes?: string | null;
  active: boolean;
};

const taxStatuses = ["PAYE", "SELF_EMPLOYED", "LTD_COMPANY"] as const;

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function CrewDetail() {
  const { crewId } = useParams();
  const { addToast } = useToast();
  const [crewMember, setCrewMember] = useState<CrewMember | null>(null);
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
    kitFee: "",
    notes: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!crewId) {
        return;
      }
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetchRaw<{ crewMember: CrewMember }>(`/crew/${crewId}`);
        if (isMounted) {
          const record = payload.data?.crewMember ?? null;
          setCrewMember(record);
          setFormValues({
            fullName: record?.fullName ?? "",
            email: record?.email ?? "",
            mobile: record?.mobile ?? "",
            primaryRole: record?.primaryRole ?? "",
            experienceLevel: record?.experienceLevel ?? "",
            taxStatus: record?.taxStatus ?? "",
            dayRate: record?.dayRate ? String(record.dayRate) : "",
            halfDayRate: record?.halfDayRate ? String(record.halfDayRate) : "",
            overtimeRate: record?.overtimeRate ? String(record.overtimeRate) : "",
            kitFee: record?.kitFee ? String(record.kitFee) : "",
            notes: record?.notes ?? ""
          });
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load crew member");
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [crewId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!crewId) {
      return;
    }

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
      const payload = await apiFetchRaw<{ crewMember: CrewMember }>(`/crew/${crewId}`, {
        method: "PATCH",
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
          kitFee: formValues.kitFee ? toOptionalNumber(formValues.kitFee) : undefined,
          notes: formValues.notes.trim() || undefined
        })
      });
      setCrewMember(payload.data?.crewMember ?? null);
      setSuccess("Crew member updated.");
      addToast("Crew member updated.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update crew member";
      setFormError(message);
      addToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  }

  if (!crewId) {
    return (
      <div className="min-h-screen px-6 py-10">
        <p className="text-sm text-dusk/80">Crew ID missing.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link className="text-xs uppercase tracking-[0.3em] text-dusk/60" to="/crew">
          ← Back to crew
        </Link>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {crewMember && (
          <div className="rounded-3xl bg-white/90 p-8 shadow-[0_30px_70px_rgba(12,18,33,0.12)]">
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">Crew member</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
              {crewMember.fullName}
            </h1>
            <p className="mt-2 text-sm text-dusk/70">
              {crewMember.primaryRole} · {crewMember.email}
            </p>
          </div>
        )}

        <form
          className="rounded-3xl border border-white/70 bg-white/90 p-6"
          onSubmit={handleSave}
        >
          <h2 className="font-display text-2xl font-semibold text-ink">Edit crew member</h2>
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
              Email
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
              Mobile (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.mobile}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, mobile: event.target.value }))
                }
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
              Overtime rate (optional)
              <input
                className="mt-2 h-11 w-full rounded-2xl border border-dusk/10 bg-white px-4 text-sm focus:border-accentDeep focus:outline-none"
                value={formValues.overtimeRate}
                onChange={(event) =>
                  setFormValues((prev) => ({ ...prev, overtimeRate: event.target.value }))
                }
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
