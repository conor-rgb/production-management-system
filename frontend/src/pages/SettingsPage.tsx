import { useEffect, useState, type FormEvent } from "react";
import { Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CrewRole, EmailAccount, EmailTemplate, SectionTemplate, StorageInfo } from "../lib/types";
import { formatBytes } from "../lib/types";

type BlackbookCategory = "CREW" | "SERVICE" | "LOCATION" | "EQUIPMENT" | "TALENT" | "TRANSPORT" | "POST" | "OTHER";

interface BlackbookConfigType {
  id: string;
  name: string;
  slug: string;
  order: number;
}

interface BlackbookConfigCategory {
  id: string;
  name: string;
  slug: string;
  broadType: BlackbookCategory;
  color: string;
  order: number;
  coreFields: string[];
  types: BlackbookConfigType[];
}

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
  const [budgetTemplates, setBudgetTemplates] = useState<SectionTemplate[]>([]);
  const [catalogError] = useState("");
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
  const [blackbookCategories, setBlackbookCategories] = useState<BlackbookConfigCategory[]>([]);
  const [newBlackbookCategory, setNewBlackbookCategory] = useState("");
  const [newTypeByCategory, setNewTypeByCategory] = useState<Record<string, string>>({});

  async function loadRoles() {
    const data = await api.get<CrewRole[]>("/api/settings/crew-roles");
    setRoles(data);
  }

  async function loadCatalog() {
    const templates = await api.get<SectionTemplate[]>("/api/budgets/templates");
    setBudgetTemplates(templates);
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

  async function loadBlackbookSettings() {
    setBlackbookCategories(await api.get<BlackbookConfigCategory[]>("/api/settings/blackbook/categories"));
  }

  useEffect(() => {
    loadRoles().catch(console.error);
    loadCatalog().catch(console.error);
    loadEmailSettings().catch(console.error);
    loadBlackbookSettings().catch(console.error);
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

  async function addBlackbookCategory() {
    if (!newBlackbookCategory.trim()) return;
    await api.post("/api/settings/blackbook/categories", { name: newBlackbookCategory.trim(), broadType: "OTHER", coreFields: [] });
    setNewBlackbookCategory("");
    await loadBlackbookSettings();
  }

  async function updateBlackbookCategory(id: string, patch: Partial<BlackbookConfigCategory>) {
    await api.patch(`/api/settings/blackbook/categories/${id}`, patch);
    await loadBlackbookSettings();
  }

  async function addBlackbookType(categoryId: string) {
    const name = newTypeByCategory[categoryId]?.trim();
    if (!name) return;
    await api.post(`/api/settings/blackbook/categories/${categoryId}/types`, { name });
    setNewTypeByCategory((current) => ({ ...current, [categoryId]: "" }));
    await loadBlackbookSettings();
  }

  async function updateBlackbookType(typeId: string, name: string) {
    await api.patch(`/api/settings/blackbook/types/${typeId}`, { name });
    await loadBlackbookSettings();
  }

  async function deleteBlackbookType(typeId: string) {
    await api.delete(`/api/settings/blackbook/types/${typeId}`);
    await loadBlackbookSettings();
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
        <div className="mb-4">
          <h2 className="font-medium text-gray-900">Blackbook categories</h2>
          <p className="mt-1 text-sm text-gray-500">Organise the blackbook by category, multi-select types, and matrix core fields. This drives options sheets and later PDF templates.</p>
        </div>
        <div className="mb-4 flex gap-2">
          <input value={newBlackbookCategory} onChange={(event) => setNewBlackbookCategory(event.target.value)} placeholder="New category, e.g. Florists" className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-1 focus:ring-gray-500" />
          <button onClick={addBlackbookCategory} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-gray-900 text-white"><Plus size={18} /></button>
        </div>
        <div className="space-y-3">
          {blackbookCategories.map((category) => (
            <div key={category.id} className="rounded-lg border border-gray-200 p-3">
              <div className="grid gap-2 md:grid-cols-[1fr_130px_90px]">
                <input value={category.name} onChange={(event) => updateBlackbookCategory(category.id, { name: event.target.value })} className="min-h-10 rounded border border-gray-200 px-2 text-sm" />
                <select value={category.broadType} onChange={(event) => updateBlackbookCategory(category.id, { broadType: event.target.value as BlackbookCategory })} className="min-h-10 rounded border border-gray-200 px-2 text-xs">
                  {(["CREW", "SERVICE", "LOCATION", "EQUIPMENT", "TALENT", "TRANSPORT", "POST", "OTHER"] as BlackbookCategory[]).map((item) => <option key={item} value={item}>{item.toLowerCase()}</option>)}
                </select>
                <input value={category.color} onChange={(event) => updateBlackbookCategory(category.id, { color: event.target.value })} className="min-h-10 rounded border border-gray-200 px-2 text-xs" />
              </div>
              <label className="mt-3 block text-xs font-medium text-gray-500">Core option matrix fields</label>
              <input value={category.coreFields.join(", ")} onChange={(event) => updateBlackbookCategory(category.id, { coreFields: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="email, phone, rate, dietaries, address, photos" className="mt-1 min-h-10 w-full rounded border border-gray-200 px-2 text-xs" />
              <div className="mt-3 flex flex-wrap gap-2">
                {category.types.map((type) => (
                  <span key={type.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1">
                    <input value={type.name} onChange={(event) => updateBlackbookType(type.id, event.target.value)} className="w-32 bg-transparent text-xs outline-none" />
                    <button onClick={() => deleteBlackbookType(type.id)} className="text-gray-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={newTypeByCategory[category.id] ?? ""} onChange={(event) => setNewTypeByCategory((current) => ({ ...current, [category.id]: event.target.value }))} placeholder="Add type, e.g. fashion photographer" className="min-h-9 flex-1 rounded border border-gray-200 px-2 text-xs" />
                <button onClick={() => addBlackbookType(category.id)} className="rounded bg-gray-900 px-3 text-xs font-medium text-white">Add type</button>
              </div>
            </div>
          ))}
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
          <h2 className="font-medium text-gray-900">Budget templates</h2>
          <span className="text-xs text-gray-500">Used when creating a new estimate or production budget.</span>
        </div>
        {catalogError && <p className="mb-2 text-sm text-red-500">{catalogError}</p>}
        <div className="grid gap-3 lg:grid-cols-3">
          {budgetTemplates.map((template) => (
            <div key={template.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{template.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{template.description ?? "No description"}</p>
                </div>
                {template.isDefault && <span className="rounded-full bg-gray-900 px-2 py-1 text-[10px] font-medium text-white">Default</span>}
              </div>
              <div className="mt-3 space-y-1">
                {template.sections.slice(0, 6).map((section) => (
                  <p key={section.code} className="truncate text-xs text-gray-600">
                    <span className="font-medium">{section.code}</span> {section.name} · {section.defaultLineItems.length} lines
                  </p>
                ))}
                {template.sections.length > 6 && <p className="text-xs text-gray-400">+ {template.sections.length - 6} more sections</p>}
              </div>
            </div>
          ))}
          {budgetTemplates.length === 0 && <p className="text-sm text-gray-400">No budget templates seeded yet.</p>}
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
