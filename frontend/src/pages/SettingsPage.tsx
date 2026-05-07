import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CatalogItem, CatalogSection, CrewRole, EmailAccount, EmailTemplate, StorageInfo } from "../lib/types";
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
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [emailHealth, setEmailHealth] = useState<Record<string, boolean>>({});
  const [emailSignature, setEmailSignature] = useState("");
  const [emailSettingsError, setEmailSettingsError] = useState("");
  const [calendarSyncStatus, setCalendarSyncStatus] = useState("");
  const [imapOpen, setImapOpen] = useState(false);
  const [imapTested, setImapTested] = useState(false);
  const [imapForm, setImapForm] = useState({
    label: "",
    emailAddress: "",
    imapHost: "imap.gmail.com",
    imapPort: "993",
    smtpHost: "smtp.gmail.com",
    smtpPort: "587",
    username: "",
    password: "",
  });
  const [templateForm, setTemplateForm] = useState({ name: "", subject: "", bodyHtml: "", defaultCc: "", defaultBcc: "" });

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

  async function loadEmailSettings() {
    const [accounts, templates, signature, health] = await Promise.all([
      api.get<EmailAccount[]>("/api/email/accounts"),
      api.get<EmailTemplate[]>("/api/email/templates"),
      api.get<{ signature: string }>("/api/email/signature"),
      api.get<{ accountId: string; connected: boolean }[]>("/api/email/health"),
    ]);
    setEmailAccounts(accounts);
    setEmailTemplates(templates);
    setEmailSignature(signature.signature || "Conor | unlimited.bond | conor@unlimited.bond");
    setEmailHealth(Object.fromEntries(health.map((item) => [item.accountId, item.connected])));
  }

  useEffect(() => {
    loadRoles().catch(console.error);
    loadCatalog().catch(console.error);
    loadEmailSettings().catch(console.error);
    api.get<StorageInfo>("/api/files/storage-info").then(setStorageInfo).catch(console.error);
  }, []);

  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.data === "gmail-connected") {
        loadEmailSettings().catch(console.error);
      }
    }
    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
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

  async function connectGmail() {
    setEmailSettingsError("");
    try {
      const data = await api.get<{ url: string }>("/api/email/oauth/google/start");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setEmailSettingsError(err instanceof Error ? err.message : "Configure Google OAuth in .env to enable Gmail");
    }
  }

  async function testImap() {
    setEmailSettingsError("");
    setImapTested(false);
    try {
      await api.post("/api/email/test-imap", {
        ...imapForm,
        imapPort: Number(imapForm.imapPort),
        smtpPort: Number(imapForm.smtpPort),
      });
      setImapTested(true);
    } catch (err) {
      setEmailSettingsError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  async function saveImap() {
    setEmailSettingsError("");
    try {
      await api.post("/api/email/accounts", {
        ...imapForm,
        imapPort: Number(imapForm.imapPort),
        smtpPort: Number(imapForm.smtpPort),
        provider: "IMAP",
      });
      setImapOpen(false);
      setImapTested(false);
      setImapForm({ label: "", emailAddress: "", imapHost: "imap.gmail.com", imapPort: "993", smtpHost: "smtp.gmail.com", smtpPort: "587", username: "", password: "" });
      await loadEmailSettings();
    } catch (err) {
      setEmailSettingsError(err instanceof Error ? err.message : "Failed to save account");
    }
  }

  async function removeEmailAccount(accountId: string) {
    if (!window.confirm("Remove this account? Synced emails will be kept.")) return;
    await api.delete(`/api/email/accounts/${accountId}`);
    await loadEmailSettings();
  }

  async function syncEmailAccount(accountId: string) {
    await api.post(`/api/email/accounts/${accountId}/sync`, {});
    await loadEmailSettings();
  }

  async function saveSignature() {
    await api.patch("/api/email/signature", { signature: emailSignature });
  }

  async function saveTemplate() {
    if (!templateForm.name.trim()) return;
    await api.post("/api/email/templates", templateForm);
    setTemplateForm({ name: "", subject: "", bodyHtml: "", defaultCc: "", defaultBcc: "" });
    await loadEmailSettings();
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Delete this template?")) return;
    await api.delete(`/api/email/templates/${id}`);
    await loadEmailSettings();
  }

  async function syncCalendar() {
    setCalendarSyncStatus("Syncing calendar...");
    try {
      const result = await api.post<{ count: number }>("/api/calendar/sync", {});
      setCalendarSyncStatus(`Calendar synced. ${result.count} events available.`);
    } catch (err) {
      setCalendarSyncStatus(err instanceof Error ? err.message : "Calendar sync failed");
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-gray-900">Calendar</h2>
            <p className="mt-1 text-sm text-gray-500">Sync production dates, follow-ups, and Google Calendar events.</p>
          </div>
          <button onClick={syncCalendar} className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"><RefreshCw size={16} /> Sync all</button>
        </div>
        {calendarSyncStatus && <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{calendarSyncStatus}</p>}
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium text-gray-900">Email</h2>
            <p className="mt-1 text-sm text-gray-500">Connected accounts, signature, and reusable templates.</p>
          </div>
          <button onClick={connectGmail} className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"><Mail size={16} /> Connect Gmail</button>
        </div>
        {emailSettingsError && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{emailSettingsError}</p>}

        <div className="mb-4 space-y-2">
          {emailAccounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
              <span className={`h-2.5 w-2.5 rounded-full ${emailHealth[account.id] ? "bg-emerald-500" : "bg-gray-300"}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{account.label} <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">{account.provider === "GOOGLE" ? "Gmail" : "IMAP"}</span></p>
                <p className="truncate text-xs text-gray-500">{account.emailAddress} · Last synced {account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString("en-GB") : "never"}</p>
              </div>
              {!account.isPrimary && <button onClick={() => api.patch(`/api/email/accounts/${account.id}`, { isPrimary: true }).then(loadEmailSettings)} className="min-h-10 px-2 text-xs text-gray-600">Set primary</button>}
              <button onClick={() => syncEmailAccount(account.id)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><RefreshCw size={15} /></button>
              <button onClick={() => removeEmailAccount(account.id)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
          ))}
          {emailAccounts.length === 0 && <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-400">No email accounts connected yet.</p>}
        </div>

        <button onClick={() => setImapOpen(!imapOpen)} className="mb-3 min-h-11 rounded-lg border border-gray-200 px-3 text-sm text-gray-700">Connect IMAP account</button>
        {imapOpen && (
          <div className="mb-5 grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-2">
            {Object.entries(imapForm).map(([key, value]) => (
              <label key={key} className={key === "password" ? "sm:col-span-2" : ""}>
                <span className="mb-1 block text-xs font-medium capitalize text-gray-500">{key.replace(/([A-Z])/g, " $1")}</span>
                <input type={key === "password" ? "password" : key.includes("Port") ? "number" : "text"} value={value} onChange={(e) => { setImapTested(false); setImapForm((form) => ({ ...form, [key]: e.target.value })); }} className="min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" />
              </label>
            ))}
            <div className="flex gap-2 sm:col-span-2">
              <button onClick={testImap} className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm">Test connection</button>
              <button onClick={saveImap} disabled={!imapTested} className="min-h-11 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white disabled:opacity-40">Save account</button>
              {imapTested && <span className="self-center text-sm text-emerald-600">Connection OK</span>}
            </div>
          </div>
        )}

        <div className="mb-5 rounded-lg border border-gray-200 p-3">
          <h3 className="mb-2 text-sm font-medium text-gray-900">Email signature</h3>
          <textarea value={emailSignature} onChange={(e) => setEmailSignature(e.target.value)} className="min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm" />
          <button onClick={saveSignature} className="mt-2 min-h-11 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white">Save signature</button>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: emailSignature }} />
        </div>

        <div className="rounded-lg border border-gray-200 p-3">
          <h3 className="mb-3 text-sm font-medium text-gray-900">Templates</h3>
          <div className="mb-3 divide-y divide-gray-100">
            {emailTemplates.map((template) => (
              <div key={template.id} className="flex min-h-11 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{template.name}</p>
                  <p className="truncate text-xs text-gray-500">{template.subject}</p>
                </div>
                <button onClick={() => deleteTemplate(template.id)} className="grid min-h-10 min-w-10 place-items-center text-red-500"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <input value={templateForm.name} onChange={(e) => setTemplateForm((form) => ({ ...form, name: e.target.value }))} placeholder="Template name" className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" />
            <input value={templateForm.subject} onChange={(e) => setTemplateForm((form) => ({ ...form, subject: e.target.value }))} placeholder="Subject" className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" />
            <textarea value={templateForm.bodyHtml} onChange={(e) => setTemplateForm((form) => ({ ...form, bodyHtml: e.target.value }))} placeholder="Body HTML" className="min-h-24 rounded-lg border border-gray-200 p-3 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={templateForm.defaultCc} onChange={(e) => setTemplateForm((form) => ({ ...form, defaultCc: e.target.value }))} placeholder="Default CC" className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" />
              <input value={templateForm.defaultBcc} onChange={(e) => setTemplateForm((form) => ({ ...form, defaultBcc: e.target.value }))} placeholder="Default BCC" className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm" />
            </div>
            <button onClick={saveTemplate} className="min-h-11 w-fit rounded-lg bg-gray-900 px-3 text-sm font-medium text-white">New template</button>
          </div>
        </div>
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
