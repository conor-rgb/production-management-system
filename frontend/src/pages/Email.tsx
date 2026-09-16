import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Flag,
  Inbox,
  Link2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  PencilLine,
  Plus,
  Receipt,
  Reply,
  Search,
  Send,
  Star,
  Tags,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { PreviewPanel } from "../components/files/FileBrowser";
import type { EmailAccount, EmailAttachmentSummary, EmailAutoCategory, EmailMessage, EmailThread, EmailThreadsResponse, JobFile, Production } from "../lib/types";
import { formatBytes, JOB_FOLDERS } from "../lib/types";
import { useDrafts, type Draft } from "../store/draftStore";

type Folder = "inbox" | "sent" | "drafts" | "starred" | "unread" | "archived";
type Filter = "all" | "unread" | "flagged";
type AutoFilter = "all" | "people" | "promotions" | "newsletters" | "purchases";
type CategoryScope = "thread" | "sender" | "domain";
type EmailSenderFormatPreference = "original";

type SaveAttachmentState = {
  attachment: EmailAttachmentSummary;
  productionId?: string;
};

type UnsubscribeResult = {
  success: boolean;
  method?: "MAILTO" | "URL";
  mailto?: string;
  url?: string;
};

type MessageTaskDraft = {
  title: string;
  productionId?: string;
  blackbookEntryId?: string;
  roleRequirementId?: string;
  optionCandidateId?: string;
  startAt: string;
  description: string;
};

type LinkTargetsResponse = {
  opportunities?: Array<{ id: string; title: string; clientName?: string | null; brand?: string | null; stage: string; value?: string | null; company?: { id: string; name: string } | null }>;
  productions?: Array<{ id: string; title: string; jobCode?: string | null; clientName?: string | null; brand?: string | null; status: string }>;
  contacts?: Array<{ id: string; firstName: string; lastName?: string | null; email?: string | null; type: string; company?: { id: string; name: string } | null }>;
  blackbook?: Array<{ id: string; displayName: string; entryType: string; category: string; email?: string | null; phone?: string | null; companyName?: string | null; lifecycleStatus: string }>;
  requirements?: Array<{ id: string; name: string; displayLabel: string; type: string; activeState: string; group: { id: string; name: string } }>;
  candidates?: Array<{ id: string; name: string; subtitle?: string | null; activeState: string; group: { id: string; name: string }; blackbookEntry?: { id: string; displayName: string } | null }>;
};

type ThreadPerson = {
  email: string;
  name: string;
  roles: string[];
  inferredCompany: string;
  domain: string;
  isMe?: boolean;
  isLinkedToThread: boolean;
  existingContact: null | {
    id: string;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    type: string;
    company?: { id: string; name: string } | null;
  };
};

const EMAIL_SENDER_FORMAT_PREFS_KEY = "pms.email.senderFormatPreferences";

function emailSenderFormatKey(email: string) {
  return email.trim().toLowerCase();
}

function readEmailSenderFormatPreferences(): Record<string, EmailSenderFormatPreference> {
  try {
    const raw = window.localStorage.getItem(EMAIL_SENDER_FORMAT_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, EmailSenderFormatPreference>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function senderPrefersOriginalFormatting(email: string) {
  return readEmailSenderFormatPreferences()[emailSenderFormatKey(email)] === "original";
}

function setSenderOriginalFormattingPreference(email: string, enabled: boolean) {
  const key = emailSenderFormatKey(email);
  if (!key) return;
  const prefs = readEmailSenderFormatPreferences();
  if (enabled) prefs[key] = "original";
  else delete prefs[key];
  window.localStorage.setItem(EMAIL_SENDER_FORMAT_PREFS_KEY, JSON.stringify(prefs));
}

type OpportunityPrefill = {
  title: string;
  clientName: string;
  company: string;
  contactId: string | null;
  contactEmail: string;
  contactName: string;
  description: string;
  dateReceived: string;
  linkedThreadId: string;
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

function getEmailColor(email: string) {
  const colors = ["#5B8DEF", "#E8A838", "#E85D5D", "#5DBE8A", "#9B5DEF", "#EF8C5D", "#5DBEE8", "#EF5DB8"];
  let hash = 0;
  for (let i = 0; i < email.length; i += 1) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length] ?? colors[0];
}

function senderName(thread: EmailThread) {
  return thread.resolvedSenderName ?? thread.participantNames?.[0] ?? thread.participants[0] ?? "Unknown sender";
}

function contactName(contact?: { firstName?: string; lastName?: string | null } | null) {
  if (!contact) return "";
  return `${contact.firstName ?? ""}${contact.lastName ? ` ${contact.lastName}` : ""}`.trim();
}

function compactAddress(address: string) {
  return address.replace(/^"?([^"<]*)"?\s*<([^>]*)>$/, "$1").trim() || address;
}

function addressLine(addresses: string[]) {
  return addresses.map(compactAddress).filter(Boolean).join(", ");
}

function participantSummary(names: string[], addresses: string[]) {
  const source = names.length ? names : addresses;
  const primary = source[0] ?? "No participants";
  const extraCount = Math.max(source.length - 1, 0);
  return extraCount > 0 ? `${primary} + ${extraCount}` : primary;
}

function folderTitle(folder: Folder) {
  const labels: Record<Folder, string> = {
    inbox: "Inbox",
    sent: "Sent",
    drafts: "Drafts",
    starred: "Starred",
    unread: "Unread",
    archived: "Archive",
  };
  return labels[folder];
}

function emailCategoryLabel(category?: EmailAutoCategory | null) {
  const labels: Record<EmailAutoCategory, string> = {
    PEOPLE: "People",
    PROMOTIONS: "Promo",
    NEWSLETTERS: "News",
    PURCHASES: "Purchase",
    UPDATES: "Update",
    SOCIAL: "Social",
    FORUMS: "Forum",
    OTHER: "Other",
  };
  return category ? labels[category] : "";
}

function emailCategoryClass(category?: EmailAutoCategory | null) {
  switch (category) {
    case "PROMOTIONS":
      return "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100";
    case "NEWSLETTERS":
      return "bg-sky-50 text-sky-700 ring-sky-100";
    case "PURCHASES":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "UPDATES":
      return "bg-amber-50 text-amber-700 ring-amber-100";
    case "PEOPLE":
    default:
      return "bg-gray-100 text-gray-600 ring-gray-200";
  }
}

const autoFilters: Array<{ key: AutoFilter; label: string; icon: ReactNode }> = [
  { key: "all", label: "All", icon: <Mail size={13} /> },
  { key: "people", label: "People", icon: <Users size={13} /> },
  { key: "promotions", label: "Promotions", icon: <Tags size={13} /> },
  { key: "newsletters", label: "Newsletters", icon: <NewspaperIcon /> },
  { key: "purchases", label: "Purchases", icon: <Receipt size={13} /> },
];

const moveCategoryOptions: Array<{ category: EmailAutoCategory | null; label: string }> = [
  { category: "PEOPLE", label: "People" },
  { category: "PROMOTIONS", label: "Promotions" },
  { category: "NEWSLETTERS", label: "Newsletters" },
  { category: "PURCHASES", label: "Purchases" },
  { category: "UPDATES", label: "Updates" },
  { category: null, label: "Use automatic" },
];

function NewspaperIcon() {
  return <span className="text-[13px] leading-none">▤</span>;
}

function fileTone(mimeType: string) {
  if (mimeType.includes("pdf")) return "text-red-600";
  if (mimeType.startsWith("image/")) return "text-green-600";
  if (mimeType.includes("word") || mimeType.includes("document")) return "text-blue-600";
  return "text-gray-500";
}

function splitPlainTextSignature(text: string) {
  const match = text.search(/^--\s*$/m);
  if (match === -1) return { body: text, signature: "" };
  return { body: text.slice(0, match).trim(), signature: text.slice(match).trim() };
}

function splitPlainTextQuote(text: string): { visible: string; quoted: string; hasQuote: boolean } {
  const patterns = [
    /^On .+\n?.+wrote:$/m,
    /^-{3,}\s*Original Message\s*-{3,}/im,
    /^From:\s.+\n(?:Sent|Date):\s/im,
    /^De\s?:\s.+\n(?:Envoyé|Date)\s?:\s/im,
    /^_{5,}$/m,
  ];
  let splitIndex = -1;
  for (const pattern of patterns) {
    const match = text.search(pattern);
    if (match !== -1 && (splitIndex === -1 || match < splitIndex)) splitIndex = match;
  }
  if (splitIndex === -1) return { visible: text, quoted: "", hasQuote: false };
  return { visible: text.slice(0, splitIndex).trim(), quoted: text.slice(splitIndex), hasQuote: true };
}

function stripPlainTextNoise(text: string) {
  return text
    .replace(/^\s*(This Message is From an External Sender|External Sender|Caution:|VIGILANCE\s?:|Attention\s?:).*(?:\n|$)/gim, "")
    .replace(/^\s*(Caution|Vigilance|Attention).*do not click.*(?:\n|$)/gim, "")
    .replace(/([A-Za-z0-9À-ÿ .,'_-]+)<mailto:[^>]+>/gi, "$1")
    .replace(/([A-Za-z0-9À-ÿ .,'_-]+)<https?:\/\/[^>]+>/gi, "$1");
}

function cleanEmailPreview(text: string) {
  const quoteSplit = splitPlainTextQuote(stripPlainTextNoise(text || ""));
  return quoteSplit.visible
    .replace(/<mailto:[^>]+>/gi, "")
    .replace(/<https?:\/\/[^>]+>/gi, "")
    .replace(/\bmailto:[^\s)>,]+/gi, "")
    .replace(/\bhttps?:\/\/[^\s)>,]+/gi, "")
    .replace(/\[[^\]]*cid:[^\]]+\]/gi, "")
    .replace(/\b(From|Sent|Date|To|Cc|Subject|De|Envoyé|À|Objet)\s?:\s?.*$/gim, "")
    .replace(/\b(This Message is From an External Sender|Caution:|VIGILANCE\s?:).*$/gim, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isOutlookQuoteHeader(text: string) {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  return (
    /^(From|De)\s?:\s+/i.test(normalized)
    && /^(Sent|Envoyé|Date)\s?:\s+/im.test(normalized)
    && /^(To|À)\s?:\s+/im.test(normalized)
  ) || /^(This Message is From an External Sender|VIGILANCE\s?:)/i.test(normalized);
}

function hideQuotedContent(htmlString: string): { visible: string; quoted: string; hasQuote: boolean } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  doc.querySelectorAll("style, script").forEach((element) => element.remove());
  doc.querySelectorAll("div, p, span, table, td").forEach((element) => {
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const isWarning =
      /^(This Message is From an External Sender|External Sender|Caution:|VIGILANCE\s?:|Attention\s?:)/i.test(text)
      || /(do not click links|n'ouvrez pas les pièces jointes|personne externe)/i.test(text);
    if (isWarning && text.length < 700) element.remove();
  });

  const nodeHtml = (node: Node) => {
    if (node instanceof Element) return node.outerHTML;
    return node.textContent ?? "";
  };

  const removeFromNode = (node: Node) => {
    const quotedParts: string[] = [];
    let anchor: Node | null = node;
    while (anchor?.parentNode && anchor.parentNode !== doc.body) {
      let sibling = anchor.nextSibling;
      while (sibling) {
        const next = sibling.nextSibling;
        quotedParts.push(nodeHtml(sibling));
        sibling.parentNode?.removeChild(sibling);
        sibling = next;
      }
      const parent: Node | null = anchor.parentNode;
      quotedParts.unshift(nodeHtml(anchor));
      anchor.parentNode?.removeChild(anchor);
      anchor = parent;
    }

    if (anchor?.parentNode === doc.body) {
      let sibling = anchor.nextSibling;
      while (sibling) {
        const next = sibling.nextSibling;
        quotedParts.push(nodeHtml(sibling));
        sibling.parentNode?.removeChild(sibling);
        sibling = next;
      }
      quotedParts.unshift(nodeHtml(anchor));
      anchor.parentNode.removeChild(anchor);
    }

    const quoted = quotedParts.join("");
    return { visible: doc.body.innerHTML, quoted, hasQuote: true };
  };

  const gmailQuote = doc.querySelector(".gmail_quote, .gmail_extra");
  if (gmailQuote) return removeFromNode(gmailQuote);

  const blockquotes = doc.querySelectorAll("blockquote");
  if (blockquotes.length > 0) {
    const quoted = Array.from(blockquotes).map((bq) => bq.outerHTML).join("");
    blockquotes.forEach((bq) => bq.remove());
    return { visible: doc.body.innerHTML, quoted, hasQuote: true };
  }

  const horizontalRules = doc.querySelectorAll("hr");
  for (const hr of horizontalRules) {
    let probe = hr.nextSibling;
    let probeText = "";
    while (probe && probeText.length < 1200) {
      probeText += ` ${probe.textContent ?? ""}`;
      if (isOutlookQuoteHeader(probeText)) return removeFromNode(hr);
      probe = probe.nextSibling;
    }
  }

  const allElements = doc.querySelectorAll("div, p, td, table");
  for (const el of allElements) {
    const text = el.textContent ?? "";
    if (isOutlookQuoteHeader(text)) {
      return removeFromNode(el);
    }
  }

  return { visible: doc.body.innerHTML, quoted: "", hasQuote: false };
}

function trimHtmlTextQuoteHeaders(htmlString: string): { visible: string; quoted: string; hasQuote: boolean } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();

  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (let index = 0; index < textNodes.length; index += 1) {
    const node = textNodes[index];
    const text = node.textContent ?? "";
    const marker = text.search(/(^|[\r\n]|\s)(From|De)\s?:\s*/i);
    if (marker === -1) continue;

    const nearbyText = textNodes
      .slice(index, Math.min(index + 80, textNodes.length))
      .map((item) => item.textContent ?? "")
      .join("\n");

    const looksLikeHeaderBlock =
      /(^|[\r\n]|\s)(Date|Sent|Envoyé)\s?:\s*/im.test(nearbyText)
      && /(^|[\r\n]|\s)(To|À|Cc|Subject|Objet)\s?:\s*/im.test(nearbyText);

    if (!looksLikeHeaderBlock) continue;

    const range = doc.createRange();
    range.setStart(node, marker);
    range.setEndAfter(doc.body.lastChild ?? node);
    const fragment = range.cloneContents();
    const container = doc.createElement("div");
    container.appendChild(fragment);
    range.deleteContents();

    return {
      visible: doc.body.innerHTML,
      quoted: container.innerHTML,
      hasQuote: true,
    };
  }

  return { visible: htmlString, quoted: "", hasQuote: false };
}

function normalizeEmailHtmlForDisplay(htmlString: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  doc.querySelectorAll("style, script").forEach((element) => element.remove());
  doc.querySelectorAll("center").forEach((element) => {
    const wrapper = doc.createElement("div");
    wrapper.innerHTML = element.innerHTML;
    element.replaceWith(wrapper);
  });

  doc.querySelectorAll<HTMLElement>("body, div, p, span, table, tbody, tr, td").forEach((element) => {
    const align = element.getAttribute("align")?.toLowerCase();
    if (align === "center" || align === "right" || align === "justify") element.removeAttribute("align");

    const style = element.getAttribute("style");
    if (!style) return;

    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const cleaned = style
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => {
        const [rawProperty, rawValue = ""] = part.split(":");
        const property = rawProperty.trim().toLowerCase();
        const value = rawValue.trim().toLowerCase();

        if (property === "text-align" && ["center", "right", "justify"].includes(value)) return false;
        if (property === "font-weight" && text.length > 80 && /^(bold|[7-9]00)$/.test(value)) return false;
        if (property === "font-size" && text.length > 80 && /(?:2[2-9]|[3-9]\d)px/.test(value)) return false;
        return true;
      })
      .join("; ");

    if (cleaned) element.setAttribute("style", cleaned);
    else element.removeAttribute("style");
  });

  return doc.body.innerHTML;
}

function sanitizeEmailHtml(html: string, showImages: boolean) {
  return DOMPurify.sanitize(normalizeEmailHtmlForDisplay(html), {
    FORBID_TAGS: showImages ? ["style", "script"] : ["img", "style", "script"],
  });
}

function sanitizeOriginalEmailHtml(html: string, showImages: boolean) {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: showImages ? ["script"] : ["img", "script"],
  });
}

function escapeHtml(text: string) {
  return text.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char] ?? char));
}

export default function Email() {
  const { drafts, openDraft, openReply: openDraftReply, maximizeDraft, refreshDrafts } = useDrafts();
  const initialComposeHandled = useRef(false);
  const initialParams = new URLSearchParams(window.location.search);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialParams.get("thread"));
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(initialParams.get("message"));
  const [thread, setThread] = useState<EmailThread | null>(null);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [folder, setFolder] = useState<Folder>("inbox");
  const [filter, setFilter] = useState<Filter>("all");
  const [autoFilter, setAutoFilter] = useState<AutoFilter>("all");
  const [search, setSearch] = useState("");
  const [saveAttachment, setSaveAttachment] = useState<SaveAttachmentState | null>(null);
  const [previewFile, setPreviewFile] = useState<JobFile | null>(null);
  const [peopleThread, setPeopleThread] = useState<EmailThread | null>(null);
  const [opportunityThread, setOpportunityThread] = useState<EmailThread | null>(null);
  const [filingAttachment, setFilingAttachment] = useState("");
  const [unsubscribeResult, setUnsubscribeResult] = useState<UnsubscribeResult | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchRef = useRef(search);

  async function loadAccounts() {
    const data = await api.get<EmailAccount[]>("/api/email/accounts");
    setAccounts(data);
    setActiveAccountId((current) => current || data.find((account) => account.isPrimary)?.id || data[0]?.id || "");
  }

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const loadThreads = useCallback(async (searchValue = searchRef.current) => {
    if (folder === "drafts") {
      setThreads([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (activeAccountId) params.set("accountId", activeAccountId);
      params.set("folder", folder);
      if (autoFilter !== "all") params.set("category", autoFilter);
      if (searchValue) params.set("search", searchValue);
      if (filter === "unread") params.set("unread", "true");
      if (filter === "flagged") params.set("flagged", "true");
      const data = await api.get<EmailThreadsResponse>(`/api/email/threads?${params.toString()}`);
      setThreads(data.threads);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email");
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, autoFilter, filter, folder]);

  async function loadThread(id: string, messageId?: string | null, options: { keepUnsubscribeResult?: boolean } = {}) {
    if (!options.keepUnsubscribeResult) setUnsubscribeResult(null);
    const params = new URLSearchParams({ limit: messageId ? "500" : "10" });
    if (messageId) params.set("message", messageId);
    const data = await api.get<EmailThread>(`/api/email/threads/${id}?${params.toString()}`);
    setThread(data);
    setThreads((items) => items.map((item) => item.id === id ? { ...item, isRead: true } : item));
  }

  function selectThread(id: string, messageId: string | null = null) {
    setSelectedThreadId(id);
    setSelectedMessageId(messageId);
    const params = new URLSearchParams(window.location.search);
    params.set("thread", id);
    if (messageId) params.set("message", messageId);
    else params.delete("message");
    window.history.replaceState(null, "", `/email?${params.toString()}`);
  }

  function clearSelectedThread() {
    setSelectedThreadId(null);
    setSelectedMessageId(null);
    window.history.replaceState(null, "", "/email");
  }

  async function loadOlderMessages() {
    if (!thread || thread.messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const before = encodeURIComponent(thread.messages[0].sentAt);
      const older = await api.get<EmailThread>(`/api/email/threads/${thread.id}?before=${before}&limit=20`);
      setThread({
        ...older,
        messages: [...older.messages, ...thread.messages],
        hasMoreOlder: older.hasMoreOlder,
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    loadAccounts().catch(console.error);
  }, []);

  useEffect(() => {
    if (initialComposeHandled.current) return;
    initialComposeHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("compose") === "draft") {
      const raw = localStorage.getItem("emailDraft");
      if (raw) {
        const draft = JSON.parse(raw) as { to?: string; subject?: string; bodyHtml?: string; linkedOpportunityId?: string; linkedProductionId?: string };
        localStorage.removeItem("emailDraft");
        openDraft({
          to: draft.to ? [draft.to] : [],
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          linkedOpportunityId: draft.linkedOpportunityId,
          linkedProductionId: draft.linkedProductionId,
        }).catch(console.error);
      } else {
        openDraft().catch(console.error);
      }
    }
  }, [openDraft]);

  useEffect(() => {
    if (folder === "drafts") {
      refreshDrafts().catch(console.error);
      return;
    }
    loadThreads(searchRef.current).catch(console.error);
  }, [activeAccountId, folder, filter, autoFilter, refreshDrafts, loadThreads]);
  useEffect(() => {
    const timer = setTimeout(() => { loadThreads(search).catch(console.error); }, 250);
    return () => clearTimeout(timer);
  }, [loadThreads, search]);
  useEffect(() => {
    if (selectedThreadId) loadThread(selectedThreadId, selectedMessageId).catch(console.error);
    else setThread(null);
  }, [selectedThreadId, selectedMessageId]);

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
  const visibleDrafts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return drafts;
    return drafts.filter((draft) => [
      draft.subject,
      draft.bodyHtml.replace(/<[^>]+>/g, " "),
      ...draft.to,
      ...draft.cc,
      ...draft.bcc,
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [drafts, search]);
  const groupedDrafts = useMemo(() => {
    const groups: Array<{ label: string; items: Draft[] }> = [];
    for (const item of visibleDrafts) {
      const label = dateGroup(item.lastEditedAt);
      const group = groups.find((entry) => entry.label === label);
      if (group) group.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [visibleDrafts]);
  const currentAccount = accounts.find((account) => account.id === activeAccountId) ?? accounts.find((account) => account.isPrimary) ?? accounts[0];

  function openReply(targetThread: EmailThread) {
    const latest = [...targetThread.messages].reverse().find((message) => !message.isFromMe) ?? targetThread.messages[targetThread.messages.length - 1];
    openDraftReply({
      id: targetThread.id,
      gmailThreadId: targetThread.gmailThreadId,
      subject: targetThread.subject,
      participants: targetThread.participants,
      accountEmail: targetThread.account?.emailAddress,
      lastMessageMsgId: latest?.gmailMessageId ?? latest?.externalMessageId,
      references: latest?.externalMessageId,
      linkedOpportunityId: targetThread.linkedOpportunityId,
      linkedProductionId: targetThread.linkedProductionId,
      messages: targetThread.messages,
    }).catch(console.error);
  }

  async function fileAttachment(attachment: EmailAttachmentSummary, productionId?: string) {
    if (attachment.jobFile) {
      setPreviewFile(attachment.jobFile);
      return;
    }

    const key = `${attachment.messageId}-${attachment.attachmentIndex}`;
    setFilingAttachment(key);
    try {
      const file = await api.post<JobFile>(`/api/email/messages/${attachment.messageId}/attachment/${attachment.attachmentIndex}/save-to-job`, {
        productionId,
      });
      setPreviewFile(file);
      if (selectedThreadId) await loadThread(selectedThreadId, selectedMessageId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to file attachment");
    } finally {
      setFilingAttachment("");
    }
  }

  return (
    <div className="flex h-full bg-white">
      <aside className="hidden w-[210px] shrink-0 flex-col border-r border-gray-200 bg-[#fbfbfa] text-gray-900 md:flex">
        <div className="px-4 pb-3 pt-4">
          <p className="text-sm font-semibold">Mail</p>
          <p className="mt-1 truncate text-[11px] text-gray-400">{currentAccount?.emailAddress ?? "No account"}</p>
        </div>
        <div className="flex-1 overflow-auto px-2">
          {accounts.map((account) => (
            <div key={account.id} className="mb-3">
              <button onClick={() => setActiveAccountId(account.id)} className={`mb-1 min-h-12 w-full rounded-lg px-3 text-left ${activeAccountId === account.id ? "bg-white shadow-sm ring-1 ring-gray-200" : "hover:bg-white"}`}>
                <span className="block text-xs font-medium text-gray-900">{account.label}</span>
                <span className="block truncate text-[11px] text-gray-400">{account.emailAddress}</span>
              </button>
              <FolderButton active={folder === "inbox" && activeAccountId === account.id} icon={<Inbox size={14} />} label="Inbox" count={unreadCount} onClick={() => { setActiveAccountId(account.id); setFolder("inbox"); }} />
              <FolderButton active={folder === "sent" && activeAccountId === account.id} icon={<Send size={14} />} label="Sent" onClick={() => { setActiveAccountId(account.id); setFolder("sent"); }} />
              <FolderButton active={folder === "drafts" && activeAccountId === account.id} icon={<PencilLine size={14} />} label="Drafts" count={drafts.length} onClick={() => { setActiveAccountId(account.id); setFolder("drafts"); }} />
              <FolderButton active={folder === "starred" && activeAccountId === account.id} icon={<Star size={14} />} label="Starred" onClick={() => { setActiveAccountId(account.id); setFolder("starred"); }} />
              <FolderButton active={folder === "unread" && activeAccountId === account.id} icon={<Flag size={14} />} label="Unread" onClick={() => { setActiveAccountId(account.id); setFolder("unread"); }} />
              <FolderButton active={folder === "archived" && activeAccountId === account.id} icon={<Archive size={14} />} label="Archived" onClick={() => { setActiveAccountId(account.id); setFolder("archived"); }} />
            </div>
          ))}
        </div>
      </aside>

      <section className={`${selectedThreadId ? "hidden md:flex" : "flex"} w-full flex-col border-r border-gray-200 bg-white md:w-[320px] md:shrink-0`}>
        <div className="flex min-h-14 items-center gap-2 border-b border-gray-100 px-3 md:hidden">
          <select value={activeAccountId} onChange={(event) => setActiveAccountId(event.target.value)} className="min-h-11 flex-1 rounded-lg border border-gray-200 px-3 text-sm">
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <select value={folder} onChange={(event) => setFolder(event.target.value as Folder)} className="min-h-11 rounded-lg border border-gray-200 px-3 text-sm capitalize">
            <option value="inbox">Inbox</option>
            <option value="sent">Sent</option>
            <option value="drafts">Drafts</option>
            <option value="starred">Starred</option>
            <option value="unread">Unread</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex min-h-16 items-center gap-3 border-b border-gray-100 px-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-950">{folderTitle(folder)}</h2>
            <p className="truncate text-[11px] text-gray-400">{folder === "drafts" ? `${drafts.length} Gmail drafts` : currentAccount?.emailAddress ?? ""}</p>
          </div>
          <button
            type="button"
            onClick={() => openDraft().catch(console.error)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#1a1a1f] px-3 text-xs font-medium text-white shadow-sm"
          >
            <PencilLine size={14} /> Compose
          </button>
        </div>
        <div className="flex h-11 items-center gap-2 border-b border-gray-100 px-3">
          <Search size={15} className="text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email" className="h-full flex-1 border-0 bg-transparent text-xs outline-none" />
        </div>
        {folder !== "drafts" && (
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {autoFilters.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setAutoFilter(item.key)}
                  className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] ${autoFilter === item.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {item.icon}{item.label}
                </button>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              {(["all", "unread", "flagged"] as Filter[]).map((item) => (
                <button key={item} onClick={() => setFilter(item)} className={`min-h-6 rounded-full px-2.5 text-[10px] capitalize ${filter === item ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}>{item}</button>
              ))}
            </div>
          </div>
        )}
        {error && <p className="p-3 text-sm text-red-600">{error}</p>}
        <div className="flex-1 overflow-auto">
          {folder === "drafts" ? (
            groupedDrafts.map((group) => (
              <div key={group.label}>
                <div className="hidden px-4 py-2 text-[11px] uppercase tracking-wide text-gray-400 md:block">{group.label}</div>
                {group.items.map((item) => (
                  <DraftRow key={item.id} draft={item} onClick={() => maximizeDraft(item.id)} />
                ))}
              </div>
            ))
          ) : (
            groupedThreads.map((group) => (
              <div key={group.label}>
                <div className="hidden px-4 py-2 text-[11px] uppercase tracking-wide text-gray-400 md:block">{group.label}</div>
                {group.items.map((item) => (
                  <ThreadRow key={item.id} thread={item} active={selectedThreadId === item.id} onClick={() => selectThread(item.id)} />
                ))}
              </div>
            ))
          )}
          {!loading && folder !== "drafts" && threads.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              <Mail size={32} className="mx-auto mb-2 opacity-30" />
              No conversations yet.
            </div>
          )}
          {folder === "drafts" && visibleDrafts.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-400">
              <PencilLine size={32} className="mx-auto mb-2 opacity-30" />
              No drafts yet.
            </div>
          )}
        </div>
      </section>

      <section className={`${selectedThreadId ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col bg-white`}>
        {thread ? (
          <ThreadDetail
            thread={thread}
            focusedMessageId={selectedMessageId}
            filingAttachment={filingAttachment}
            onOpenAttachment={(attachment) => { fileAttachment(attachment, thread.linkedProductionId).catch(console.error); }}
            loadingOlder={loadingOlder}
            onLoadOlder={() => { loadOlderMessages().catch(console.error); }}
            onBack={clearSelectedThread}
            onOpenReply={() => openReply(thread)}
            onFlag={async () => { await api.post(`/api/email/threads/${thread.id}/star`, { starred: !thread.isFlagged }); await loadThread(thread.id, selectedMessageId); await loadThreads(); }}
            onMarkUnread={async () => {
              await api.post(`/api/email/threads/${thread.id}/read`, { read: false });
              clearSelectedThread();
              await loadThreads();
            }}
            onArchive={async () => {
              if (folder === "archived") await api.post(`/api/email/threads/${thread.id}/unarchive`, {});
              else await api.post(`/api/email/threads/${thread.id}/archive`, {});
              clearSelectedThread();
              await loadThreads();
            }}
            onUnsubscribe={async () => {
              try {
                const result = await api.post<UnsubscribeResult>(`/api/email/threads/${thread.id}/unsubscribe`, {});
                setUnsubscribeResult(result);
                await loadThread(thread.id, selectedMessageId, { keepUnsubscribeResult: true });
                await loadThreads();
              } catch (err) {
                setError(err instanceof Error ? err.message : "No unsubscribe option detected");
              }
            }}
            onMoveCategory={async (category, scope = "thread") => {
              await api.patch(`/api/email/threads/${thread.id}/category`, { category, scope });
              await loadThread(thread.id, selectedMessageId);
              await loadThreads();
            }}
            unsubscribeResult={unsubscribeResult}
            onDismissUnsubscribeResult={() => setUnsubscribeResult(null)}
            onOpenPeople={() => setPeopleThread(thread)}
            onCreateOpportunity={() => setOpportunityThread(thread)}
            onLinked={async () => { await loadThread(thread.id, selectedMessageId); await loadThreads(); }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
            <Mail size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Select a conversation</p>
          </div>
        )}
      </section>

      {saveAttachment && (
        <SaveAttachmentModal
          attachment={saveAttachment.attachment}
          productionId={saveAttachment.productionId}
          onClose={() => setSaveAttachment(null)}
          onSaved={(file) => {
            setSaveAttachment(null);
            setPreviewFile(file);
            if (selectedThreadId) loadThread(selectedThreadId, selectedMessageId).catch(console.error);
          }}
        />
      )}
      {previewFile && (
        <PreviewPanel
          file={previewFile}
          productionId={previewFile.productionId ?? undefined}
          folders={JOB_FOLDERS}
          onClose={() => setPreviewFile(null)}
          onPatch={async (patch) => {
            const updated = await api.patch<JobFile>(`/api/files/${previewFile.id}`, patch);
            setPreviewFile(updated);
          }}
        />
      )}
      {peopleThread && (
        <PeoplePanel
          thread={peopleThread}
          accountEmail={peopleThread.account?.emailAddress}
          onClose={() => setPeopleThread(null)}
          onChanged={() => {
            loadThread(peopleThread.id).catch(console.error);
            loadThreads().catch(console.error);
          }}
        />
      )}
      {opportunityThread && (
        <CreateOpportunityDrawer
          thread={opportunityThread}
          onClose={() => setOpportunityThread(null)}
          onCreated={(opportunityId) => {
            setOpportunityThread(null);
            loadThread(opportunityThread.id).catch(console.error);
            loadThreads().catch(console.error);
            window.setTimeout(() => { window.location.href = `/opportunities?opportunity=${opportunityId}`; }, 600);
          }}
        />
      )}
    </div>
  );
}

function FolderButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-xs ${active ? "bg-[#1a1a1f] font-medium text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900"}`}>
      {icon}<span className="flex-1">{label}</span>{Boolean(count) && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white text-gray-900" : "bg-blue-500 text-white"}`}>{count}</span>}
    </button>
  );
}

function ThreadRow({ thread, active, onClick }: { thread: EmailThread; active: boolean; onClick: () => void }) {
  const name = senderName(thread);
  const category = thread.categoryOverride ?? thread.autoCategory;
  const showCategory = Boolean(category && (category !== "PEOPLE" || thread.categoryOverride));
  const linkDot = thread.linkedProductionId
    ? { color: "bg-emerald-500", title: `Linked to ${thread.linkedProduction?.jobCode ?? "production"}` }
    : thread.linkedOpportunityId
      ? { color: "bg-blue-500", title: `Linked to ${thread.linkedOpportunity?.title ?? thread.linkedOpportunity?.clientName ?? "opportunity"}` }
      : thread.linkedContactId
        ? { color: "bg-gray-400", title: `Linked to ${contactName(thread.linkedContact) || "contact"}` }
        : null;
  return (
    <button
      onClick={onClick}
      className={`relative grid min-h-[68px] w-full grid-cols-[34px_1fr] gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-[#f8f8f6] ${active ? "border-l-2 border-l-gray-900 bg-[#f3f3f1]" : ""}`}
    >
      {!thread.isRead && <span className="absolute left-1 top-5 h-2 w-2 rounded-full bg-blue-500" />}
      <span className="relative grid h-8 w-8 place-items-center rounded-full text-[11px] font-medium text-white shadow-sm" style={{ background: thread.avatarColor ?? "#5B8DEF" }}>
        {initials(name)}
        {(thread.messageCount ?? 0) > 1 && <span className="absolute -bottom-1 -right-1 min-w-4 rounded-full bg-gray-900 px-1 text-center text-[10px] leading-4 text-white">{thread.messageCount}</span>}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-[13px] ${thread.isRead ? "font-normal text-gray-700" : "font-medium text-gray-950"}`}>{name}</span>
          {linkDot && <span title={linkDot.title} className={`h-2 w-2 shrink-0 rounded-full ${linkDot.color}`} />}
          {thread.isFlagged && <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />}
          <span className="text-[11px] text-gray-400">{timeLabel(thread.lastMessageAt)}</span>
        </span>
        <span className={`mt-0.5 flex min-w-0 items-center gap-1 truncate text-[13px] ${thread.isRead ? "font-normal" : "font-semibold"} text-gray-800`}>
          <span className="truncate">{thread.subject}</span>
          {thread.hasAttachments && <Paperclip size={12} className="shrink-0 text-gray-400" />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-gray-500">
          {showCategory && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${emailCategoryClass(category)}`}>
              {emailCategoryLabel(category)}
            </span>
          )}
          {(thread.linkedOpportunity || thread.linkedProduction) && (
            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
              {thread.linkedProduction?.jobCode ?? thread.linkedOpportunity?.clientName ?? "Linked"}
            </span>
          )}
          <span className="truncate">{thread.latestPreview}</span>
        </span>
      </span>
    </button>
  );
}

function draftPreview(draft: Draft) {
  return draft.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function DraftRow({ draft, onClick }: { draft: Draft; onClick: () => void }) {
  const recipients = draft.to.length ? draft.to.join(", ") : "No recipients";
  const title = draft.subject.trim() || (draft.replyToThreadId ? "Reply draft" : "New message");
  const preview = draftPreview(draft) || "Empty draft";
  return (
    <button
      onClick={onClick}
      className="relative grid min-h-[76px] w-full grid-cols-[40px_1fr] gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-[#f8f8f6]"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-700">
        <PencilLine size={15} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-950">{title}</span>
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Draft</span>
          <span className="text-[11px] text-gray-400">{timeLabel(draft.lastEditedAt)}</span>
        </span>
        <span className="block truncate text-[12px] text-gray-500">To: {recipients}</span>
        <span className="block truncate text-xs text-gray-500">{preview}</span>
      </span>
    </button>
  );
}

function ThreadDetail({ thread, focusedMessageId, filingAttachment, loadingOlder, unsubscribeResult, onDismissUnsubscribeResult, onOpenAttachment, onLoadOlder, onBack, onOpenReply, onFlag, onMarkUnread, onArchive, onUnsubscribe, onMoveCategory, onOpenPeople, onCreateOpportunity, onLinked }: { thread: EmailThread; focusedMessageId: string | null; filingAttachment: string; loadingOlder: boolean; unsubscribeResult: UnsubscribeResult | null; onDismissUnsubscribeResult: () => void; onOpenAttachment: (attachment: EmailAttachmentSummary) => void; onLoadOlder: () => void; onBack: () => void; onOpenReply: () => void; onFlag: () => void; onMarkUnread: () => void; onArchive: () => void; onUnsubscribe: () => void; onMoveCategory: (category: EmailAutoCategory | null, scope?: CategoryScope) => void; onOpenPeople: () => void; onCreateOpportunity: () => void; onLinked: () => void }) {
  const [expandedAttachments, setExpandedAttachments] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [actionSavingId, setActionSavingId] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState<EmailMessage | null>(null);
  const attachments = thread.attachments ?? [];
  const visibleAttachments = expandedAttachments ? attachments : attachments.slice(0, 3);
  const attachmentSize = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  const latestId = thread.messages[thread.messages.length - 1]?.id;
  const defaultExpanded = useMemo(() => {
    if (focusedMessageId) return new Set([focusedMessageId]);
    return new Set(thread.messages.filter((message) => message.id === latestId || (!message.isFromMe && !thread.isRead)).map((message) => message.id));
  }, [thread.messages, latestId, thread.isRead, focusedMessageId]);
  const participantLabel = participantSummary(thread.participantNames ?? [], thread.participants);
  const participantTitle = (thread.participantNames?.length ? thread.participantNames : thread.participants).join(", ");
  const canTryUnsubscribe = !thread.unsubscribedAt && (Boolean(thread.unsubscribeUrl || thread.unsubscribeEmail) || thread.autoCategory === "NEWSLETTERS" || thread.autoCategory === "PROMOTIONS");

  async function createActionFromMessage(message: EmailMessage, draft: MessageTaskDraft) {
    setActionSavingId(message.id);
    try {
      await api.post(`/api/project-actions/email/messages/${message.id}/actions`, {
        title: draft.title,
        productionId: draft.productionId || undefined,
        blackbookEntryId: draft.blackbookEntryId || undefined,
        roleRequirementId: draft.roleRequirementId || undefined,
        optionCandidateId: draft.optionCandidateId || undefined,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : undefined,
        description: draft.description,
      });
      setTaskMessage(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not create the linked action.");
    } finally {
      setActionSavingId(null);
    }
  }

  return (
    <>
      <header className="relative shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mb-1 flex items-center gap-2">
          <button onClick={onBack} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><ArrowLeft size={18} /></button>
          <h1 className="min-w-0 flex-1 truncate text-base font-medium text-gray-900">{thread.subject}</h1>
          <button onClick={onFlag} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Star size={17} className={thread.isFlagged ? "fill-amber-400 text-amber-400" : ""} /></button>
          <button onClick={onArchive} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><Archive size={17} /></button>
          <button onClick={() => setActionMenuOpen((current) => !current)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><MoreHorizontal size={16} /></button>
        </div>
        <button
          type="button"
          onClick={onOpenPeople}
          title={participantTitle}
          className="block max-w-full truncate text-left text-xs text-gray-500 hover:text-gray-900"
        >
          {participantLabel}
        </button>
        <LinkedRecordPills thread={thread} onLinked={onLinked} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setLinkOpen((current) => !current)} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-gray-100 px-3 text-[11px] text-gray-700 hover:bg-gray-200"><Link2 size={13} /> Link</button>
          <button onClick={onOpenPeople} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-gray-100 px-3 text-[11px] text-gray-700 hover:bg-gray-200"><Users size={13} /> People</button>
          <button onClick={onOpenReply} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#1a1a1f] px-3 text-[11px] text-white"><Reply size={13} /> Reply</button>
          {canTryUnsubscribe && (
            <button onClick={onUnsubscribe} className="inline-flex min-h-8 items-center rounded-full bg-amber-50 px-3 text-[11px] font-medium text-amber-700 hover:bg-amber-100">Unsubscribe</button>
          )}
        </div>
        {attachments.length > 0 && (
          <div className="mt-2 hidden md:block">
            <button
              type="button"
              onClick={() => setExpandedAttachments((current) => !current)}
              className="inline-flex min-h-8 items-center gap-2 rounded-full bg-[#f0f0ee] px-3 text-xs text-gray-600 hover:bg-gray-200"
            >
              <Paperclip size={13} className="text-blue-600" />
              {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
              <span className="text-gray-400">{formatBytes(attachmentSize)}</span>
              <ChevronDown size={13} className={`text-gray-400 transition-transform ${expandedAttachments ? "rotate-180" : ""}`} />
            </button>
            {expandedAttachments && (
              <div className="mt-2 flex flex-wrap gap-2">
                {visibleAttachments.map((attachment) => (
                  <AttachmentChip
                    key={`${attachment.messageId}-${attachment.attachmentIndex}`}
                    attachment={attachment}
                    filing={filingAttachment === `${attachment.messageId}-${attachment.attachmentIndex}`}
                    onOpen={onOpenAttachment}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {linkOpen && <LinkDropdown thread={thread} onClose={() => setLinkOpen(false)} onLinked={onLinked} />}
        {actionMenuOpen && (
          <ThreadActionMenu
            onClose={() => setActionMenuOpen(false)}
            onReply={onOpenReply}
            onPeople={onOpenPeople}
            onOpportunity={onCreateOpportunity}
            onMarkUnread={onMarkUnread}
            onArchive={onArchive}
            onUnsubscribe={canTryUnsubscribe ? onUnsubscribe : undefined}
            onMoveCategory={onMoveCategory}
            currentCategory={thread.categoryOverride ?? thread.autoCategory}
            onStar={onFlag}
            starred={thread.isFlagged}
          />
        )}
      </header>
      {unsubscribeResult && (
        <UnsubscribeNotice result={unsubscribeResult} onClose={onDismissUnsubscribeResult} />
      )}
      <CrmSuggestionBanner thread={thread} onLinked={onLinked} />
      <div className="flex-1 overflow-auto bg-[#f4f5f7] px-3 py-4 pb-28 md:px-5">
        {thread.hasMoreOlder && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="min-h-10 rounded-full bg-[#f0f0ee] px-4 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-60"
            >
              {loadingOlder ? "Loading..." : `Load earlier messages${thread.totalMessageCount ? ` (${thread.totalMessageCount - thread.messages.length} older)` : ""}`}
            </button>
          </div>
        )}
        {thread.messages.map((message, index) => {
          return (
            <Fragment key={message.id}>
              <MessageBlock
                message={message}
                filingAttachment={filingAttachment}
                onOpenAttachment={onOpenAttachment}
                defaultExpanded={defaultExpanded.has(message.id)}
                focused={focusedMessageId === message.id}
                showNewDivider={index > 0 && !message.isFromMe && !thread.isRead}
                onCreateAction={() => setTaskMessage(message)}
                creatingAction={actionSavingId === message.id}
              />
            </Fragment>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-3">
        <button onClick={onOpenReply} className="flex min-h-10 w-full items-center gap-2 text-left text-[13px] text-gray-400 hover:text-gray-700">
          <Reply size={16} /> Reply to {[...thread.messages].reverse().find((message) => !message.isFromMe)?.resolvedFromName ?? "sender"}...
        </button>
      </div>
      {taskMessage && (
        <CreateMessageTaskDrawer
          thread={thread}
          message={taskMessage}
          saving={actionSavingId === taskMessage.id}
          onClose={() => setTaskMessage(null)}
          onCreate={(draft) => createActionFromMessage(taskMessage, draft)}
        />
      )}
    </>
  );
}

function UnsubscribeNotice({ result, onClose }: { result: UnsubscribeResult; onClose: () => void }) {
  const copyTarget = result.mailto ?? result.url ?? "";
  const label = result.success
    ? "Unsubscribed successfully."
    : result.method === "MAILTO"
      ? "This sender only supports email unsubscribe. Nothing has been opened automatically."
      : "This sender uses a web unsubscribe page. Open it only if you trust the sender.";

  return (
    <div className="mx-4 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          {copyTarget && <p className="mt-1 truncate text-[11px] text-amber-700">{copyTarget}</p>}
        </div>
        {copyTarget && (
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(copyTarget).catch(console.error)}
            className="min-h-7 rounded bg-white px-2 text-[11px] font-medium text-amber-800 shadow-sm"
          >
            Copy
          </button>
        )}
        {result.url && (
          <button
            type="button"
            onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
            className="min-h-7 rounded bg-white px-2 text-[11px] font-medium text-amber-800 shadow-sm"
          >
            Open
          </button>
        )}
        <button type="button" onClick={onClose} className="grid min-h-7 min-w-7 place-items-center rounded text-amber-700 hover:bg-amber-100">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function dateInputValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function CreateMessageTaskDrawer({ thread, message, saving, onClose, onCreate }: { thread: EmailThread; message: EmailMessage; saving: boolean; onClose: () => void; onCreate: (draft: MessageTaskDraft) => void }) {
  const [productions, setProductions] = useState<Production[]>([]);
  const [targets, setTargets] = useState<LinkTargetsResponse>({});
  const [draft, setDraft] = useState<MessageTaskDraft>(() => ({
    title: `Follow up: ${thread.subject}`,
    productionId: thread.linkedProductionId ?? "",
    startAt: dateInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    description: cleanEmailPreview(message.bodyText || message.bodyHtml || message.subject).slice(0, 500),
  }));

  useEffect(() => {
    api.get<Production[]>("/api/productions?includeWrapped=true")
      .then((items) => {
        setProductions(items);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ type: "all" });
    if (draft.productionId) params.set("productionId", draft.productionId);
    api.get<LinkTargetsResponse>(`/api/email/threads/search-link-targets?${params.toString()}`)
      .then(setTargets)
      .catch(console.error);
  }, [draft.productionId]);

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/20">
      <div className="h-full w-full overflow-auto bg-white shadow-xl md:w-[390px]">
        <header className="sticky top-0 z-10 flex min-h-14 items-center border-b border-gray-100 bg-white px-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-gray-900">Create task from email</h2>
            <p className="truncate text-[11px] text-gray-400">{message.resolvedFromName || message.fromName || message.fromAddress} · {fullTimeLabel(message.sentAt)}</p>
          </div>
          <button onClick={onClose} className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-500"><X size={17} /></button>
        </header>
        <div className="space-y-3 p-4">
          <DrawerField label="Task">
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </DrawerField>
          <DrawerField label="Project">
            <select value={draft.productionId ?? ""} onChange={(event) => setDraft({ ...draft, productionId: event.target.value, roleRequirementId: "", optionCandidateId: "" })}>
              <option value="">No project / general task</option>
              {productions.map((production) => (
                <option key={production.id} value={production.id}>{production.jobCode ?? "No code"} · {production.clientName ?? production.title}</option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label="Crew / supplier requirement">
            <select value={draft.roleRequirementId ?? ""} onChange={(event) => setDraft({ ...draft, roleRequirementId: event.target.value })}>
              <option value="">Not linked</option>
              {(targets.requirements ?? []).map((requirement) => (
                <option key={requirement.id} value={requirement.id}>{requirement.group.name} · {requirement.displayLabel || requirement.name}</option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label="Option candidate">
            <select value={draft.optionCandidateId ?? ""} onChange={(event) => setDraft({ ...draft, optionCandidateId: event.target.value, blackbookEntryId: draft.blackbookEntryId || (targets.candidates ?? []).find((candidate) => candidate.id === event.target.value)?.blackbookEntry?.id || "" })}>
              <option value="">Not linked</option>
              {(targets.candidates ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.group.name} · {candidate.name}</option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label="Blackbook">
            <select value={draft.blackbookEntryId ?? ""} onChange={(event) => setDraft({ ...draft, blackbookEntryId: event.target.value })}>
              <option value="">Not linked</option>
              {(targets.blackbook ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.displayName}{entry.companyName ? ` · ${entry.companyName}` : ""}</option>
              ))}
            </select>
          </DrawerField>
          <DrawerField label="Due">
            <input type="datetime-local" value={draft.startAt} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })} />
          </DrawerField>
          <label className="block text-xs text-gray-500">
            Notes
            <textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={5}
              className="mt-1 min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm text-gray-900 outline-none focus:border-gray-400"
            />
          </label>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            Linked message<br />
            <span className="text-gray-900">{message.subject}</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="min-h-11 px-3 text-sm text-gray-500">Cancel</button>
            <button
              onClick={() => onCreate(draft)}
              disabled={saving || !draft.title.trim()}
              className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40"
            >
              {saving ? "Creating..." : "Create task →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadActionMenu({ onClose, onReply, onPeople, onOpportunity, onMarkUnread, onArchive, onUnsubscribe, onMoveCategory, currentCategory, onStar, starred }: { onClose: () => void; onReply: () => void; onPeople: () => void; onOpportunity: () => void; onMarkUnread: () => void; onArchive: () => void; onUnsubscribe?: () => void; onMoveCategory: (category: EmailAutoCategory | null, scope?: CategoryScope) => void; currentCategory: EmailAutoCategory; onStar: () => void; starred: boolean }) {
  const run = (handler: () => void) => {
    handler();
    onClose();
  };
  return (
    <div className="absolute right-4 top-12 z-40 max-h-[80vh] w-52 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-xl">
      <button type="button" onClick={() => run(onReply)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Reply size={14} /> Reply</button>
      <button type="button" onClick={() => run(onPeople)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Users size={14} /> People in thread</button>
      <button type="button" onClick={() => run(onOpportunity)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Plus size={14} /> Create opportunity</button>
      <div className="my-1 h-px bg-gray-100" />
      <button type="button" onClick={() => run(onMarkUnread)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Mail size={14} /> Mark unread</button>
      <button type="button" onClick={() => run(onArchive)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Archive size={14} /> Archive</button>
      {onUnsubscribe && <button type="button" onClick={() => run(onUnsubscribe)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-amber-700 hover:bg-amber-50"><X size={14} /> Unsubscribe</button>}
      <button type="button" onClick={() => run(onStar)} className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-gray-700 hover:bg-gray-50"><Star size={14} className={starred ? "fill-amber-400 text-amber-400" : ""} /> {starred ? "Unstar" : "Star"}</button>
      <div className="my-1 h-px bg-gray-100" />
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Move thread</div>
      {moveCategoryOptions.map((item) => (
        <button
          key={`thread-${item.label}`}
          type="button"
          onClick={() => run(() => onMoveCategory(item.category))}
          className="flex min-h-8 w-full items-center justify-between px-3 text-left text-gray-700 hover:bg-gray-50"
        >
          <span>{item.label}</span>
          {item.category && item.category === currentCategory && <span className="text-[10px] text-gray-400">current</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-gray-100" />
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Always sort sender</div>
      {moveCategoryOptions.filter((item) => item.category).map((item) => (
        <button
          key={`sender-${item.label}`}
          type="button"
          onClick={() => run(() => onMoveCategory(item.category, "sender"))}
          className="flex min-h-8 w-full items-center justify-between px-3 text-left text-gray-700 hover:bg-gray-50"
        >
          <span>{item.label}</span>
        </button>
      ))}
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Always sort domain</div>
      {moveCategoryOptions.filter((item) => item.category).map((item) => (
        <button
          key={`domain-${item.label}`}
          type="button"
          onClick={() => run(() => onMoveCategory(item.category, "domain"))}
          className="flex min-h-8 w-full items-center justify-between px-3 text-left text-gray-700 hover:bg-gray-50"
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function LinkedRecordPills({ thread, onLinked }: { thread: EmailThread; onLinked: () => void }) {
  const items = [
    thread.linkedContact ? {
      field: "contact",
      label: contactName(thread.linkedContact),
      meta: `${thread.linkedContact.company?.name ?? "Contact"}`,
      href: `/contacts?contact=${thread.linkedContact.id}`,
      tone: "bg-gray-800",
    } : null,
    thread.linkedOpportunity ? {
      field: "opportunity",
      label: thread.linkedOpportunity.title ?? thread.linkedOpportunity.clientName ?? "Opportunity",
      meta: `Opportunity · ${thread.linkedOpportunity.stage ?? ""}`,
      href: `/opportunities?opportunity=${thread.linkedOpportunity.id}`,
      tone: "bg-[#1a1a1f]",
    } : null,
    thread.linkedProduction ? {
      field: "production",
      label: `${thread.linkedProduction.jobCode ?? ""} ${thread.linkedProduction.clientName ?? thread.linkedProduction.title ?? ""}`.trim(),
      meta: "Production",
      href: `/productions?production=${thread.linkedProduction.id}`,
      tone: "bg-emerald-700",
    } : null,
  ].filter((item): item is { field: string; label: string; meta: string; href: string; tone: string } => Boolean(item));
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.field} className={`group inline-flex min-h-7 items-center gap-1 rounded px-2 text-[10px] text-white ${item.tone}`}>
          <button onClick={() => { window.location.href = item.href; }} className="min-h-7 truncate text-left">→ {item.label} <span className="text-white/65">{item.meta}</span></button>
          <button
            onClick={async () => {
              await api.patch(`/api/email/threads/${thread.id}/unlink`, { field: item.field });
              onLinked();
            }}
            className="hidden min-h-6 min-w-6 place-items-center rounded text-white/70 hover:bg-white/10 group-hover:grid"
          >
            <X size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

function LinkDropdown({ thread, onClose, onLinked }: { thread: EmailThread; onClose: () => void; onLinked: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkTargetsResponse>({});
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<LinkTargetsResponse>(`/api/email/threads/search-link-targets?q=${encodeURIComponent(query)}&type=all`).then(setResults).catch(console.error);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function link(body: { opportunityId?: string; productionId?: string; contactId?: string }) {
    await api.patch(`/api/email/threads/${thread.id}/link`, body);
    onLinked();
    onClose();
  }

  return (
    <div className="absolute right-3 top-24 z-30 w-[330px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center">
        <p className="text-xs font-medium text-gray-900">Link to...</p>
        <button onClick={onClose} className="ml-auto grid min-h-8 min-w-8 place-items-center text-gray-400"><X size={14} /></button>
      </div>
      {(thread.linkedOpportunity || thread.linkedProduction || thread.linkedContact) && (
        <button
          onClick={async () => { await api.patch(`/api/email/threads/${thread.id}/unlink`, { field: "all" }); onLinked(); onClose(); }}
          className="mb-2 min-h-8 w-full rounded bg-red-50 px-2 text-left text-xs text-red-600"
        >
          Unlink current records
        </button>
      )}
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search opportunities, productions, contacts..." className="mb-3 min-h-10 w-full rounded-lg border border-gray-200 px-3 text-xs outline-none" />
      <LinkSection title="Opportunities">
        {(results.opportunities ?? []).map((item) => (
          <button key={item.id} onClick={() => link({ opportunityId: item.id })} className="min-h-9 w-full rounded px-2 text-left text-xs hover:bg-gray-50">→ {item.title || item.clientName} <span className="text-gray-400">{item.brand}</span></button>
        ))}
      </LinkSection>
      <LinkSection title="Productions">
        {(results.productions ?? []).map((item) => (
          <button key={item.id} onClick={() => link({ productionId: item.id })} className="min-h-9 w-full rounded px-2 text-left text-xs hover:bg-gray-50">→ {item.jobCode ?? "No code"} {item.clientName ?? item.title}</button>
        ))}
      </LinkSection>
      <LinkSection title="Contacts">
        {(results.contacts ?? []).map((item) => (
          <button key={item.id} onClick={() => link({ contactId: item.id })} className="min-h-9 w-full rounded px-2 text-left text-xs hover:bg-gray-50">→ {contactName(item)} <span className="text-gray-400">{item.email}</span></button>
        ))}
      </LinkSection>
    </div>
  );
}

function LinkSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{title}</p>
      <div>{children}</div>
    </div>
  );
}

function CrmSuggestionBanner({ thread, onLinked }: { thread: EmailThread; onLinked: () => void }) {
  const [person, setPerson] = useState<ThreadPerson | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`email-crm-suggestion-${thread.id}`) === "1");
  useEffect(() => {
    setDismissed(localStorage.getItem(`email-crm-suggestion-${thread.id}`) === "1");
    if (thread.linkedContactId || thread.linkedOpportunityId || thread.linkedProductionId) {
      setPerson(null);
      return;
    }
    api.get<{ people: ThreadPerson[] }>(`/api/email/threads/${thread.id}/people`)
      .then((data) => setPerson(data.people.find((item) => item.existingContact && !item.isMe) ?? null))
      .catch(() => setPerson(null));
  }, [thread.id, thread.linkedContactId, thread.linkedOpportunityId, thread.linkedProductionId]);
  if (!person || dismissed || !person.existingContact) return null;
  return (
    <div className="flex min-h-10 items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 text-xs text-blue-900">
      <span className="min-w-0 flex-1 truncate">{person.name} is a contact — link this thread?</span>
      <button
        onClick={async () => {
          await api.post(`/api/email/threads/${thread.id}/people/link-contact`, { contactId: person.existingContact?.id });
          onLinked();
        }}
        className="min-h-8 underline"
      >
        Link to contact
      </button>
      <button
        onClick={() => {
          localStorage.setItem(`email-crm-suggestion-${thread.id}`, "1");
          setDismissed(true);
        }}
        className="min-h-8 underline"
      >
        Dismiss
      </button>
    </div>
  );
}

function PeoplePanel({ thread, accountEmail, onClose, onChanged }: { thread: EmailThread; accountEmail?: string; onClose: () => void; onChanged: () => void }) {
  const [people, setPeople] = useState<ThreadPerson[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", company: "", type: "CLIENT" });

  function load() {
    api.get<{ people: ThreadPerson[] }>(`/api/email/threads/${thread.id}/people`).then((data) => setPeople(data.people)).catch(console.error);
  }

  useEffect(load, [thread.id]);

  function startCreate(person: ThreadPerson) {
    const parts = person.name.split(" ");
    setCreating(person.email);
    setForm({
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" "),
      company: person.inferredCompany,
      type: "CLIENT",
    });
  }

  async function createContact(person: ThreadPerson) {
    await api.post(`/api/email/threads/${thread.id}/people/create-contact`, {
      email: person.email,
      firstName: form.firstName,
      lastName: form.lastName,
      company: form.company,
      type: form.type,
      linkToThread: true,
    });
    setCreating(null);
    load();
    onChanged();
  }

  async function linkContact(contactId: string) {
    await api.post(`/api/email/threads/${thread.id}/people/link-contact`, { contactId });
    load();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/20">
      <div className="h-full w-full overflow-auto bg-white shadow-xl md:w-[380px]">
        <header className="sticky top-0 z-10 flex min-h-14 items-center border-b border-gray-100 bg-white px-4">
          <div>
            <h2 className="text-sm font-medium text-gray-900">People</h2>
            <p className="text-[11px] text-gray-400">{people.length || "Loading"} addresses in this thread</p>
          </div>
          <button onClick={onClose} className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-500"><X size={17} /></button>
        </header>
        <div className="divide-y divide-gray-100 p-2">
          {people.map((person) => {
            const isMe = person.isMe || person.email === accountEmail?.toLowerCase();
            return (
              <div key={person.email} className="rounded-lg px-2 py-2 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-medium text-white" style={{ background: getEmailColor(person.email) }}>{initials(person.name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-gray-900">{person.name}</p>
                    <p className="truncate text-[11px] text-gray-500">{person.email}</p>
                    <p className="truncate text-[10px] uppercase tracking-[0.08em] text-gray-400">{person.roles.join(" · ")} · {person.existingContact?.company?.name ?? person.inferredCompany}</p>
                  </div>
                  {isMe ? (
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] text-gray-500">You</span>
                  ) : person.existingContact ? (
                    <button onClick={() => linkContact(person.existingContact!.id)} className="min-h-7 rounded-full bg-emerald-50 px-2 text-[10px] text-emerald-700">
                      {person.isLinkedToThread ? "Linked ✓" : "Contact"}
                    </button>
                  ) : (
                    <button onClick={() => startCreate(person)} className="min-h-7 rounded-full bg-blue-50 px-2 text-[10px] text-blue-700">+ Create</button>
                  )}
                </div>
                {creating === person.email && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} placeholder="First name" className="min-h-10 rounded border border-gray-200 px-2 text-xs" />
                      <input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} placeholder="Last name" className="min-h-10 rounded border border-gray-200 px-2 text-xs" />
                    </div>
                    <input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Company" className="mt-2 min-h-10 w-full rounded border border-gray-200 px-2 text-xs" />
                    <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="mt-2 min-h-10 w-full rounded border border-gray-200 px-2 text-xs">
                      <option value="CLIENT">Client</option>
                      <option value="SUPPLIER">Supplier</option>
                    </select>
                    <p className="mt-2 truncate text-[11px] text-gray-400">{person.email}</p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setCreating(null)} className="min-h-9 px-2 text-xs text-gray-500">Cancel</button>
                      <button onClick={() => createContact(person)} disabled={!form.firstName} className="min-h-9 rounded bg-gray-900 px-3 text-xs text-white disabled:opacity-40">Create contact →</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CreateOpportunityDrawer({ thread, onClose, onCreated }: { thread: EmailThread; onClose: () => void; onCreated: (opportunityId: string) => void }) {
  const [prefill, setPrefill] = useState<OpportunityPrefill | null>(null);
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    company: "",
    brand: "",
    jobType: "STILLS",
    estimatedValue: "",
    followUpDate: "",
    description: "",
    createContact: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.post<{ prefill: OpportunityPrefill }>(`/api/email/threads/${thread.id}/create-opportunity`, {})
      .then((data) => {
        setPrefill(data.prefill);
        setForm((current) => ({
          ...current,
          title: data.prefill.title,
          clientName: data.prefill.clientName,
          company: data.prefill.company,
          description: data.prefill.description,
          createContact: !data.prefill.contactId,
        }));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to prepare opportunity"));
  }, [thread.id]);

  async function create() {
    if (!prefill) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.post<{ opportunity: { id: string } }>(`/api/email/threads/${thread.id}/confirm-opportunity`, {
        ...form,
        contactId: prefill.contactId ?? undefined,
        contactEmail: prefill.contactEmail,
        contactName: prefill.contactName,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
      });
      onCreated(result.opportunity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/20">
      <div className="h-full w-full overflow-auto bg-white shadow-xl md:w-[400px]">
        <header className="sticky top-0 z-10 flex min-h-14 items-center border-b border-gray-100 bg-white px-4">
          <h2 className="text-sm font-medium text-gray-900">Create opportunity from email</h2>
          <button onClick={onClose} className="ml-auto grid min-h-11 min-w-11 place-items-center text-gray-500"><X size={17} /></button>
        </header>
        <div className="space-y-3 p-4">
          {!prefill && !error && <p className="text-sm text-gray-400">Preparing email details...</p>}
          <DrawerField label="Title"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></DrawerField>
          <DrawerField label="Client"><input value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} /></DrawerField>
          <DrawerField label="Company"><input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></DrawerField>
          <DrawerField label="Brand"><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></DrawerField>
          <DrawerField label="Job type">
            <select value={form.jobType} onChange={(event) => setForm({ ...form, jobType: event.target.value })}>
              <option value="STILLS">Stills</option>
              <option value="MOTION">Motion</option>
              <option value="EVENTS">Events</option>
            </select>
          </DrawerField>
          <DrawerField label="Est. value"><input value={form.estimatedValue} onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })} type="number" /></DrawerField>
          <DrawerField label="Follow-up"><input value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} type="date" /></DrawerField>
          <label className="block text-xs text-gray-500">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} className="mt-1 min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm text-gray-900" /></label>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p className="font-medium text-gray-900">Contact</p>
            <p className="mt-1">{prefill?.contactEmail || "No sender email"}</p>
            {!prefill?.contactId && (
              <label className="mt-2 flex min-h-8 items-center gap-2">
                <input type="checkbox" checked={form.createContact} onChange={(event) => setForm({ ...form, createContact: event.target.checked })} />
                Create contact from this sender
              </label>
            )}
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            Linked thread ✓<br /><span className="text-gray-900">{thread.subject}</span>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="min-h-11 px-3 text-sm text-gray-500">Cancel</button>
            <button onClick={create} disabled={saving || !prefill || !form.title || !form.clientName} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">{saving ? "Creating..." : "Create opportunity →"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-gray-500">
      {label}
      <div className="mt-1 [&_input]:min-h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-gray-200 [&_input]:px-3 [&_input]:text-sm [&_select]:min-h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-gray-200 [&_select]:px-3 [&_select]:text-sm">
        {children}
      </div>
    </label>
  );
}

function AttachmentChip({ attachment, filing, onOpen }: { attachment: EmailAttachmentSummary; filing: boolean; onOpen: (attachment: EmailAttachmentSummary) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(attachment)}
      disabled={filing}
      className="inline-flex min-h-8 items-center gap-1 rounded bg-[#f0f0ee] px-2 text-left text-xs text-gray-700 hover:bg-gray-200 disabled:opacity-60"
      title={attachment.jobFileId ? "Open saved attachment preview" : "File attachment to Mail Attachments"}
    >
        <Paperclip size={13} className={fileTone(attachment.mimeType)} />
        <span className="max-w-[160px] truncate">{attachment.filename}</span>
        <span className="text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
        <span className="ml-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-gray-500">
          {filing ? "Filing..." : attachment.jobFileId ? "Filed" : "Mail Attachments"}
        </span>
    </button>
  );
}

function MessageBlock({ message, filingAttachment, onOpenAttachment, defaultExpanded, focused, showNewDivider, onCreateAction, creatingAction }: { message: EmailMessage; filingAttachment: string; onOpenAttachment: (attachment: EmailAttachmentSummary) => void; defaultExpanded: boolean; focused: boolean; showNewDivider: boolean; onCreateAction: () => void; creatingAction: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const articleRef = useRef<HTMLElement | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [senderOriginalPreferred, setSenderOriginalPreferred] = useState(() => senderPrefersOriginalFormatting(message.fromAddress));
  const [showOriginalFormatting, setShowOriginalFormatting] = useState(() => senderPrefersOriginalFormatting(message.fromAddress));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const name = message.resolvedFromName || message.fromName || message.fromAddress;
  const primaryTo = message.isFromMe ? compactAddress(message.toAddresses[0] ?? "recipient") : "me";
  const recipientCount = message.toAddresses.length + message.ccAddresses.length + message.bccAddresses.length;
  const toLabel = `to ${primaryTo}${recipientCount > 1 ? ` +${recipientCount - 1}` : ""}`;
  const previewText = cleanEmailPreview(message.bodyText || "");
  const hasImages = expanded && /<img[\s>]/i.test(message.bodyHtml);
  const renderedBody = useMemo(() => {
    if (!expanded) {
      return { bodyHtml: "", signatureHtml: "", quotedHtml: "", hasQuote: false };
    }
    const htmlQuote = message.bodyHtml ? hideQuotedContent(message.bodyHtml) : null;
    const htmlTextQuote = message.bodyHtml ? trimHtmlTextQuoteHeaders(htmlQuote?.visible ?? message.bodyHtml) : null;
    const htmlVisible = htmlTextQuote?.visible ?? htmlQuote?.visible ?? message.bodyHtml;
    const htmlQuoted = [htmlQuote?.quoted, htmlTextQuote?.quoted].filter(Boolean).join("");
    const htmlHasQuote = Boolean(htmlQuote?.hasQuote || htmlTextQuote?.hasQuote);
    const plainQuote = message.bodyHtml ? null : splitPlainTextQuote(stripPlainTextNoise(message.bodyText || ""));
    const plainSignature = plainQuote ? splitPlainTextSignature(plainQuote.visible) : null;
    const bodyHtml = message.bodyHtml
      ? showOriginalFormatting
        ? sanitizeOriginalEmailHtml(htmlVisible, showImages)
        : sanitizeEmailHtml(htmlVisible, showImages)
      : DOMPurify.sanitize(`<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(plainSignature?.body ?? "")}</pre>`);
    const signatureHtml = message.bodyHtml
      ? ""
      : plainSignature?.signature ? DOMPurify.sanitize(`<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(plainSignature.signature)}</pre>`) : "";
    const quotedHtml = message.bodyHtml
      ? sanitizeEmailHtml(htmlQuoted, showImages)
      : plainQuote?.quoted ? DOMPurify.sanitize(`<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(plainQuote.quoted)}</pre>`) : "";
    return {
      bodyHtml,
      signatureHtml,
      quotedHtml,
      hasQuote: Boolean((htmlHasQuote && quotedHtml) || plainQuote?.hasQuote),
    };
  }, [expanded, message.bodyHtml, message.bodyText, showImages, showOriginalFormatting]);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, message.id]);

  useEffect(() => {
    const preferred = senderPrefersOriginalFormatting(message.fromAddress);
    setSenderOriginalPreferred(preferred);
    setShowOriginalFormatting(preferred);
  }, [message.fromAddress, message.id]);

  useEffect(() => {
    if (!focused) return;
    const timer = window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focused]);

  function updateSenderFormatPreference(enabled: boolean) {
    setSenderOriginalFormattingPreference(message.fromAddress, enabled);
    setSenderOriginalPreferred(enabled);
    setShowOriginalFormatting(enabled);
  }

  return (
    <>
      {showNewDivider && (
        <div className="my-3 flex items-center gap-3 text-[11px] text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          New messages
          <span className="h-px flex-1 bg-gray-200" />
        </div>
      )}
      <article ref={articleRef} className={`group mb-2.5 overflow-visible bg-white transition-all ${expanded ? "rounded-[18px] border border-gray-200 shadow-[0_8px_22px_rgba(15,23,42,0.065),0_1px_2px_rgba(15,23,42,0.045)]" : "rounded-[14px] border border-gray-200/80 shadow-[0_2px_8px_rgba(15,23,42,0.04),0_1px_2px_rgba(15,23,42,0.03)] hover:shadow-[0_5px_14px_rgba(15,23,42,0.055)]"} ${focused ? "relative z-[1] ring-2 ring-blue-200" : ""}`}>
        <button
          onClick={() => setExpanded((current) => !current)}
          className={`grid w-full grid-cols-[32px_1fr_auto_auto] items-center gap-2.5 text-left transition-all duration-200 ${expanded ? "px-4 pt-3" : "min-h-[48px] px-3.5"}`}
        >
          <span
            onClick={(event) => { event.stopPropagation(); setDetailsOpen((current) => !current); }}
            className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-medium text-white shadow-sm"
            style={{ background: message.avatarColor ?? "#5B8DEF" }}
            title="Show sender details"
          >
            {initials(name)}
          </span>
          <span className={`min-w-0 ${expanded ? "pb-1.5" : ""}`}>
            <span className="flex min-w-0 items-baseline gap-2">
              <span
                onClick={(event) => { event.stopPropagation(); setDetailsOpen((current) => !current); }}
                className={`truncate font-semibold text-gray-950 ${expanded ? "text-[13px]" : "text-[13px]"}`}
                title={message.fromAddress}
              >
                {name}
              </span>
              {expanded ? (
                <span
                  onClick={(event) => { event.stopPropagation(); setDetailsOpen((current) => !current); }}
                  className="min-w-0 truncate text-xs text-blue-600"
                >
                  {toLabel}
                </span>
              ) : (
                <span className="min-w-0 truncate text-[13px] leading-5 text-gray-800">{previewText.slice(0, 190)}</span>
              )}
            </span>
          </span>
          <span className={`whitespace-nowrap text-xs text-gray-500 ${expanded ? "self-start pt-0.5" : ""}`}>{fullTimeLabel(message.sentAt)}</span>
          <span className={`flex items-center gap-1 ${expanded ? "self-start" : ""}`}>
            {expanded && <span className="hidden rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-500 md:inline-flex">Shared</span>}
            <span
              onClick={(event) => { event.stopPropagation(); onCreateAction(); }}
              className="hidden items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-gray-500 shadow-sm ring-1 ring-gray-200 hover:text-gray-900 group-hover:inline-flex"
              title="Create timeline task from this email"
            >
              <MessageSquare size={11} /> {creatingAction ? "Saving..." : "Task"}
            </span>
            <MoreHorizontal size={15} className="hidden text-gray-400 group-hover:block" />
            {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
          </span>
        </button>
        {detailsOpen && (
          <div className="mx-4 mb-2 ml-16 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-500 shadow-lg">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-medium text-white" style={{ background: message.avatarColor ?? "#5B8DEF" }}>{initials(name)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-gray-900">{name}</span>
                <a href={`mailto:${message.fromAddress}`} className="block truncate text-[11px] text-blue-600">{message.fromAddress}</a>
              </span>
            </div>
            <div className="space-y-1 border-t border-gray-100 pt-2">
              {message.toAddresses.length > 0 && <p className="truncate"><span className="mr-2 text-gray-400">to</span>{addressLine(message.toAddresses)}</p>}
              {message.ccAddresses.length > 0 && <p className="truncate"><span className="mr-2 text-gray-400">cc</span>{addressLine(message.ccAddresses)}</p>}
              {message.bccAddresses.length > 0 && <p className="truncate"><span className="mr-2 text-gray-400">bcc</span>{addressLine(message.bccAddresses)}</p>}
            </div>
          </div>
        )}
        {expanded && (
          <div className="px-4 pb-4">
            <div className="ml-10 max-w-[1040px]">
            <div className="mb-3 flex flex-wrap gap-2">
              {hasImages && !showImages && <button onClick={() => setShowImages(true)} className="min-h-8 rounded-full bg-gray-100 px-3 text-xs text-gray-700">Show images</button>}
              {message.bodyHtml && (
                <>
                  <button
                    onClick={() => setShowOriginalFormatting((current) => !current)}
                    className={`min-h-8 rounded-full px-3 text-xs ${showOriginalFormatting ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    {showOriginalFormatting ? "Using original formatting" : "Original formatting"}
                  </button>
                  <button
                    onClick={() => updateSenderFormatPreference(!senderOriginalPreferred)}
                    title={senderOriginalPreferred ? "Stop defaulting this sender to original formatting" : "Always open this sender in original formatting"}
                    className={`min-h-8 rounded-full px-3 text-xs ${senderOriginalPreferred ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {senderOriginalPreferred ? "Sender defaults original" : "Always for sender"}
                  </button>
                </>
              )}
            </div>
            <div
              className="prose prose-sm max-w-none text-[14px] leading-6 text-gray-950 prose-p:my-2.5 prose-a:text-blue-600 prose-blockquote:border-l-gray-200 prose-blockquote:text-gray-500 [&_*]:max-w-full [&_table]:w-auto [&_table]:max-w-full [&_td]:align-top"
              dangerouslySetInnerHTML={{ __html: renderedBody.bodyHtml }}
            />
            {renderedBody.signatureHtml && (
              <div className="prose prose-sm mt-3 max-w-none text-xs italic text-gray-400" dangerouslySetInnerHTML={{ __html: renderedBody.signatureHtml }} />
            )}
            {renderedBody.hasQuote && !showQuoted && (
              <button onClick={() => setShowQuoted(true)} className="mt-3 min-h-7 rounded-full bg-[#f0f0ee] px-3 text-[11px] text-gray-500 hover:bg-gray-200">Show previous message</button>
            )}
            {renderedBody.hasQuote && showQuoted && (
              <div className="mt-3 border-l-2 border-gray-200 pl-3 text-xs text-gray-500" dangerouslySetInnerHTML={{ __html: renderedBody.quotedHtml }} />
            )}
            {message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {message.attachments.map((attachment, index) => (
                  <AttachmentChip
                    key={`${attachment.filename}-${index}`}
                    filing={filingAttachment === `${message.id}-${index}`}
                    onOpen={onOpenAttachment}
                    attachment={{
                      messageId: message.id,
                      attachmentIndex: index,
                      filename: attachment.filename,
                      mimeType: attachment.mimeType,
                      sizeBytes: attachment.sizeBytes,
                      isInline: attachment.isInline,
                      jobFileId: attachment.jobFileId,
                      jobFile: attachment.jobFile,
                    }}
                  />
                ))}
              </div>
            )}
            </div>
          </div>
        )}
      </article>
    </>
  );
}

function SaveAttachmentModal({ attachment, productionId: initialProductionId, onClose, onSaved }: { attachment: EmailAttachmentSummary; productionId?: string; onClose: () => void; onSaved: (file: JobFile) => void }) {
  const [productions, setProductions] = useState<Production[]>([]);
  const [productionId, setProductionId] = useState(initialProductionId ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Production[]>("/api/productions?includeWrapped=true")
      .then((items) => {
        setProductions(items);
        setProductionId((current) => current || items[0]?.id || "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load productions"));
  }, []);

  async function save() {
    if (!productionId) return;
    setSaving(true);
    setError("");
    try {
      const file = await api.post<JobFile>(`/api/email/messages/${attachment.messageId}/attachment/${attachment.attachmentIndex}/save-to-job`, {
        productionId,
        notes: notes.trim() || undefined,
      });
      onSaved(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attachment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/25 md:items-center md:justify-center">
      <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl md:max-w-md md:rounded-2xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100"><Paperclip size={17} className={fileTone(attachment.mimeType)} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-gray-900">File mail attachment</h2>
            <p className="truncate text-xs text-gray-500">{attachment.filename} · {formatBytes(attachment.sizeBytes)}</p>
          </div>
          <button onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-gray-500"><X size={17} /></button>
        </div>
        <label className="mb-3 block text-xs text-gray-500">
          Production
          <select value={productionId} onChange={(event) => setProductionId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900">
            {productions.map((production) => (
              <option key={production.id} value={production.id}>{production.jobCode ?? "No code"} · {production.clientName ?? production.title}</option>
            ))}
          </select>
        </label>
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          Folder: <span className="font-medium text-gray-800">Mail Attachments</span>
        </div>
        <label className="mb-3 block text-xs text-gray-500">
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 p-3 text-sm text-gray-900" />
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="min-h-11 px-3 text-sm text-gray-500">Cancel</button>
          <button onClick={save} disabled={saving || !productionId} className="min-h-11 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">{saving ? "Filing..." : "File attachment"}</button>
        </div>
      </div>
    </div>
  );
}
