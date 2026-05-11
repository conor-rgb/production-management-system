import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { EmailAccount } from "../lib/types";
import { ComposerTray } from "../components/email/ComposerTray";

export interface Draft {
  id: string;
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
  linkedOpportunity?: { id: string; title?: string; clientName?: string | null; brand?: string | null } | null;
  linkedProduction?: { id: string; title?: string; jobCode?: string | null; clientName?: string | null; brand?: string | null } | null;
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
}

interface DraftStore {
  drafts: Draft[];
  openDraft: (options?: Partial<Draft>) => Promise<Draft>;
  openReply: (thread: ReplyThreadInput) => Promise<Draft>;
  updateDraft: (id: string, changes: Partial<Draft>) => void;
  minimizeDraft: (id: string) => void;
  maximizeDraft: (id: string) => void;
  closeDraft: (id: string) => void;
  sendDraft: (id: string) => Promise<void>;
  isSending: Record<string, boolean>;
  error: string;
  clearError: () => void;
}

const DraftContext = createContext<DraftStore | null>(null);
const MAX_DRAFTS = 3;

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
  const [isSending, setIsSending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const saveTimers = useRef<Record<string, number>>({});

  useEffect(() => {
    if (window.location.pathname === "/login") return undefined;
    api.get<Draft[]>("/api/email/drafts")
      .then(setDrafts)
      .catch((err: unknown) => {
        if (err instanceof Error && err.message === "Unauthorised") return;
        setError(err instanceof Error ? err.message : "Failed to load drafts");
      });
    return () => {
      Object.values(saveTimers.current).forEach(window.clearTimeout);
    };
  }, []);

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
    api.patch<Draft>(`/api/email/drafts/${id}`, { isMinimized: false }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to restore draft");
    });
  }, []);

  const minimizeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, isMinimized: true } : draft));
    api.patch<Draft>(`/api/email/drafts/${id}`, { isMinimized: true }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to minimize draft");
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
    return openDraft({
      to,
      subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      replyToThreadId: thread.id,
      gmailThreadId: thread.gmailThreadId,
      inReplyToMsgId: thread.lastMessageMsgId,
      references: thread.references ?? thread.lastMessageMsgId,
      linkedOpportunityId: thread.linkedOpportunityId,
      linkedProductionId: thread.linkedProductionId,
    });
  }, [drafts, maximizeDraft, openDraft]);

  const closeDraft = useCallback((id: string) => {
    if (saveTimers.current[id]) {
      window.clearTimeout(saveTimers.current[id]);
      delete saveTimers.current[id];
    }
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    api.delete(`/api/email/drafts/${id}`).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to discard draft");
    });
  }, []);

  const sendDraft = useCallback(async (id: string) => {
    if (saveTimers.current[id]) {
      window.clearTimeout(saveTimers.current[id]);
      delete saveTimers.current[id];
    }
    setIsSending((prev) => ({ ...prev, [id]: true }));
    try {
      await api.post(`/api/email/drafts/${id}/send`, {});
      setDrafts((prev) => prev.filter((draft) => draft.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send draft");
      throw err;
    } finally {
      setIsSending((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  const value = useMemo<DraftStore>(() => ({
    drafts,
    openDraft,
    openReply,
    updateDraft,
    minimizeDraft,
    maximizeDraft,
    closeDraft,
    sendDraft,
    isSending,
    error,
    clearError: () => setError(""),
  }), [drafts, openDraft, openReply, updateDraft, minimizeDraft, maximizeDraft, closeDraft, sendDraft, isSending, error]);

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
