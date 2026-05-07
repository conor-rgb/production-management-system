import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Flag,
  Inbox,
  Mail,
  MailPlus,
  MoreHorizontal,
  Paperclip,
  Reply,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type { EmailAccount, EmailAttachmentSummary, EmailMessage, EmailTemplate, EmailThread, EmailThreadsResponse } from "../lib/types";
import { formatBytes } from "../lib/types";

type Folder = "inbox" | "sent" | "flagged" | "archived";
type Filter = "all" | "unread" | "flagged";
type ComposerDraft = {
  to?: string;
  subject?: string;
  bodyHtml?: string;
  linkedOpportunityId?: string;
  linkedProductionId?: string;
  attachments?: { id: string; filename: string; sizeBytes: number }[];
};

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fullTimeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function dateGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date();
  lastWeek.setDate(today.getDate() - 7);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (date > lastWeek) return "Last Week";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function senderName(thread: EmailThread) {
  return thread.resolvedSenderName ?? thread.participantNames?.[0] ?? thread.participants[0] ?? "Unknown sender";
}

function fileTone(mimeType: string) {
  if (mimeType.includes("pdf")) return "text-red-600";
  if (mimeType.startsWith("image/")) return "text-green-600";
  if (mimeType.includes("word") || mimeType.includes("document")) return "text-blue-600";
  return "text-gray-500";
}

function stripQuotedText(text: string) {
  const patterns = [/^On .+wrote:$/m, /^>{1}/m, /^-{3,}\s*Original Message/im, /^From:\s*.+\nSent:\s*/im];
  const matches = patterns.map((pattern) => text.search(pattern)).filter((index) => index >= 0);
  const first = matches.length ? Math.min(...matches) : -1;
  return first >= 0 ? { visible: text.slice(0, first).trim(), quoted: text.slice(first).trim() } : { visible: text, quoted: "" };
}

function sanitizeEmailHtml(html: string, showImages: boolean) {
  let cleaned = html
    .replace(/<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][\s\S]*?<\/div>/gi, "<button data-quoted='true'>...</button>")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "<button data-quoted='true'>...</button>");
  cleaned = DOMPurify.sanitize(cleaned, showImages ? undefined : { FORBID_TAGS: ["img"] });
  return cleaned;
}

function attachmentUrl(item: EmailAttachmentSummary) {
  return `/api/email/messages/${item.messageId}/attachment/${item.attachmentIndex}`;
}

export default function Email() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(new URLSearchParams(window.location.search).get("thread"));
  const [thread, setThread] = useState<EmailThread | null>(null);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposerDraft | null>(null);
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
      params.set("folder", folder);
      if (search) params.set("search", search);
      if (filter === "unread") params.set("unread", "true");
      if (filter === "flagged") params.set("flagged", "true");
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
    const params = new URLSearchParams(window.location.search);
    if (params.get("compose") === "draft") {
      const raw = localStorage.getItem("emailDraft");
      if (raw) {
        setComposeDraft(JSON.parse(raw) as ComposerDraft);
        localStorage.removeItem("emailDraft");
      }
      setComposeOpen(true);
    }
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
  const groupedThreads = useMemo(() => {
    const groups: Array<{ label: string; items: EmailThread[] }> = [];
    for (const item of threads) {
      const label = dateGroup(item.lastMessageAt);
      const group = groups.find((entry) => entry.label === label);
      if (group) group.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [threads]);

  return (
    <div className="flex h-full bg-white">
      <aside className="hidden w-[200px] shrink-0 flex-col bg-[#1a1a1f] text-white md:flex">
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
          <select value={activeAccountId} onChange={(event) => setActiveAccountId(event.target.value)} className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <select value={folder} onChange={(event) => setFolder(event.target.value as Folder)} className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm capitalize">
            <option value="inbox">Inbox</option>
            <option value="sent">Sent</option>
            <option value="flagged">Flagged</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex h-11 items-center gap-2 border-b border-gray-100 px-3">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email" className="h-full flex-1 border-0 bg-transparent text-xs outline-none" />
        </div>
        <div className="flex gap-2 border-b border-gray-100 px-3 py-2">
          {(["all", "unread", "flagged"] as Filter[]).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className={`min-h-7 rounded-full px-3 text-[11px] capitalize ${filter === item ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{item}</button>
          ))}
        </div>
        {error && <p className="p-3 text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-auto">
          {groupedThreads.map((group) => (
            <div key={group.label}>
              <div className="hidden px-4 py-2 text-[11px] uppercase tracking-wide text-gray-400 md:block">{group.label}</div>
              {group.items.map((item) => (
                <ThreadRow key={item.id} thread={item} active={selectedThreadId === item.id} onClick={() => setSelectedThreadId(item.id)} />
              ))}
            </div>
          ))}
          {!loading && threads.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              <Mail size={32} className="mx-auto mb-2 opacity-30" />
              No conversations yet.
            </div>
          )}
        </div>
      </section>

      <section className={`${selectedThreadId ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col bg-white`}>
        {thread ? (
          <ThreadDetail
            thread={thread}
            accounts={accounts}
            onBack={() => setSelectedThreadId(null)}
            onReplySent={() => { loadThread(thread.id).catch(console.error); loadThreads().catch(console.error); }}
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

      {composeOpen && <ComposerModal accounts={accounts} templates={templates} defaultAccountId={activeAccount?.id} draft={composeDraft} onClose={() => { setComposeOpen(false); setComposeDraft(null); }} onSent={() => { setComposeOpen(false); setComposeDraft(null); loadThreads().catch(console.error); }} />}
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

function ThreadRow({ thread, active, onClick }: { thread: EmailThread; active: boolean; onClick: () => void }) {
  const name = senderName(thread);
  return (
    <button
      onClick={onClick}
      className={`relative grid h-[72px] w-full grid-cols-[44px_1fr] gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-[#f8f8f6] ${active ? "border-l-2 border-l-gray-900 bg-[#f0f0ee]" : ""}`}
    >
      {!thread.isRead && <span className="absolute left-1 top-5 h-2 w-2 rounded-full bg-blue-500" />}
      <span className="relative grid h-9 w-9 place-items-center rounded-full text-xs font-medium text-white" style={{ background: thread.avatarColor ?? "#5B8DEF" }}>
        {initials(name)}
        {(thread.messageCount ?? 0) > 1 && <span className="absolute -bottom-1 -right-1 min-w-4 rounded-full bg-gray-900 px-1 text-center text-[10px] leading-4 text-white">{thread.messageCount}</span>}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] ${thread.isRead ? "font-normal text-gray-700" : "font-medium text-gray-950"}`}>{name}</span>
          <span className="text-[11px] text-gray-400">{timeLabel(thread.lastMessageAt)}</span>
        </span>
        <span className={`flex min-w-0 items-center gap-1 truncate text-[13px] ${thread.isRead ? "font-normal" : "font-medium"} text-gray-800`}>
          <span className="truncate">{thread.subject}</span>
          {thread.hasAttachments && <Paperclip size={12} className="shrink-0 text-gray-400" />}
        </span>
        <span className="block truncate text-xs text-gray-500">{thread.latestPreview}</span>
      </span>
    </button>
  );
}

function ThreadDetail({ thread, accounts, onBack, onReplySent, onFlag, onArchive }: { thread: EmailThread; accounts: EmailAccount[]; onBack: () => void; onReplySent: () => void; onFlag: () => void; onArchive: () => void }) {
  const [expandedAttachments, setExpandedAttachments] = useState(false);
  const attachments = thread.attachments ?? [];
  const visibleAttachments = expandedAttachments ? attachments : attachments.slice(0, 3);
  const latestId = thread.messages[thread.messages.length - 1]?.id;
  const defaultExpanded = useMemo(() => new Set(thread.messages.filter((message) => message.id === latestId || (!message.isFromMe && !thread.isRead)).map((message) => message.id)), [thread.id, latestId, thread.isRead]);
  const participantNames = thread.participantNames?.join(", ") || thread.participants.join(", ");

  return (
    <>
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <button onClick={onBack} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 md:hidden"><ArrowLeft size={18} /></button>
          <h1 className="min-w-0 flex-1 truncate text-base font-medium text-gray-900">{thread.subject}</h1>
          <button onClick={onFlag} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Star size={17} /></button>
          <button onClick={onArchive} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Archive size={17} /></button>
        </div>
        <p className="truncate text-xs text-gray-500">{participantNames}</p>
        {attachments.length > 0 && (
          <div className="mt-2 hidden flex-wrap gap-2 md:flex">
            {visibleAttachments.map((attachment) => <AttachmentChip key={`${attachment.messageId}-${attachment.attachmentIndex}`} attachment={attachment} />)}
            {attachments.length > 3 && !expandedAttachments && (
              <button onClick={() => setExpandedAttachments(true)} className="min-h-8 rounded bg-[#f0f0ee] px-2 text-xs text-gray-600">+ {attachments.length - 3} more</button>
            )}
          </div>
        )}
      </header>
      <div className="flex-1 overflow-auto bg-white p-2 pb-28 md:p-4">
        {thread.messages.map((message, index) => (
          <MessageBlock
            key={message.id}
            message={message}
            latest={message.id === latestId}
            defaultExpanded={defaultExpanded.has(message.id)}
            showNewDivider={index > 0 && !message.isFromMe && !thread.isRead}
          />
        ))}
      </div>
      <ReplyBar thread={thread} accounts={accounts} onSent={onReplySent} />
    </>
  );
}

function AttachmentChip({ attachment }: { attachment: EmailAttachmentSummary }) {
  return (
    <a href={attachmentUrl(attachment)} className="inline-flex min-h-8 items-center gap-1 rounded bg-[#f0f0ee] px-2 text-xs text-gray-700">
      <Paperclip size={13} className={fileTone(attachment.mimeType)} />
      <span className="max-w-[160px] truncate">{attachment.filename}</span>
      <span className="text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
    </a>
  );
}

function MessageBlock({ message, latest, defaultExpanded, showNewDivider }: { message: EmailMessage; latest: boolean; defaultExpanded: boolean; showNewDivider: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showImages, setShowImages] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const name = message.resolvedFromName || message.fromName || message.fromAddress;
  const toLabel = message.isFromMe ? `to ${message.toAddresses[0] ?? "recipient"}` : "to me";
  const hasImages = /<img[\s>]/i.test(message.bodyHtml);
  const quote = stripQuotedText(message.bodyText || "");
  const htmlBody = message.bodyHtml
    ? sanitizeEmailHtml(showQuoted ? message.bodyHtml : message.bodyHtml.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ""), showImages)
    : DOMPurify.sanitize(`<pre style="white-space:pre-wrap;font-family:inherit">${(showQuoted ? message.bodyText : quote.visible).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] ?? char))}</pre>`);

  return (
    <>
      {showNewDivider && (
        <div className="my-3 flex items-center gap-3 text-[11px] text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          New messages
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      )}
      <article className={`group border-b border-gray-100 ${message.isFromMe ? "bg-[#f8f8f6]" : "bg-white"}`}>
        <button
          onClick={() => !latest && setExpanded((current) => !current)}
          className="grid min-h-12 w-full grid-cols-[40px_1fr_auto_auto] items-center gap-2 px-2 text-left transition-all duration-200"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-medium text-white" style={{ background: message.avatarColor ?? "#5B8DEF" }}>{initials(name)}</span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-[13px] font-medium text-gray-900">{name}</span>
              <span className="shrink-0 text-xs text-gray-500">{toLabel}</span>
            </span>
            {!expanded && <span className="block truncate text-xs text-gray-500">{message.bodyText.slice(0, 80)}</span>}
          </span>
          <span className="text-xs text-gray-400">{fullTimeLabel(message.sentAt)}</span>
          <span className="flex items-center gap-1">
            <MoreHorizontal size={15} className="hidden text-gray-400 group-hover:block" />
            {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          </span>
        </button>
        {expanded && (
          <div className="px-12 pb-4">
            {hasImages && !showImages && <button onClick={() => setShowImages(true)} className="mb-3 min-h-9 rounded bg-gray-100 px-3 text-xs text-gray-700">Show images</button>}
            <div className="prose prose-sm max-w-none text-[13px] leading-6 text-gray-800" dangerouslySetInnerHTML={{ __html: htmlBody }} />
            {(quote.quoted || /<blockquote|gmail_quote/i.test(message.bodyHtml)) && !showQuoted && (
              <button onClick={() => setShowQuoted(true)} className="mt-3 min-h-8 rounded bg-gray-100 px-3 text-xs text-gray-500">Show previous messages</button>
            )}
            {message.attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {message.attachments.map((attachment, index) => (
                  <AttachmentChip key={`${attachment.filename}-${index}`} attachment={{ messageId: message.id, attachmentIndex: index, filename: attachment.filename, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes }} />
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </>
  );
}

function ReplyBar({ thread, accounts, onSent }: { thread: EmailThread; accounts: EmailAccount[]; onSent: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [fromAccountId, setFromAccountId] = useState(thread.accountId || accounts[0]?.id || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastNonMe = [...thread.messages].reverse().find((message) => !message.isFromMe) ?? thread.messages[thread.messages.length - 1];
  const recipients = thread.participants.filter((email) => email !== thread.account?.emailAddress?.toLowerCase());
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Placeholder.configure({ placeholder: "Write a reply..." }),
    ],
    content: "",
  });

  async function sendReply() {
    if (!editor) return;
    setSending(true);
    setError("");
    try {
      await api.post(`/api/email/threads/${thread.id}/reply`, { fromAccountId, bodyHtml: editor.getHTML(), replyAll: false });
      editor.commands.clearContent();
      setExpanded(false);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  if (!expanded) {
    return (
      <div className="shrink-0 border-t border-gray-200 bg-white p-3">
        <button onClick={() => setExpanded(true)} className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-gray-200 px-3 text-left text-sm text-gray-500">
          <Reply size={16} /> Reply to {lastNonMe?.resolvedFromName || lastNonMe?.fromName || lastNonMe?.fromAddress || "sender"}...
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 max-h-[90vh] overflow-auto border-t border-gray-200 bg-white p-3 shadow-2xl md:absolute md:max-h-[360px]">
      {accounts.length > 1 && (
        <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} className="mb-2 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm md:max-w-xs">
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.emailAddress}</option>)}
        </select>
      )}
      <div className="mb-2 flex min-h-9 flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-400">To</span>
        {recipients.map((recipient) => <span key={recipient} className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">{recipient}</span>)}
      </div>
      <div className="rounded-lg border border-gray-200">
        <div className="flex min-h-9 items-center gap-1 border-b border-gray-100 px-2 text-xs text-gray-600">
          <EditorButton active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>B</EditorButton>
          <EditorButton active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><span className="italic">I</span></EditorButton>
          <EditorButton active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><span className="underline">U</span></EditorButton>
          <EditorButton active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• List</EditorButton>
          <EditorButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. List</EditorButton>
        </div>
        <EditorContent editor={editor} className="min-h-[120px] p-3 text-sm outline-none [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:outline-none" />
      </div>
      <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">-- <br />Conor | unlimited.bond</div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => setExpanded(false)} className="min-h-11 px-3 text-sm text-gray-500">Discard</button>
        <button className="ml-auto grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><Paperclip size={16} /></button>
        <button onClick={sendReply} disabled={sending || !fromAccountId} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">{sending ? "Sending..." : "Send"}</button>
      </div>
    </div>
  );
}

function EditorButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`min-h-8 rounded px-2 ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{children}</button>;
}

function ComposerModal({ accounts, templates, defaultAccountId, draft, onClose, onSent }: { accounts: EmailAccount[]; templates: EmailTemplate[]; defaultAccountId?: string; draft?: ComposerDraft | null; onClose: () => void; onSent: () => void }) {
  const [fromAccountId, setFromAccountId] = useState(defaultAccountId || accounts[0]?.id || "");
  const [to, setTo] = useState(draft?.to ?? "");
  const [ccVisible, setCcVisible] = useState(false);
  const [bccVisible, setBccVisible] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(draft?.bodyHtml ?? "");
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
        linkedOpportunityId: draft?.linkedOpportunityId,
        linkedProductionId: draft?.linkedProductionId,
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
            <select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none">
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.emailAddress}</option>)}
            </select>
          </ComposerField>
          <ComposerField label="To"><input value={to} onChange={(event) => setTo(event.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" placeholder="name@example.com" /></ComposerField>
          <div className="flex gap-3 text-xs text-blue-600">
            <button type="button" onClick={() => setCcVisible(!ccVisible)} className="min-h-8">CC</button>
            <button type="button" onClick={() => setBccVisible(!bccVisible)} className="min-h-8">BCC</button>
            <select onChange={(event) => applyTemplate(event.target.value)} className="ml-auto min-h-8 rounded border border-gray-200 px-2 text-gray-600">
              <option value="">Use template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          {ccVisible && <ComposerField label="CC"><input value={cc} onChange={(event) => setCc(event.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>}
          {bccVisible && <ComposerField label="BCC"><input value={bcc} onChange={(event) => setBcc(event.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>}
          <ComposerField label="Subject"><input value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-9 w-full border-0 bg-transparent text-sm outline-none" /></ComposerField>
          <div className="rounded-lg border border-gray-200">
            <div className="flex min-h-9 items-center gap-2 border-b border-gray-100 px-2 text-xs text-gray-500">
              <button type="button" className="min-h-8 px-2 font-bold">B</button>
              <button type="button" className="min-h-8 px-2 italic">I</button>
              <button type="button" className="min-h-8 px-2 underline">U</button>
              <button type="button" className="min-h-8 px-2">• List</button>
            </div>
            <textarea value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} className="min-h-[200px] w-full resize-none border-0 p-3 text-sm outline-none" placeholder="Write your message..." />
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">-- <br />Conor | unlimited.bond</div>
          {draft?.attachments?.length ? (
            <div className="flex flex-wrap gap-2">
              {draft.attachments.map((attachment) => (
                <span key={attachment.id} className="inline-flex min-h-9 items-center gap-2 rounded-full bg-gray-100 px-3 text-xs text-gray-700">
                  <Paperclip size={13} /> {attachment.filename} <span className="text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
                </span>
              ))}
            </div>
          ) : null}
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

function ComposerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-h-9 grid-cols-[64px_1fr] items-center border-b border-gray-100 text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}
