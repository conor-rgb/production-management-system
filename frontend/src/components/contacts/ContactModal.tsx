import { useState, useEffect, type FormEvent } from "react";
import { api } from "../../lib/api";
import type { Contact, ContactType, ContactSource, Company } from "../../lib/types";
import { X } from "lucide-react";

const AVAILABLE_TAGS = ["Returning client", "Warm lead", "Key account", "Key crew", "VIP", "Other"];

interface Props {
  contact: Contact | null;
  defaultType?: ContactType;
  onClose: () => void;
  onSaved: () => void;
}

export default function ContactModal({ contact, defaultType = "CLIENT", onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    firstName: contact?.firstName ?? "",
    lastName: contact?.lastName ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    companyId: contact?.companyId ?? "",
    jobTitle: contact?.jobTitle ?? "",
    type: (contact?.type ?? defaultType) as ContactType,
    source: (contact?.source ?? "OTHER") as ContactSource,
    tags: contact?.tags ?? [] as string[],
    notes: contact?.notes ?? "",
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Company[]>("/api/companies").then(setCompanies).catch(console.error);
  }, []);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTag(tag: string) {
    set("tags", form.tags.includes(tag)
      ? form.tags.filter((t) => t !== tag)
      : [...form.tags, tag]);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (contact) {
        await api.patch(`/api/contacts/${contact.id}`, form);
      } else {
        await api.post("/api/contacts", form);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{contact ? "Edit contact" : "New contact"}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(["CLIENT", "SUPPLIER"] as ContactType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("type", t)}
                className={`flex-1 py-2 text-sm rounded-lg font-medium transition-colors ${
                  form.type === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First name *" required>
              <input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Last name">
              <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Company">
            <select value={form.companyId} onChange={(e) => set("companyId", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Job title / role">
            <input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Source">
            <select value={form.source} onChange={(e) => set("source", e.target.value as ContactSource)} className={inputCls}>
              <option value="REFERRAL">Referral</option>
              <option value="DIRECT">Direct</option>
              <option value="SOCIAL">Social</option>
              <option value="PREVIOUS_JOB">Previous job</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap gap-2 pt-1">
              {AVAILABLE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-300 text-gray-600 hover:border-gray-500"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={inputCls} />
          </Field>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </form>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="flex-1 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-gray-700"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{required && " *"}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";
