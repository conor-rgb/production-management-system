import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { EmailAccount, EmailMessage } from "../lib/types";
import { ComposerTray } from "../components/email/ComposerTray";

export interface Draft {
  id: string;
  gmailDraftId?: string | null;
  gmailDraftMessageId?: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  replyToThreadId?: string | null;
  gmailThreadId?: string | null;
  inReplyToMsgId?: string | null;
  references?: string | null;
  linkedOpportunityId?: string | null;
  linkedProductionId?: string | null;
  linkedContactId?: string | null;
  isMinimized: boolean;
  lastEditedAt: string;
  lastSyncedToGmailAt?: string | null;
  attachments?: DraftAttachment[];
  linkedOpportunity?: { id: string; title?: string; clientName?: string | null; brand?: string | null } | null;
  linkedProduction?: { id: string; title?: string; jobCode?: string | null; clientName?: string | null; brand?: string | null } | null;
}

export interface DraftAttachment {
  id: string;
  draftId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ReplyThreadInput {
  id: string;
  gmailThreadId?: string | null;
  subject: string;
  participants: string[];
  accountEmail?: string | null;
  lastMessageMsgId?: string | null;
  references?: string | null;
  linkedOpportunityId?: string | null;
  linkedProductionId?: string | null;
  messages?: EmailMessage[];
}

interface DraftStore {
  drafts: Draft[];
  expandedDraftId: string | null;
  quotedHtmlByDraftId: Record<string, string>;
  refreshDrafts: () => Promise<void>;
  openDraft: (options?: Partial<Draft>) => Promise<Draft>;
  openReply: (thread: ReplyThreadInput) => Promise<Draft>;
  updateDraft: (id: string, changes: Partial<Draft>) => void;
  minimizeDraft: (id: string) => void;
  maximizeDraft: (id: string) => void;
  toggleExpand: (id: string) => void;
  closeDraft: (id: string) => void;
  uploadAttachments: (id: string, files: FileList | File[]) => Promise<void>;
  deleteAttachment: (draftId: string, attachmentId: string) => Promise<void>;
  sendDraft: (id: string) => Promise<void>;
  isSending: Record<string, boolean>;
  error: string;
  clearError: () => void;
}

const DraftContext = createContext<DraftStore | null>(null);
const MAX_DRAFTS = 3;

function escapeHtml(value: string) {
  return value.replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" }[char] ?? char));
}

function buildQuotedHtml(messages: EmailMessage[] = []) {
  return messages
    .slice()
    .reverse()
    .map((message) => {
      const date = new Date(message.sentAt);
      const label = date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      const from = escapeHtml(message.fromName || message.fromAddress || "sender");
      const body = message.bodyHtml || escapeHtml(message.bodyText || "");
      return `<div style="border-left:3px solid #e5e5e5;padding-left:12px;margin:10px 0;color:#666;"><div style="font-size:11px;color:#888;margin-bottom:4px;">On ${label}, ${from} wrote:</div><div>${body}</div></div>`;
    })
    .join("");
}

function payloadFromDraftOptions(options: Partial<Draft>): Partial<Draft> {
  return {
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    bodyHtml: options.bodyHtml,
    replyToThreadId: options.replyToThreadId,
    gmailThreadId: options.gmailThreadId,
    inReplyToMsgId: options.inReplyToMsgId,
    references: options.references,
    linkedOpportunityId: options.linkedOpportunityId,
    linkedProductionId: options.linkedProductionId,
    linkedContactId: options.linkedContactId,
    isMinimized: options.isMinimized,
  };
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [quotedHtmlByDraftId, setQuotedHtmlByDraftId] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const saveTimers = useRef<Record<string, number>>({});
  const sendingIds = useRef<Set<string>>(new Set());

  const refreshDrafts = useCallback(async () => {
    const items = await api.get<Draft[]>("/api/email/drafts");
    setDrafts(items);
    setExpandedDraftId((current) => current ?? items.find((draft) => !draft.isMinimized)?.id ?? null);
  }, []);

  useEffect(() => {
    if (window.location.pathname === "/login") return undefined;
    refreshDrafts()
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "Unauthorised") return;
        setError(err instanceof Error ? err.message : "Failed to load drafts");
      });
    return () => {
      Object.values(saveTimers.current).forEach(window.clearTimeout);
    };
  }, [refreshDrafts]);

  const updateDraft = useCallback((id: string, changes: Partial<Draft>) => {
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, ...changes } : draft));
    if (saveTimers.current[id]) window.clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = window.setTimeout(() => {
      api.patch<Draft>(`/api/email/drafts/${id}`, payloadFromDraftOptions(changes))
        .then((saved) => setDrafts((prev) => prev.map((draft) => draft.id === id ? saved : draft)))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to save draft"));
    }, 1000);
  }, []);

  const maximizeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, isMinimized: false } : draft));
    setExpandedDraftId(id);
    api.patch<Draft>(`/api/email/drafts/${id}`, { isMinimized: false }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to restore draft");
    });
  }, []);

  const minimizeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, isMinimized: true } : draft));
    setExpandedDraftId((current) => current === id ? null : current);
    api.patch<Draft>(`/api/email/drafts/${id}`, { isMinimized: true }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to minimize draft");
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedDraftId((current) => current === id ? null : id);
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, isMinimized: false } : draft));
    api.patch<Draft>(`/api/email/drafts/${id}`, { isMinimized: false }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to restore draft");
    });
  }, []);

  const openDraft = useCallback(async (options: Partial<Draft> = {}) => {
    if (drafts.length >= MAX_DRAFTS) {
      const message = "Close a draft before opening another";
      setError(message);
      throw new Error(message);
    }
    try {
      const draft = await api.post<Draft>("/api/email/drafts", payloadFromDraftOptions({ ...options, isMinimized: false }));
      setDrafts((prev) => [draft, ...prev]);
      setExpandedDraftId(draft.id);
      return draft;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create draft");
      throw err;
    }
  }, [drafts.length]);

  const openReply = useCallback(async (thread: ReplyThreadInput) => {
    const existing = drafts.find((draft) => draft.replyToThreadId === thread.id);
    if (existing) {
      maximizeDraft(existing.id);
      return existing;
    }

    let accountEmail = thread.accountEmail?.toLowerCase() ?? "";
    if (!accountEmail) {
      try {
        const accounts = await api.get<EmailAccount[]>("/api/email/accounts");
        accountEmail = accounts.find((account) => account.isPrimary)?.emailAddress.toLowerCase() ?? "";
      } catch {
        accountEmail = "";
      }
    }

    const to = Array.from(new Set(thread.participants.map((email) => email.toLowerCase()).filter((email) => email && email !== accountEmail)));
    const draft = await openDraft({
      to,
      subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      replyToThreadId: thread.id,
      gmailThreadId: thread.gmailThreadId,
      inReplyToMsgId: thread.lastMessageMsgId,
      references: thread.references ?? thread.lastMessageMsgId,
      linkedOpportunityId: thread.linkedOpportunityId,
      linkedProductionId: thread.linkedProductionId,
    });
    if (thread.messages?.length) {
      setQuotedHtmlByDraftId((prev) => ({ ...prev, [draft.id]: buildQuotedHtml(thread.messages) }));
    }
    return draft;
  }, [drafts, maximizeDraft, openDraft]);

  const closeDraft = useCallback((id: string) => {
    if (saveTimers.current[id]) {
      window.clearTimeout(saveTimers.current[id]);
      delete saveTimers.current[id];
    }
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    setExpandedDraftId((current) => current === id ? null : current);
    setQuotedHtmlByDraftId((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    api.delete(`/api/email/drafts/${id}`).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to discard draft");
    });
  }, []);

  const uploadAttachments = useCallback(async (id: string, files: FileList | File[]) => {
    const items = Array.from(files);
    if (!items.length) return;
    const formData = new FormData();
    items.forEach((file) => formData.append("files", file));
    try {
      const response = await fetch(`/api/email/drafts/${id}/attachments`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Upload failed: ${response.status}`);
      }
      const saved = await response.json() as Draft;
      setDrafts((prev) => prev.map((draft) => draft.id === id ? saved : draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload attachment");
      throw err;
    }
  }, []);

  const deleteAttachment = useCallback(async (draftId: string, attachmentId: string) => {
    try {
      const response = await fetch(`/api/email/drafts/${draftId}/attachments/${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Delete failed: ${response.status}`);
      }
      const saved = await response.json() as Draft;
      setDrafts((prev) => prev.map((draft) => draft.id === draftId ? saved : draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove attachment");
      throw err;
    }
  }, []);

  const sendDraft = useCallback(async (id: string) => {
    if (sendingIds.current.has(id)) return;
    sendingIds.current.add(id);
    if (saveTimers.current[id]) {
      window.clearTimeout(saveTimers.current[id]);
      delete saveTimers.current[id];
    }
    setIsSending((prev) => ({ ...prev, [id]: true }));
    try {
      const draft = drafts.find((item) => item.id === id);
      const quotedHtml = quotedHtmlByDraftId[id];
      if (draft && quotedHtml) {
        await api.patch<Draft>(`/api/email/drafts/${id}`, {
          bodyHtml: `${draft.bodyHtml}<br><div class="email-quoted-history">${quotedHtml}</div>`,
        });
      }
      await api.post(`/api/email/drafts/${id}/send`, {});
      setDrafts((prev) => prev.filter((draft) => draft.id !== id));
      setExpandedDraftId((current) => current === id ? null : current);
      setQuotedHtmlByDraftId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send draft");
      throw err;
    } finally {
      sendingIds.current.delete(id);
      setIsSending((prev) => ({ ...prev, [id]: false }));
    }
  }, [drafts, quotedHtmlByDraftId]);

  const value = useMemo<DraftStore>(() => ({
    drafts,
    expandedDraftId,
    quotedHtmlByDraftId,
    refreshDrafts,
    openDraft,
    openReply,
    updateDraft,
    minimizeDraft,
    maximizeDraft,
    toggleExpand,
    closeDraft,
    uploadAttachments,
    deleteAttachment,
    sendDraft,
    isSending,
    error,
    clearError: () => setError(""),
  }), [drafts, expandedDraftId, quotedHtmlByDraftId, refreshDrafts, openDraft, openReply, updateDraft, minimizeDraft, maximizeDraft, toggleExpand, closeDraft, uploadAttachments, deleteAttachment, sendDraft, isSending, error]);

  return (
    <DraftContext.Provider value={value}>
      {children}
      <ComposerTray />
    </DraftContext.Provider>
  );
}

export function useDrafts() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error("useDrafts must be used within DraftProvider");
  return ctx;
}
