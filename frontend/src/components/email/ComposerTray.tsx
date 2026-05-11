import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { Bold, Italic, Link2, List, ListOrdered, Paperclip, Send, Underline as UnderlineIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
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

function draftTitle(draft: Draft) {
  return draft.subject.trim() || (draft.replyToThreadId ? "Reply" : "New message");
}

function linkedRecordLabel(draft: Draft) {
  if (draft.linkedOpportunity) return `${draft.linkedOpportunity.title || draft.linkedOpportunity.clientName || "Opportunity"} [Opportunity]`;
  if (draft.linkedProduction) {
    const title = [draft.linkedProduction.jobCode, draft.linkedProduction.clientName || draft.linkedProduction.title].filter(Boolean).join(" ");
    return `${title || "Production"} [Production]`;
  }
  return "";
}

function EditorButton({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`grid min-h-7 min-w-7 place-items-center rounded text-[11px] ${active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );
}

function RecipientInput({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.get<ContactSuggestion[]>(`/api/contacts?search=${encodeURIComponent(query.trim())}&limit=8`)
        .then((items) => {
          if (!cancelled) {
            setSuggestions(items.filter((item) => item.email));
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function addAddress(raw: string) {
    const email = raw.trim().replace(/,$/, "").toLowerCase();
    if (!email || !isValidEmail(email)) return;
    if (!values.includes(email)) onChange([...values, email]);
    setQuery("");
    setSuggestions([]);
  }

  function addSuggestion(contact: ContactSuggestion) {
    if (contact.email) addAddress(contact.email);
  }

  function removeAddress(email: string) {
    onChange(values.filter((value) => value !== email));
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
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) addSuggestion(suggestion);
      else addAddress(query);
    }
  }

  return (
    <div className="relative flex min-h-9 items-start gap-2 border-b border-gray-100 px-3 py-1.5 text-xs">
      <span className="mt-1 w-8 shrink-0 text-gray-400">{label}:</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {values.map((email) => (
          <span key={email} title={email} className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-700">
            <span className="truncate">{email}</span>
            <button type="button" onClick={() => removeAddress(email)} className="text-gray-400 hover:text-gray-900">×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (query.trim() && isValidEmail(query)) addAddress(query);
          }}
          placeholder={values.length ? "" : "name@example.com"}
          className="min-h-7 min-w-[120px] flex-1 border-0 bg-transparent text-xs outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="absolute left-12 top-full z-[1200] mt-1 w-72 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((contact, index) => {
            const name = `${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}`;
            return (
              <button
                key={contact.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addSuggestion(contact)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left ${index === activeIndex ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-900 text-[10px] font-medium text-white">
                  {(name || contact.email || "?").slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-gray-900">{name || contact.email}</span>
                  <span className="block truncate text-[11px] text-gray-500">{contact.email}{contact.company?.name ? ` · ${contact.company.name}` : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DraftComposerWindow({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const { updateDraft, minimizeDraft, closeDraft, sendDraft, isSending } = useDrafts();
  const [ccVisible, setCcVisible] = useState(draft.cc.length > 0);
  const [bccVisible, setBccVisible] = useState(draft.bcc.length > 0);
  const [signatureVisible, setSignatureVisible] = useState(true);
  const [signature, setSignature] = useState("Conor | unlimited.bond");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const sending = Boolean(isSending[draft.id]);
  const isReply = Boolean(draft.replyToThreadId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapLink.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Write a message..." }),
    ],
    content: draft.bodyHtml || "",
    onUpdate: ({ editor: activeEditor }) => updateDraft(draft.id, { bodyHtml: activeEditor.getHTML() }),
    editorProps: {
      attributes: {
        class: "min-h-[130px] flex-1 outline-none text-sm leading-6",
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

  const isDirty = useMemo(() => {
    const plain = editor?.getText().trim() ?? "";
    return plain.length > 0 || draft.to.length > 0 || draft.cc.length > 0 || draft.bcc.length > 0 || draft.subject.trim().length > 0;
  }, [draft, editor]);

  function requestClose() {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    closeDraft(draft.id);
  }

  return (
    <section className="flex max-h-[480px] w-[480px] flex-col overflow-hidden rounded-t-lg bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] pointer-events-auto max-md:fixed max-md:inset-0 max-md:z-[1100] max-md:h-screen max-md:max-h-none max-md:w-full max-md:rounded-none">
      <header className="flex h-10 shrink-0 items-center gap-2 bg-[#1a1a1f] px-3 text-white max-md:h-12">
        <button type="button" onClick={() => minimizeDraft(draft.id)} className="hidden min-h-9 text-xs text-white/80 max-md:block">←</button>
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium">{draftTitle(draft)}</h2>
        <button type="button" onClick={() => minimizeDraft(draft.id)} className="grid min-h-8 min-w-8 place-items-center rounded hover:bg-white/10 max-md:hidden">−</button>
        <button type="button" onClick={requestClose} className="grid min-h-8 min-w-8 place-items-center rounded hover:bg-white/10"><X size={15} /></button>
      </header>

      {isReply && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 text-[11px] text-gray-500">
          <span className="min-w-0 flex-1 truncate">↩ Replying to thread: {draft.subject}</span>
          <button type="button" onClick={() => navigate(`/email?thread=${draft.replyToThreadId}`)} className="min-h-7 text-gray-900 underline">View thread →</button>
        </div>
      )}

      <div className="shrink-0">
        <RecipientInput label="To" values={draft.to} onChange={(to) => updateDraft(draft.id, { to })} />
        <div className="flex min-h-8 items-center gap-3 border-b border-gray-100 px-3 text-[11px] text-blue-600">
          <button type="button" onClick={() => setCcVisible((current) => !current)} className="min-h-7">{ccVisible ? "Hide CC" : "Add CC"}</button>
          <button type="button" onClick={() => setBccVisible((current) => !current)} className="min-h-7">{bccVisible ? "Hide BCC" : "Add BCC"}</button>
        </div>
        {ccVisible && <RecipientInput label="Cc" values={draft.cc} onChange={(cc) => updateDraft(draft.id, { cc })} />}
        {bccVisible && <RecipientInput label="Bcc" values={draft.bcc} onChange={(bcc) => updateDraft(draft.id, { bcc })} />}
        <label className="flex min-h-9 items-center gap-2 border-b border-gray-100 px-3 text-xs">
          <span className="w-14 shrink-0 text-gray-400">Subject:</span>
          {isReply ? (
            <span className="min-w-0 flex-1 truncate text-gray-700">{draft.subject}</span>
          ) : (
            <input value={draft.subject} onChange={(event) => updateDraft(draft.id, { subject: event.target.value })} className="min-h-8 flex-1 border-0 bg-transparent text-xs outline-none" />
          )}
        </label>
        {linkedRecordLabel(draft) && (
          <div className="flex min-h-8 items-center border-b border-gray-100 px-3 text-[11px]">
            <span className="rounded bg-gray-900 px-2 py-1 text-white">→ {linkedRecordLabel(draft)}</span>
          </div>
        )}
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-gray-100 px-2">
        <EditorButton title="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14} /></EditorButton>
        <EditorButton title="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14} /></EditorButton>
        <EditorButton title="Underline" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><UnderlineIcon size={14} /></EditorButton>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <EditorButton title="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={14} /></EditorButton>
        <EditorButton title="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></EditorButton>
        <span className="mx-1 h-4 w-px bg-gray-200" />
        <EditorButton title="Link" active={editor?.isActive("link")} onClick={() => {
          const href = window.prompt("Link URL");
          if (href) editor?.chain().focus().setLink({ href }).run();
        }}><Link2 size={14} /></EditorButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-3 py-2">
        <EditorContent editor={editor} className="flex min-h-[130px] flex-1 text-sm [&_.ProseMirror]:min-h-[130px] [&_.ProseMirror]:w-full [&_.ProseMirror]:outline-none" />
        {signatureVisible && (
          <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-400">
            <div className="flex"><span>--</span><button type="button" onClick={() => setSignatureVisible(false)} className="ml-auto min-h-6 underline">Hide</button></div>
            {signature}
          </div>
        )}
      </div>

      <footer className="flex h-11 shrink-0 items-center gap-2 border-t border-gray-100 px-3">
        {confirmDiscard ? (
          <span className="flex flex-1 items-center gap-2 text-[11px] text-gray-600">Discard this draft? <button type="button" onClick={() => setConfirmDiscard(false)} className="min-h-8 underline">Keep</button><button type="button" onClick={requestClose} className="min-h-8 text-red-600 underline">Discard</button></span>
        ) : (
          <button type="button" onClick={requestClose} className="min-h-9 px-2 text-xs text-gray-500">Discard</button>
        )}
        <button type="button" disabled title="Attachments coming next" className="ml-auto grid min-h-9 min-w-9 place-items-center rounded text-gray-300"><Paperclip size={15} /></button>
        <button
          type="button"
          onClick={() => sendDraft(draft.id).catch(() => undefined)}
          disabled={sending || draft.to.length === 0}
          className="flex min-h-9 items-center gap-1 rounded bg-gray-900 px-3 text-xs font-medium text-white disabled:opacity-40"
        >
          {sending ? "Sending..." : <><Send size={13} /> Send →</>}
        </button>
      </footer>
    </section>
  );
}

export function ComposerTray() {
  const { drafts, maximizeDraft, closeDraft, error, clearError } = useDrafts();
  const expanded = drafts.filter((draft) => !draft.isMinimized);
  const minimized = drafts.filter((draft) => draft.isMinimized);

  if (!drafts.length && !error) return null;

  return (
    <>
      {error && (
        <div className="fixed bottom-4 right-4 z-[1300] flex min-h-10 items-center gap-3 rounded-lg bg-red-600 px-3 text-xs text-white shadow-lg">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="min-h-7 underline">Dismiss</button>
        </div>
      )}
      <div className="fixed bottom-0 right-6 z-[1000] flex max-w-[calc(100vw-48px)] flex-col items-end gap-2 pointer-events-none max-md:right-3 max-md:max-w-[calc(100vw-24px)]">
        <div className="flex items-end gap-3 pointer-events-none max-md:block">
          {expanded.map((draft) => <DraftComposerWindow key={draft.id} draft={draft} />)}
        </div>
        {minimized.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 pointer-events-auto max-md:hidden">
            {minimized.map((draft) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => maximizeDraft(draft.id)}
                className="flex h-9 w-[220px] items-center gap-2 rounded-t-lg bg-[#1a1a1f] px-3 text-left text-xs font-medium text-white"
              >
                <span className="min-w-0 flex-1 truncate">{draftTitle(draft)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeDraft(draft.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.stopPropagation();
                      closeDraft(draft.id);
                    }
                  }}
                  className="text-white/70 hover:text-white"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
        {minimized.length > 0 && expanded.length === 0 && (
          <button
            type="button"
            onClick={() => maximizeDraft(minimized[0].id)}
            className="mb-16 hidden min-h-10 rounded-full bg-[#1a1a1f] px-4 text-xs font-medium text-white shadow-lg pointer-events-auto max-md:block"
          >
            {minimized.length} draft{minimized.length === 1 ? "" : "s"} ▲
          </button>
        )}
      </div>
    </>
  );
}
