import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CatalogItem, CatalogSection, CrewRole, StorageInfo } from "../lib/types";
import { formatBytes } from "../lib/types";

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
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [catalog, setCatalog] = useState<CatalogSection[]>([]);
  const [catalogMode, setCatalogMode] = useState<"items" | "groups">("items");
  const [catalogError, setCatalogError] = useState("");
  const [newCatalogItem, setNewCatalogItem] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<{ id: string; name: string; description?: string; items: { id: string }[] }[]>([]);

  async function loadRoles() {
    const data = await api.get<CrewRole[]>("/api/settings/crew-roles");
    setRoles(data);
  }

  async function loadCatalog() {
    const [items, groupData] = await Promise.all([
      api.get<CatalogSection[]>("/api/catalog"),
      api.get<{ id: string; name: string; description?: string; items: { id: string }[] }[]>("/api/catalog/groups"),
    ]);
    setCatalog(items);
    setGroups(groupData);
  }

  useEffect(() => {
    loadRoles().catch(console.error);
    loadCatalog().catch(console.error);
    api.get<StorageInfo>("/api/files/storage-info").then(setStorageInfo).catch(console.error);
  }, []);

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

  async function addCatalogItem(section: string) {
    const description = newCatalogItem[section]?.trim();
    if (!description) return;
    setCatalogError("");
    try {
      await api.post("/api/catalog", { section, description });
      setNewCatalogItem((items) => ({ ...items, [section]: "" }));
      await loadCatalog();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Failed to add catalog item");
    }
  }

  async function updateCatalogItem(item: CatalogItem, patch: Partial<CatalogItem>) {
    await api.patch(`/api/catalog/${item.id}`, patch);
    await loadCatalog();
  }

  async function deleteCatalogItem(item: CatalogItem) {
    if (!window.confirm(`Delete ${item.description}?`)) return;
    await api.delete(`/api/catalog/${item.id}`);
    await loadCatalog();
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

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-gray-900">Storage</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Used</p>
            <p className="mt-1 font-semibold text-gray-900">{storageInfo ? formatBytes(storageInfo.totalBytes) : "Loading…"}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Files</p>
            <p className="mt-1 font-semibold text-gray-900">{storageInfo?.fileCount ?? "Loading…"}</p>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Base path</p>
          <p className="mt-1 break-all font-mono text-xs text-gray-700">{storageInfo?.basePath ?? "Loading…"}</p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium text-gray-900">Item catalog</h2>
          <div className="flex rounded-lg border border-gray-200 p-1">
            <button onClick={() => setCatalogMode("items")} className={`min-h-10 rounded-md px-3 text-sm ${catalogMode === "items" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Catalog Items</button>
            <button onClick={() => setCatalogMode("groups")} className={`min-h-10 rounded-md px-3 text-sm ${catalogMode === "groups" ? "bg-gray-900 text-white" : "text-gray-600"}`}>Line Item Groups</button>
          </div>
        </div>
        {catalogError && <p className="mb-2 text-sm text-red-500">{catalogError}</p>}
        {catalogMode === "items" ? (
          <div className="space-y-3">
            {catalog.map((section) => (
              <CatalogSectionEditor
                key={section.code}
                section={section}
                newValue={newCatalogItem[section.code] ?? ""}
                onNewValue={(value) => setNewCatalogItem((items) => ({ ...items, [section.code]: value }))}
                onAdd={() => addCatalogItem(section.code)}
                onUpdate={updateCatalogItem}
                onDelete={deleteCatalogItem}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-gray-900">{group.name}</p>
                <p className="mt-1 text-sm text-gray-500">{group.description ?? "No description"}</p>
                <p className="mt-2 text-xs text-gray-400">{group.items.length} items</p>
              </div>
            ))}
            {groups.length === 0 && <p className="text-sm text-gray-400">No line item groups yet.</p>}
          </div>
        )}
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

function CatalogSectionEditor({ section, newValue, onNewValue, onAdd, onUpdate, onDelete }: {
  section: CatalogSection;
  newValue: string;
  onNewValue: (value: string) => void;
  onAdd: () => void;
  onUpdate: (item: CatalogItem, patch: Partial<CatalogItem>) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(section.code === "A");

  return (
    <div className="rounded-lg border border-gray-200">
      <button onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center gap-3 px-3 text-left">
        <ChevronDown size={16} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="flex-1 text-sm font-medium text-gray-900">{section.code}) {section.name}</span>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">{section.items.length}</span>
      </button>
      {open && (
        <div className="border-t border-gray-100 p-2">
          <div className="mb-2 flex gap-2">
            <input
              value={newValue}
              onChange={(e) => onNewValue(e.target.value)}
              placeholder="Add item description"
              className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
            />
            <button onClick={onAdd} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-gray-900 text-white"><Plus size={17} /></button>
          </div>
          <div className="divide-y divide-gray-100">
            {section.items.map((item) => (
              <CatalogItemRow key={item.id} item={item} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogItemRow({ item, onUpdate, onDelete }: {
  item: CatalogItem;
  onUpdate: (item: CatalogItem, patch: Partial<CatalogItem>) => void;
  onDelete: (item: CatalogItem) => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [clientRate, setClientRate] = useState(String(item.defaultClientUnitCost));

  useEffect(() => {
    setDescription(item.description);
    setClientRate(String(item.defaultClientUnitCost));
  }, [item]);

  return (
    <div className="grid gap-2 py-2 sm:grid-cols-[1fr_120px_44px]">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description.trim() && description !== item.description && onUpdate(item, { description: description.trim() })}
        className="min-h-11 rounded-lg border border-transparent px-2 text-sm outline-none focus:border-gray-200"
      />
      <input
        type="number"
        value={clientRate}
        onChange={(e) => setClientRate(e.target.value)}
        onBlur={() => Number(clientRate) !== item.defaultClientUnitCost && onUpdate(item, { defaultClientUnitCost: Number(clientRate) })}
        className="min-h-11 rounded-lg border border-gray-200 px-2 text-sm tabular-nums outline-none focus:border-gray-400"
      />
      <button onClick={() => onDelete(item)} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-red-500 hover:bg-red-50">
        <Trash2 size={16} />
      </button>
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
