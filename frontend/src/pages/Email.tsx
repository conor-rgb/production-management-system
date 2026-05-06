import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import DOMPurify from "dompurify";
import {
  Archive,
  ArrowLeft,
  Download,
  Flag,
  Inbox,
  Mail,
  MailPlus,
  Paperclip,
  Reply,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { EmailAccount, EmailMessage, EmailTemplate, EmailThread, EmailThreadsResponse } from "../lib/types";
import { formatBytes } from "../lib/types";

type Folder = "inbox" | "sent" | "flagged" | "archived";
type Filter = "all" | "unread" | "flagged";

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function senderName(thread: EmailThread) {
  return thread.participantNames?.[0] ?? thread.participants[0] ?? "Unknown sender";
}

function linkedLabel(thread: EmailThread) {
  if (thread.linkedProduction) return thread.linkedProduction.jobCode ? `${thread.linkedProduction.jobCode} ${thread.linkedProduction.clientName ?? ""}` : thread.linkedProduction.title;
  if (thread.linkedOpportunity) return thread.linkedOpportunity.title;
  if (thread.linkedContact) return `${thread.linkedContact.firstName}${thread.linkedContact.lastName ? ` ${thread.linkedContact.lastName}` : ""}`;
  return "";
}

export default function Email() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(new URLSearchParams(window.location.search).get("thread"));
  const [thread, setThread] = useState<EmailThread | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string>("");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadAccounts() {
    const data = await api.get<EmailAccount[]>("/api/email/accounts");
    setAccounts(data);
    setActiveAccountId((current) => current || data.find((account) => account.isPrimary)?.id || data[0]?.id || "");
  }

  async function loadThreads() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (activeAccountId) params.set("accountId", activeAccountId);
      if (search) params.set("search", search);
      if (filter === "unread") params.set("unread", "true");
      if (filter === "flagged" || folder === "flagged") params.set("flagged", "true");
      if (folder === "archived") params.set("archived", "true");
      const data = await api.get<EmailThreadsResponse>(`/api/email/threads?${params.toString()}`);
      setThreads(data.threads);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email");
    } finally {
      setLoading(false);
    }
  }

  async function loadThread(id: string) {
    const data = await api.get<EmailThread>(`/api/email/threads/${id}`);
    setThread(data);
    setThreads((items) => items.map((item) => item.id === id ? { ...item, isRead: true } : item));
  }

  useEffect(() => {
    loadAccounts().catch(console.error);
    api.get<EmailTemplate[]>("/api/email/templates").then(setTemplates).catch(console.error);
  }, []);

  useEffect(() => { loadThreads().catch(console.error); }, [activeAccountId, folder, filter]);
  useEffect(() => {
    const timer = setTimeout(() => { loadThreads().catch(console.error); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (selectedThreadId) loadThread(selectedThreadId).catch(console.error);
    else setThread(null);
  }, [selectedThreadId]);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);
  const unreadCount = threads.filter((item) => !item.isRead).length;

  return (
    <div className="flex h-full bg-white">
      <aside className={`hidden w-[200px] shrink-0 flex-col bg-[#1a1a1f] text-white md:flex`}>
        <div className="p-4 text-sm font-medium">Email</div>
        <div className="flex-1 overflow-auto px-2">
          {accounts.map((account) => (
            <div key={account.id} className="mb-3">
              <button onClick={() => setActiveAccountId(account.id)} className="min-h-11 w-full rounded px-2 text-left">
                <span className="block text-xs text-white">{account.label}</span>
                <span className="block truncate text-[11px] text-gray-400">{account.emailAddress}</span>
              </button>
              <FolderButton active={folder === "inbox" && activeAccountId === account.id} icon={<Inbox size={14} />} label="Inbox" count={unreadCount} onClick={() => { setActiveAccountId(account.id); setFolder("inbox"); }} />
              <FolderButton active={folder === "sent" && activeAccountId === account.id} icon={<Send size={14} />} label="Sent" onClick={() => { setActiveAccountId(account.id); setFolder("sent"); }} />
              <FolderButton active={folder === "flagged" && activeAccountId === account.id} icon={<Flag size={14} />} label="Flagged" onClick={() => { setActiveAccountId(account.id); setFolder("flagged"); }} />
              <FolderButton active={folder === "archived" && activeAccountId === account.id} icon={<Archive size={14} />} label="Archived" onClick={() => { setActiveAccountId(account.id); setFolder("archived"); }} />
            </div>
          ))}
        </div>
        <button onClick={() => setComposeOpen(true)} className="m-3 flex min-h-10 items-center justify-center gap-2 rounded bg-[#2c2c2a] text-sm font-medium text-white">
          <MailPlus size={16} /> Compose
        </button>
      </aside>

      <section className={`${selectedThreadId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-gray-200 bg-white md:w-[320px] md:shrink-0`}>
        <div className="flex min-h-14 items-center gap-2 border-b border-gray-100 px-3 md:hidden">
          <select value={activeAccountId} onChange={(e) => setActiveAccountId(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
        </div>
        <div className="flex h-11 items-center gap-2 border-b border-gray-100 px-3">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email" className="h-full flex-1 border-0 bg-transparent text-xs outline-none" />
        </div>
        <div className="flex gap-2 border-b border-gray-100 px-3 py-2">
          {(["all", "unread", "flagged"] as Filter[]).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`min-h-7 rounded-full px-3 text-[11px] capitalize ${filter === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{item}</button>
          ))}
        </div>
        {error && <p className="p-3 text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-auto">
          {threads.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedThreadId(item.id)}
              className={`relative flex h-[72px] w-full flex-col justify-center border-b border-gray-100 px-4 text-left hover:bg-[#f8f8f6] ${selectedThreadId === item.id ? "border-l-2 border-l-gray-900 bg-[#f0f0ee]" : ""}`}
            >
              <div className="flex items-center gap-2">
                {!item.isRead && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                <span className={`min-w-0 flex-1 truncate text-[13px] ${item.isRead ? "font-medium text-gray-700" : "font-semibold text-gray-950"}`}>{senderName(item)}</span>
                <span className="text-[11px] text-gray-400">{timeLabel(item.lastMessageAt)}</span>
              </div>
              <p className={`truncate text-xs ${item.isRead ? "font-normal" : "font-medium"} text-gray-800`}>{item.subject}</p>
              <p className="truncate text-xs text-gray-500">{item.latestPreview}</p>
              {linkedLabel(item) && <span className="mt-1 w-fit rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{linkedLabel(item)}</span>}
            </button>
          ))}
          {!loading && threads.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              <Mail size={32} className="mx-auto mb-2 opacity-30" />
              No conversations yet.
            </div>
          )}
        </div>
      </section>

      <section className={`${selectedThreadId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-white`}>
        {thread ? (
          <ThreadDetail
            thread={thread}
            accounts={accounts}
            onBack={() => setSelectedThreadId(null)}
            onReply={() => setReplyOpen(true)}
            onFlag={async () => { await api.patch(`/api/email/threads/${thread.id}/flag`, {}); await loadThread(thread.id); await loadThreads(); }}
            onArchive={async () => { await api.patch(`/api/email/threads/${thread.id}/archive`, {}); setSelectedThreadId(null); await loadThreads(); }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
            <Mail size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
      </section>

      <button onClick={() => setComposeOpen(true)} className="fixed bottom-20 right-4 grid h-14 w-14 place-items-center rounded-full bg-gray-900 text-white shadow-lg md:hidden">
        <MailPlus size={22} />
      </button>

      {composeOpen && <ComposerModal accounts={accounts} templates={templates} defaultAccountId={activeAccount?.id} onClose={() => setComposeOpen(false)} onSent={() => { setComposeOpen(false); loadThreads().catch(console.error); }} />}
      {replyOpen && thread && <ReplyComposer thread={thread} accounts={accounts} onClose={() => setReplyOpen(false)} onSent={() => { setReplyOpen(false); loadThread(thread.id).catch(console.error); }} />}
    </div>
  );
}

function FolderButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-9 w-full items-center gap-2 rounded px-4 text-left text-xs ${active ? "border-l-2 border-l-white bg-white/15 text-white" : "text-gray-300 hover:bg-white/10"}`}>
      {icon}<span className="flex-1">{label}</span>{Boolean(count) && <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-gray-900">{count}</span>}
    </button>
  );
}

function ThreadDetail({ thread, onBack, onReply, onFlag, onArchive }: { thread: EmailThread; accounts: EmailAccount[]; onBack: () => void; onReply: () => void; onFlag: () => void; onArchive: () => void }) {
  return (
    <>
      <header className="border-b border-gray-200 p-4">
        <div className="mb-2 flex items-center gap-2">
          <button onClick={onBack} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 md:hidden"><ArrowLeft size={18} /></button>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-gray-900">{thread.subject}</h1>
          <button onClick={onFlag} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Star size={17} /></button>
          <button onClick={onArchive} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Archive size={17} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {linkedLabel(thread) ? (
            <span className="rounded-full bg-gray-900 px-2 py-1 text-white">Linked: {linkedLabel(thread)}</span>
          ) : (
            <span className="text-blue-600">Unlinked — tap to link</span>
          )}
          <div className="ml-auto flex -space-x-1">
            {thread.participants.slice(0, 4).map((participant) => (
              <span key={participant} className="grid h-7 w-7 place-items-center rounded-full border border-white bg-gray-100 text-[10px] font-medium text-gray-600">{participant.slice(0, 1).toUpperCase()}</span>
            ))}
            {thread.participants.length > 4 && <span className="grid h-7 w-7 place-items-center rounded-full border border-white bg-gray-200 text-[10px] text-gray-600">+{thread.participants.length - 4}</span>}
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3 pb-24">
        {thread.messages.map((message) => <MessageCard key={message.id} message={message} />)}
      </div>
      <div className="border-t border-gray-200 bg-white p-3">
        <button onClick={onReply} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm text-gray-500">
          <Reply size={16} /> Reply to {senderName(thread)}...
        </button>
      </div>
    </>
  );
}

function MessageCard({ message }: { message: EmailMessage }) {
  const html = DOMPurify.sanitize(message.bodyHtml || `<p>${message.bodyText.replace(/\n/g, "<br />")}</p>`);
  return (
    <article className={`mb-3 rounded-lg border border-gray-100 p-4 ${message.isFromMe ? "bg-[#f8f8f6]" : "bg-white"}`}>
      <div className="mb-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="font-medium text-gray-800">{message.fromName || message.fromAddress}</span>
        <span className="ml-auto">{new Date(message.sentAt).toLocaleString("en-GB")}</span>
      </div>
      <div className="prose prose-sm max-w-none text-[13px] leading-6 text-gray-800" dangerouslySetInnerHTML={{ __html: html }} />
      {message.attachments.length > 0 && (
        <div className="mt-4 space-y-2">
          {message.attachments.map((attachment, index) => (
            <div key={`${attachment.filename}-${index}`} className="flex min-h-11 items-center gap-2 rounded-lg bg-gray-50 px-3 text-sm">
              <Paperclip size={15} className="text-gray-400" />
              <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
              <span className="text-xs text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
              <button className="grid min-h-9 min-w-9 place-items-center rounded text-gray-500"><Download size={15} /></button>
              <button className="min-h-9 rounded px-2 text-xs text-gray-600">Save to job</button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ComposerModal({ accounts, templates, defaultAccountId, onClose, onSent }: { accounts: EmailAccount[]; templates: EmailTemplate[]; defaultAccountId?: string; onClose: () => void; onSent: () => void }) {
  const [fromAccountId, setFromAccountId] = useState(defaultAccountId || accounts[0]?.id || "");
  const [to, setTo] = useState("");
  const [ccVisible, setCcVisible] = useState(false);
  const [bccVisible, setBccVisible] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.post("/api/email/send", {
        fromAccountId,
        to: to.split(",").map((email) => email.trim()).filter(Boolean),
        cc: cc.split(",").map((email) => email.trim()).filter(Boolean),
        bcc: bcc.split(",").map((email) => email.trim()).filter(Boolean),
        subject,
        bodyHtml,
      });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function applyTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    if (bodyHtml && !window.confirm("Replace the current message body?")) return;
    setSubject(template.subject);
    setBodyHtml(template.bodyHtml);
    setCc(template.defaultCc ?? "");
    setBcc(template.defaultBcc ?? "");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/25 md:items-center md:justify-center">
      <form onSubmit={handleSend} className="flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl md:w-[680px] md:rounded-2xl">
        <div className="flex min-h-12 items-center border-b border-gray-100 px-4">
          <h2 className="text-sm font-medium text-gray-900">New message</h2>
          <button type="button" onClick={onClose} className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-500"><X size={17} /></button>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-4">
          <ComposerField label="From">
            <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none">
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.emailAddress}</option>)}
            </select>
          </ComposerField>
          <ComposerField label="To"><input value={to} onChange={(e) => setTo(e.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" placeholder="name@example.com" /></ComposerField>
          <div className="flex gap-3 text-xs text-blue-600">
            <button type="button" onClick={() => setCcVisible(!ccVisible)} className="min-h-8">CC</button>
            <button type="button" onClick={() => setBccVisible(!bccVisible)} className="min-h-8">BCC</button>
            <select onChange={(e) => applyTemplate(e.target.value)} className="ml-auto min-h-8 rounded border border-gray-200 px-2 text-gray-600">
              <option value="">Use template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          {ccVisible && <ComposerField label="CC"><input value={cc} onChange={(e) => setCc(e.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>}
          {bccVisible && <ComposerField label="BCC"><input value={bcc} onChange={(e) => setBcc(e.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>}
          <ComposerField label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>
          <div className="rounded-lg border border-gray-200">
            <div className="flex min-h-9 items-center gap-2 border-b border-gray-100 px-2 text-xs text-gray-500">
              <button type="button" className="min-h-8 px-2 font-bold">B</button>
              <button type="button" className="min-h-8 px-2 italic">I</button>
              <button type="button" className="min-h-8 px-2 underline">U</button>
              <button type="button" className="min-h-8 px-2">• List</button>
            </div>
            <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="min-h-[200px] w-full resize-none border-0 p-3 text-sm outline-none" placeholder="Write your message..." />
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">-- <br />Conor | unlimited.bond</div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <footer className="flex min-h-14 items-center gap-2 border-t border-gray-100 px-4">
          <button type="button" onClick={onClose} className="min-h-11 px-3 text-sm text-gray-500">Discard</button>
          <button type="button" className="ml-auto min-h-11 px-3 text-sm text-gray-500">Save draft</button>
          <button disabled={sending || !fromAccountId || !to || !subject} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">{sending ? "Sending..." : "Send"}</button>
        </footer>
      </form>
    </div>
  );
}

function ReplyComposer({ thread, accounts, onClose, onSent }: { thread: EmailThread; accounts: EmailAccount[]; onClose: () => void; onSent: () => void }) {
  const [bodyHtml, setBodyHtml] = useState("");
  const [fromAccountId, setFromAccountId] = useState(thread.accountId || accounts[0]?.id || "");
  async function sendReply() {
    await api.post(`/api/email/threads/${thread.id}/reply`, { fromAccountId, bodyHtml, replyAll: true });
    onSent();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/25">
      <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl md:mx-auto md:mb-10 md:max-w-2xl md:rounded-2xl">
        <div className="mb-3 flex items-center">
          <h2 className="text-sm font-medium">Reply</h2>
          <button onClick={onClose} className="ml-auto grid min-h-11 min-w-11 place-items-center"><X size={17} /></button>
        </div>
        <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="mb-3 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm">
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.emailAddress}</option>)}
        </select>
        <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="min-h-[140px] w-full rounded-lg border border-gray-200 p-3 text-sm outline-none" placeholder="Write a reply..." />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="min-h-11 px-3 text-sm text-gray-500">Discard</button>
          <button onClick={sendReply} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white">Send</button>
        </div>
      </div>
    </div>
  );
}

function ComposerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-h-9 grid-cols-[64px_1fr] items-center border-b border-gray-100 text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}
