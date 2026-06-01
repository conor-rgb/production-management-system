import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Bell, Maximize2, Minimize2, Paperclip, Send, Type, X } from "lucide-react";
import { api } from "../../lib/api";
import type { EmailAccount } from "../../lib/types";
import { useDrafts, type Draft } from "../../store/draftStore";

type ContactSuggestion = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  company?: { id: string; name: string } | null;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function titleForDraft(draft: Draft) {
  const base = draft.subject.trim() || (draft.replyToThreadId ? "Reply" : "New message");
  if (draft.replyToThreadId && !base.toLowerCase().startsWith("re:")) return `Re: ${base}`;
  return base;
}

function draftSavedLabel(draft: Draft) {
  const value = draft.lastSyncedToGmailAt ?? draft.lastEditedAt;
  if (!value) return draft.gmailDraftId ? "Synced to Gmail" : "Local draft";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return draft.gmailDraftId ? "Synced to Gmail" : "Local draft";
  return `${draft.gmailDraftId ? "Gmail draft" : "Saved"} · ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function iconButtonClass(disabled = false) {
  return `grid min-h-7 min-w-7 place-items-center rounded ${disabled ? "cursor-not-allowed text-gray-300" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`;
}

function RecipientInput({ value, onChange, placeholder }: { value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (inputValue.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    timerRef.current = window.setTimeout(() => {
      api.get<ContactSuggestion[]>(`/api/contacts?search=${encodeURIComponent(inputValue.trim())}&limit=6`)
        .then((items) => {
          setSuggestions(items.filter((item) => item.email));
          setActiveIndex(0);
        })
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [inputValue]);

  function addRecipient(raw: string) {
    const email = raw.trim().replace(/,$/, "").toLowerCase();
    if (!isValidEmail(email)) return;
    if (!value.includes(email)) onChange([...value, email]);
    setInputValue("");
    setSuggestions([]);
  }

  function removeRecipient(email: string) {
    onChange(value.filter((item) => item !== email));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Escape") {
      setSuggestions([]);
      return;
    }
    if ((event.key === "Enter" || event.key === ",") && inputValue.trim()) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      addRecipient(suggestion?.email ?? inputValue);
      return;
    }
    if (event.key === "Backspace" && !inputValue && value.length) {
      removeRecipient(value[value.length - 1]);
    }
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1 py-1">
      {value.map((email) => (
        <span key={email} className="inline-flex max-w-[210px] items-center gap-1.5 rounded-full border border-gray-200 bg-[#f8f8f6] py-0.5 pl-1 pr-1.5 text-xs text-gray-900" title={email}>
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gray-900 text-[8px] font-semibold uppercase text-white">
            {email.slice(0, 1)}
          </span>
          <span className="truncate">{email}</span>
          <button type="button" onClick={() => removeRecipient(email)} className="grid h-4 w-4 place-items-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-900">×</button>
        </span>
      ))}
      <div className="relative min-w-[100px] flex-1">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-h-7 w-full border-0 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
        />
        {suggestions.length > 0 && (
          <div className="absolute left-0 top-full z-[700] mt-1 min-w-60 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
            {suggestions.map((contact, index) => {
              const name = `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`.trim();
              return (
                <button
                  key={contact.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addRecipient(contact.email ?? "")}
                  className={`flex min-h-10 w-full items-center gap-2 px-3 text-left ${index === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"}`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-900 text-[10px] font-semibold text-white">{(name || contact.email || "?").slice(0, 1)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-gray-900">{name || contact.email}</span>
                    <span className="block truncate text-[11px] text-gray-400">{contact.email}{contact.company?.name ? ` · ${contact.company.name}` : ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FormatButton({ active, onClick, label, className = "" }: { active?: boolean; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-7 min-w-7 place-items-center rounded text-xs ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"} ${className}`}
    >
      {label}
    </button>
  );
}

function MinimizedTab({ draft, isExpanded, onToggle, onClose }: { draft: Draft; isExpanded: boolean; onToggle: () => void; onClose: (event: MouseEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex h-9 min-w-36 max-w-[220px] items-center gap-1.5 rounded-t-md border border-b-0 px-3 text-left text-xs shadow-sm ${isExpanded ? "border-[#1a1a1f] bg-[#1a1a1f] font-medium text-white" : "border-gray-200 bg-white text-gray-900"}`}
    >
      <span className="min-w-0 flex-1 truncate">{draft.replyToThreadId ? "↩ " : ""}{titleForDraft(draft)}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={onClose}
        className={isExpanded ? "text-white/60 hover:text-white" : "text-gray-400 hover:text-gray-900"}
      >
        ×
      </span>
    </button>
  );
}

function ComposerWindow({ draft, accountEmail }: { draft: Draft; accountEmail: string }) {
  const { updateDraft, minimizeDraft, closeDraft, sendDraft, uploadAttachments, deleteAttachment, isSending, quotedHtmlByDraftId } = useDrafts();
  const [showCc, setShowCc] = useState(draft.cc.length > 0);
  const [showBcc, setShowBcc] = useState(draft.bcc.length > 0);
  const [showFormatting, setShowFormatting] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const [showSignature, setShowSignature] = useState(true);
  const [signature, setSignature] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const quotedHtml = quotedHtmlByDraftId[draft.id] ?? "";
  const sending = Boolean(isSending[draft.id]);
  const canSend = draft.to.length > 0 && draft.subject.trim().length > 0;

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({ placeholder: "Enter text" }),
    ],
    content: draft.bodyHtml || "",
    onUpdate: ({ editor: activeEditor }) => updateDraft(draft.id, { bodyHtml: activeEditor.getHTML() }),
    editorProps: {
      attributes: {
        class: "min-h-[120px] outline-none text-[13px] leading-6 text-gray-900",
      },
    },
  });

  useEffect(() => {
    api.get<{ signature: string }>("/api/email/signature")
      .then((data) => setSignature(data.signature || "Conor | unlimited.bond"))
      .catch(() => setSignature("Conor | unlimited.bond"));
  }, []);

  useEffect(() => {
    if (editor && draft.bodyHtml !== editor.getHTML()) editor.commands.setContent(draft.bodyHtml || "");
  }, [draft.bodyHtml, editor]);

  function handleClose() {
    const isDirty = (editor?.getText().trim().length ?? 0) > 0 || draft.to.length > 0 || draft.subject.trim().length > 0;
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    closeDraft(draft.id);
  }

  return (
    <section className="mb-0 flex max-h-[560px] w-[500px] flex-col overflow-hidden rounded-t-xl bg-white shadow-[0_-4px_32px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.12)] pointer-events-auto max-md:fixed max-md:inset-0 max-md:z-[1100] max-md:max-h-none max-md:w-screen max-md:rounded-none">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-gray-200 px-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-gray-900">{titleForDraft(draft)}</span>
          <span className="block truncate text-[10px] uppercase tracking-[0.08em] text-gray-400">{draft.replyToThreadId ? "Reply" : "New message"} · {draftSavedLabel(draft)}</span>
        </span>
        <button type="button" onClick={() => minimizeDraft(draft.id)} className={iconButtonClass()} title="Minimize"><Minimize2 size={14} /></button>
        <button type="button" disabled className={iconButtonClass(true)} title="Full screen"><Maximize2 size={14} /></button>
        <button type="button" onClick={handleClose} className="grid min-h-7 min-w-7 place-items-center rounded text-red-500 hover:bg-red-50" title="Close"><X size={14} /></button>
      </header>

      {confirmDiscard && (
        <div className="flex min-h-8 items-center gap-2 border-b border-amber-100 bg-amber-50 px-3 text-[11px] text-amber-900">
          <span className="flex-1">Discard this draft?</span>
          <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-7 underline">Keep editing</button>
          <button type="button" onClick={() => closeDraft(draft.id)} className="min-h-7 text-red-600 underline">Discard</button>
        </div>
      )}

      {draft.replyToThreadId && (
        <div className="flex min-h-8 items-center gap-2 border-b border-gray-100 bg-[#f8f8f6] px-3 text-[11px] text-gray-500">
          <span className="min-w-0 flex-1 truncate">Replying in thread · {titleForDraft(draft)}</span>
          <button
            type="button"
            onClick={() => { window.location.href = `/email?thread=${draft.replyToThreadId}`; }}
            className="min-h-7 shrink-0 text-gray-700 underline"
          >
            View thread
          </button>
        </div>
      )}

      <div className="border-b border-gray-200 px-3 pt-2">
        <div className="flex min-h-8 items-start gap-1.5">
          <span className="w-6 shrink-0 pt-1.5 text-xs text-gray-400">To</span>
          <RecipientInput value={draft.to} onChange={(to) => updateDraft(draft.id, { to })} placeholder="Recipients" />
        </div>
        {showCc && (
          <div className="flex min-h-8 items-start gap-1.5">
            <span className="w-6 shrink-0 pt-1.5 text-xs text-gray-400">Cc</span>
            <RecipientInput value={draft.cc} onChange={(cc) => updateDraft(draft.id, { cc })} placeholder="CC recipients" />
          </div>
        )}
        {showBcc && (
          <div className="flex min-h-8 items-start gap-1.5">
            <span className="w-6 shrink-0 pt-1.5 text-xs text-gray-400">Bcc</span>
            <RecipientInput value={draft.bcc} onChange={(bcc) => updateDraft(draft.id, { bcc })} placeholder="BCC recipients" />
          </div>
        )}
        <div className="flex gap-2 pb-2 pl-7">
          {!showCc && <button type="button" onClick={() => setShowCc(true)} className="min-h-6 rounded-full bg-gray-50 px-2 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-900">+ Cc</button>}
          {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="min-h-6 rounded-full bg-gray-50 px-2 text-[11px] text-gray-500 hover:bg-gray-100 hover:text-gray-900">+ Bcc</button>}
        </div>
      </div>

      {!draft.replyToThreadId && (
        <input
          value={draft.subject}
          onChange={(event) => updateDraft(draft.id, { subject: event.target.value })}
          placeholder="Subject"
          className="h-9 shrink-0 border-b border-gray-200 bg-transparent px-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400"
        />
      )}

      <div className="min-h-[160px] flex-1 overflow-auto px-3 py-3">
        <EditorContent editor={editor} />
      </div>

      {draft.replyToThreadId && quotedHtml && (
        <div className="px-3 py-1">
          <button
            type="button"
            onClick={() => setShowQuoted((current) => !current)}
            className="min-h-6 rounded border border-gray-200 px-2 text-xs tracking-[2px] text-gray-400 hover:bg-gray-50"
          >
            ···
          </button>
          {showQuoted && (
            <div
              className="mt-2 max-h-40 overflow-auto border-t border-gray-200 pt-2 text-xs text-gray-600"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(quotedHtml) }}
            />
          )}
        </div>
      )}

      <div className="border-t border-gray-200 px-3 pb-2">
        <div className="flex items-center justify-between py-1.5">
          <span className="text-[11px] text-gray-400">--</span>
          <button type="button" onClick={() => setShowSignature((current) => !current)} className="min-h-6 text-[10px] text-gray-400 hover:text-gray-900">
            {showSignature ? "Hide" : "Show"} signature
          </button>
        </div>
        {showSignature && (
          <div className="text-xs leading-5 text-gray-600" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature) }} />
        )}
      </div>

      {draft.attachments && draft.attachments.length > 0 && (
        <div className="flex max-h-24 flex-wrap gap-1 overflow-auto border-t border-gray-100 px-3 py-2">
          {draft.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/email/drafts/${draft.id}/attachments/${attachment.id}/download`}
              className="group inline-flex max-w-[220px] items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-200"
              title={attachment.filename}
            >
              <Paperclip size={12} />
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 text-gray-400">{formatBytes(attachment.sizeBytes)}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  deleteAttachment(draft.id, attachment.id).catch(() => undefined);
                }}
                className="ml-1 grid h-4 w-4 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-white hover:text-red-600"
              >
                ×
              </button>
            </a>
          ))}
        </div>
      )}

      {showFormatting && (
        <div className="flex gap-1 border-t border-gray-200 bg-gray-50 px-3 py-1.5">
          <FormatButton label="B" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} className="font-bold" />
          <FormatButton label="I" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} className="italic" />
          <FormatButton label="U" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()} className="underline" />
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <FormatButton label="•" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
          <FormatButton label="1." active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          <FormatButton label="🔗" active={editor?.isActive("link")} onClick={() => {
            const href = window.prompt("Link URL");
            if (href) editor?.chain().focus().setLink({ href }).run();
          }} />
        </div>
      )}

      <footer className="flex h-11 shrink-0 items-center gap-1 border-t border-gray-200 px-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (!files?.length) return;
            setUploadingAttachments(true);
            uploadAttachments(draft.id, files)
              .catch(() => undefined)
              .finally(() => {
                setUploadingAttachments(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
              });
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingAttachments}
          className={iconButtonClass(uploadingAttachments)}
          title="Attach files"
        >
          <Paperclip size={16} />
        </button>
        <button type="button" disabled className={iconButtonClass(true)} title="Reminder"><Bell size={16} /></button>
        <button type="button" onClick={() => setShowFormatting((current) => !current)} className={iconButtonClass()} title="Formatting"><Type size={16} /></button>
        <div className="flex-1" />
        <span className="mr-2 min-w-0 max-w-[180px] truncate text-[10px] text-gray-400">{draftSavedLabel(draft)} · {accountEmail}</span>
        <button
          type="button"
          onClick={() => sendDraft(draft.id).catch(() => undefined)}
          disabled={sending || !canSend}
          className={`flex min-h-8 items-center gap-1.5 rounded-md px-4 text-[13px] font-medium ${sending || !canSend ? "cursor-not-allowed bg-gray-100 text-gray-400" : "bg-[#1a1a1f] text-white"}`}
        >
          {sending ? "Sending..." : <><Send size={13} /> Send →</>}
        </button>
      </footer>
    </section>
  );
}

export function ComposerTray() {
  const { drafts, expandedDraftId, toggleExpand, closeDraft, error, clearError } = useDrafts();
  const [accountEmail, setAccountEmail] = useState("");
  const expandedDraft = drafts.find((draft) => draft.id === expandedDraftId) ?? null;

  useEffect(() => {
    api.get<EmailAccount[]>("/api/email/accounts")
      .then((accounts) => setAccountEmail(accounts.find((account) => account.isPrimary)?.emailAddress ?? accounts[0]?.emailAddress ?? ""))
      .catch(() => setAccountEmail(""));
  }, []);

  return (
    <>
      {error && (
        <div className="fixed bottom-14 right-4 z-[800] flex min-h-10 items-center gap-3 rounded-lg bg-red-600 px-3 text-xs text-white shadow-lg">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="min-h-7 underline">Dismiss</button>
        </div>
      )}
      <div className="fixed bottom-10 right-0 z-[500] flex flex-col items-end pointer-events-none">
        {expandedDraft && (
          <div className="pr-4 max-md:pr-3">
            <ComposerWindow draft={expandedDraft} accountEmail={accountEmail} />
          </div>
        )}
        {drafts.length > 0 && (
          <div className="flex items-end gap-1 pr-4 pointer-events-auto max-md:pr-3">
            {drafts.map((draft) => (
              <MinimizedTab
                key={draft.id}
                draft={draft}
                isExpanded={expandedDraftId === draft.id}
                onToggle={() => toggleExpand(draft.id)}
                onClose={(event) => {
                  event.stopPropagation();
                  closeDraft(draft.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
