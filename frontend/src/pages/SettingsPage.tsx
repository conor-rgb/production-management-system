import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CrewRole } from "../lib/types";

export default function SettingsPage() {
  const { email } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [newRole, setNewRole] = useState("");
  const [roleError, setRoleError] = useState("");

  async function loadRoles() {
    const data = await api.get<CrewRole[]>("/api/settings/crew-roles");
    setRoles(data);
  }

  useEffect(() => { loadRoles().catch(console.error); }, []);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setLoading(true);
    try {
      await api.patch("/api/settings/password", { currentPassword, newPassword });
      setMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function addRole() {
    if (!newRole.trim()) return;
    setRoleError("");
    try {
      await api.post("/api/settings/crew-roles", { name: newRole.trim() });
      setNewRole("");
      await loadRoles();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Failed to add role");
    }
  }

  async function updateRole(id: string, name: string) {
    await api.patch(`/api/settings/crew-roles/${id}`, { name });
    await loadRoles();
  }

  async function deleteRole(id: string) {
    setRoleError("");
    try {
      await api.delete(`/api/settings/crew-roles/${id}`);
      await loadRoles();
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  return (
    <div className="max-w-3xl p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-1 font-medium text-gray-900">Account</h2>
        <p className="text-sm text-gray-500">Signed in as <span className="text-gray-700">{email}</span></p>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-gray-900">Crew roles</h2>
        <div className="mb-3 flex gap-2">
          <input
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Add role"
            className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button onClick={addRole} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-gray-900 text-white">
            <Plus size={18} />
          </button>
        </div>
        {roleError && <p className="mb-2 text-sm text-red-500">{roleError}</p>}
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {roles.map((role) => (
            <RoleRow key={role.id} role={role} onSave={updateRole} onDelete={deleteRole} />
          ))}
          {roles.length === 0 && <p className="p-4 text-center text-sm text-gray-400">No crew roles yet.</p>}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-gray-900">Change password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <PasswordInput label="Current password" value={currentPassword} onChange={setCurrentPassword} />
          <PasswordInput label="New password" value={newPassword} onChange={setNewPassword} />
          {msg && <p className="text-sm text-green-600">{msg}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}

function RoleRow({ role, onSave, onDelete }: { role: CrewRole; onSave: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState(role.name);

  return (
    <div className="flex items-center gap-2 p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== role.name && onSave(role.id, name.trim())}
        className="min-h-11 flex-1 rounded-lg border border-transparent px-2 text-sm outline-none focus:border-gray-200"
      />
      <button onClick={() => onDelete(role.id)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-500 hover:bg-red-50">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function PasswordInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-gray-600">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </label>
  );
}
