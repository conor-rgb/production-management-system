import { useState } from "react";
import { api } from "../../lib/api";
import { X } from "lucide-react";

const LOST_REASONS = [
  { value: "COMPETITOR_WON", label: "Competitor won" },
  { value: "BUDGET_PULLED", label: "Budget pulled" },
  { value: "NO_RESPONSE", label: "No response" },
  { value: "TIMING", label: "Timing" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  oppId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function LostModal({ oppId, onClose, onSaved }: Props) {
  const [reason, setReason] = useState("COMPETITOR_WON");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      await api.post(`/api/opportunities/${oppId}/stage`, {
        stage: "LOST",
        lostReason: reason,
        lostNote: note || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-sm flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Mark as lost</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Reason *</label>
            <div className="space-y-2">
              {LOST_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Additional notes</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-red-700"
          >
            {loading ? "Saving…" : "Mark as lost"}
          </button>
        </div>
      </div>
    </div>
  );
}
