import { useState, useEffect, type FormEvent } from "react";
import { api } from "../../lib/api";
import type { OpportunityListItem, Contact, Company } from "../../lib/types";
import { X } from "lucide-react";

const JOB_TYPE_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "STILLS", label: "Stills" },
  { value: "MOTION", label: "Motion" },
  { value: "EVENTS", label: "Events" },
];

const SOURCE_OPTIONS = [
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "DM", label: "DM" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
];

const STAGE_OPTIONS = [
  { value: "ENQUIRY", label: "Enquiry" },
  { value: "BIDDING", label: "Bidding" },
  { value: "QUOTED", label: "Quoted" },
];

interface Props {
  opp: OpportunityListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function OpportunityModal({ opp, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    title: opp?.title ?? "",
    clientName: opp?.clientName ?? "",
    brand: opp?.brand ?? "",
    jobType: opp?.jobType ?? "",
    source: opp?.source ?? "OTHER",
    contactId: opp?.contact?.id ?? "",
    companyId: opp?.company?.id ?? "",
    description: opp?.description ?? "",
    value: opp?.value ?? "",
    stage: opp?.stage ?? "ENQUIRY",
    followUpDate: opp?.followUpDate ? opp.followUpDate.split("T")[0] : "",
    dateReceived: opp?.dateReceived ? opp.dateReceived.split("T")[0] : "",
    notes: opp?.notes ?? "",
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Contact[]>("/api/contacts"),
      api.get<Company[]>("/api/companies"),
    ]).then(([c, cos]) => {
      setContacts(c);
      setCompanies(cos);
    }).catch(console.error);
  }, []);

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        ...form,
        jobType: form.jobType || undefined,
        contactId: form.contactId || undefined,
        companyId: form.companyId || undefined,
        value: form.value || undefined,
        followUpDate: form.followUpDate || undefined,
        dateReceived: form.dateReceived || undefined,
      };
      if (opp) {
        await api.patch(`/api/opportunities/${opp.id}`, payload);
      } else {
        await api.post("/api/opportunities", payload);
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
          <h2 className="font-semibold text-gray-900">{opp ? "Edit opportunity" : "New opportunity"}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-4 space-y-3">
          <Field label="Title *">
            <input required value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Client name">
              <input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Brand">
              <input value={form.brand} onChange={(e) => set("brand", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Job type">
              <select value={form.jobType} onChange={(e) => set("jobType", e.target.value)} className={inputCls}>
                {JOB_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Estimated value (£)">
              <input type="number" step="0.01" value={form.value} onChange={(e) => set("value", e.target.value)} className={inputCls} placeholder="0.00" />
            </Field>
          </div>

          <Field label="Source">
            <select value={form.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          <Field label="Contact">
            <select value={form.contactId} onChange={(e) => set("contactId", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName}{c.lastName ? ` ${c.lastName}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Company">
            <select value={form.companyId} onChange={(e) => set("companyId", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </select>
          </Field>

          {!opp && (
            <Field label="Stage">
              <select value={form.stage} onChange={(e) => set("stage", e.target.value)} className={inputCls}>
                {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date received">
              <input type="date" value={form.dateReceived} onChange={(e) => set("dateReceived", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Follow-up date">
              <input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="Description">
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className={inputCls} />
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputCls} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400";
