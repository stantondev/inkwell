"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Avatar } from "@/components/avatar";
import { LetterEditor } from "@/components/letter-editor";
import {
  clearLetterDraft,
  isBlankLetter,
  loadLetterDraft,
  saveLetterDraft,
} from "@/lib/letter-drafts";
import { StationeryModal } from "./stationery-modal";
import type { LetterMessage, ThreadData } from "./page";

// Letters from the same person this close together read as one sitting, so
// only the first shows the name and time.
const CONTINUATION_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Dates. The server renders in UTC; the browser switches to the reader's own
// zone right after hydration. Starting both in UTC keeps the two renders
// identical, so day separators can't cause a hydration mismatch.
// ---------------------------------------------------------------------------

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayLabel(iso: string, timeZone: string): string {
  const key = dayKey(iso, timeZone);
  const now = Date.now();
  if (key === dayKey(new Date(now).toISOString(), timeZone)) return "Today";
  if (key === dayKey(new Date(now - 86_400_000).toISOString(), timeZone)) return "Yesterday";
  const date = new Date(iso);
  const sameYear =
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date) ===
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date(now));
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function fullDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "short" }).format(
    new Date(iso)
  );
}

// Older letters were plain text. Escape before handing them to the editor.
function plainToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped.replace(/\n/g, "</p><p>")}</p>`;
}

// ---------------------------------------------------------------------------
// One letter
// ---------------------------------------------------------------------------

function LetterPage({
  message,
  conversationId,
  timeZone,
  continued,
  isNew,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onUpdate,
  prefersReducedMotion,
}: {
  message: LetterMessage;
  conversationId: string;
  timeZone: string;
  continued: boolean;
  isNew: boolean;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updated: LetterMessage) => void;
  prefersReducedMotion: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editHtmlRef = useRef(message.body_html || message.body || "");

  const handleDelete = async () => {
    // Removing only hides it for you; the other person keeps their copy.
    if (!confirm("Remove this letter from your letterbox? They'll still have their copy.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/letters/${conversationId}/messages/${message.id}`, {
        method: "DELETE",
      });
      if (res.ok) onDelete(message.id);
      else setDeleting(false);
    } catch {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    const html = editHtmlRef.current;
    if (isBlankLetter(html) || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/letters/${conversationId}/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(json.error || "Couldn't save — please try again");
        return;
      }
      onUpdate(message.id, json.data);
      onCancelEdit();
    } catch {
      setEditError("Couldn't save — please try again");
    } finally {
      setSaving(false);
    }
  };

  const name = message.is_mine ? "You" : message.sender_display_name;

  const actions = message.is_mine && !isEditing && (
    <span className="letter-page-actions">
      <button type="button" className="letter-link-btn" onClick={() => onStartEdit(message.id)}>
        edit
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="letter-link-btn letter-link-btn-danger"
        onClick={handleDelete}
        disabled={deleting}
        title="Remove from your letterbox (they keep their copy)"
      >
        remove for me
      </button>
    </span>
  );

  return (
    <motion.article
      className={`letter-page ${message.is_mine ? "letter-page-mine" : "letter-page-theirs"} ${
        continued ? "letter-page-continued" : ""
      }`}
      initial={prefersReducedMotion || !isNew ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      aria-label={`Letter from ${name}, ${fullDate(message.inserted_at, timeZone)}`}
    >
      {!continued && (
        <header className="letter-page-head">
          <Avatar url={message.sender_avatar_url} name={message.sender_display_name} size={28} />
          <span className="letter-page-name">{name}</span>
          {actions}
          <time
            className="letter-page-time"
            dateTime={message.inserted_at}
            title={fullDate(message.inserted_at, timeZone)}
          >
            {timeLabel(message.inserted_at, timeZone)}
          </time>
        </header>
      )}

      {isEditing ? (
        <div className="letter-page-edit">
          <LetterEditor
            content={message.body_html || plainToHtml(message.body || "")}
            onChange={(html) => {
              editHtmlRef.current = html;
            }}
            onSubmit={handleSaveEdit}
            compact
            autoFocus
          />
          {editError && <div className="letter-page-error">{editError}</div>}
          <div className="letter-page-edit-actions">
            <button type="button" className="letter-link-btn" onClick={onCancelEdit}>
              Cancel
            </button>
            <button type="button" className="letter-send-btn" onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : message.body_html ? (
        <div className="prose-letter letter-page-body" dangerouslySetInnerHTML={{ __html: message.body_html }} />
      ) : (
        <p className="letter-page-body letter-page-plain">{message.body}</p>
      )}

      {/* A continued letter has no header, so its time and links go here. */}
      {!isEditing && (message.edited_at || continued) && (
        <footer className="letter-page-foot">
          {continued && actions}
          {message.edited_at && (
            <span title={`Edited ${fullDate(message.edited_at, timeZone)}`}>edited</span>
          )}
          {continued && (
            <time dateTime={message.inserted_at} title={fullDate(message.inserted_at, timeZone)}>
              {timeLabel(message.inserted_at, timeZone)}
            </time>
          )}
        </footer>
      )}
    </motion.article>
  );
}

// ---------------------------------------------------------------------------
// Reply bar: quick replies at the bottom of the thread. Shares its draft
// with the stationery.
// ---------------------------------------------------------------------------

function ReplyBar({
  conversationId,
  recipientName,
  draftHtml,
  editorKey,
  onDraftChange,
  onSent,
  onExpand,
}: {
  conversationId: string;
  recipientName: string;
  draftHtml: string;
  editorKey: number;
  onDraftChange: (html: string) => void;
  onSent: (message: LetterMessage) => void;
  onExpand: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(isBlankLetter(draftHtml));
  const htmlRef = useRef(draftHtml);

  useEffect(() => {
    htmlRef.current = draftHtml;
    setEmpty(isBlankLetter(draftHtml));
    // Only when the editor is re-created (draft loaded, stationery closed,
    // letter sent), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey]);

  const send = async () => {
    const html = htmlRef.current;
    if (isBlankLetter(html) || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/letters/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.errors?.body?.[0] ??
            (json.errors?.body_html ? "This letter is too long to send in one piece." : null) ??
            json.error ??
            "Couldn't send — please try again"
        );
        return;
      }
      onSent(json.data);
    } catch {
      setError("Couldn't send — please try again");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="letter-reply-bar">
      <div className="letter-reply-bar-inner">
        <div className="letter-reply-bar-field">
          <LetterEditor
            key={editorKey}
            content={draftHtml}
            onChange={(html) => {
              htmlRef.current = html;
              setEmpty(isBlankLetter(html));
              onDraftChange(html);
            }}
            onSubmit={send}
            enterToSend
            toolbar={false}
            className="letter-reply-editor"
            placeholder={`Write back to ${recipientName}…`}
          />
        </div>
        <button
          type="button"
          className="letter-icon-btn"
          onClick={onExpand}
          title="Open the stationery (formatting, pictures, room to write)"
          aria-label="Open the stationery"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
        <button
          type="button"
          className="letter-send-btn"
          onClick={send}
          disabled={sending || empty}
          aria-label="Send letter"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <div className="letter-reply-bar-meta">
        {error ? (
          <span className="letter-page-error" role="alert">
            {error}
          </span>
        ) : (
          <span className="letter-reply-hint">Enter to send · Shift+Enter for a new line</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The thread
// ---------------------------------------------------------------------------

interface Props {
  initialThread: ThreadData;
  conversationId: string;
}

export function LetterThread({ initialThread, conversationId }: Props) {
  const [messages, setMessages] = useState<LetterMessage[]>(initialThread.messages);
  const [hasMore, setHasMore] = useState(initialThread.has_more);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const [replyKey, setReplyKey] = useState(0);
  const [timeZone, setTimeZone] = useState("UTC");
  const prefersReducedMotion = usePrefersReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].id : null
  );
  const isAtBottomRef = useRef(true);
  // Height before older letters were added above, to keep the reader's place.
  const prependAnchorRef = useRef<number | null>(null);
  const other = initialThread.other_user;
  const canWrite = initialThread.can_write !== false;

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  // Pick up any unsent letter from last time.
  useEffect(() => {
    const saved = loadLetterDraft(conversationId);
    if (saved) {
      setDraftHtml(saved);
      setReplyKey((k) => k + 1);
    }
  }, [conversationId]);

  // Save the draft a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => saveLetterDraft(conversationId, draftHtml), 400);
    return () => clearTimeout(t);
  }, [conversationId, draftHtml]);

  // Mark as read on mount and refresh nav badge
  useEffect(() => {
    fetch(`/api/letters/${conversationId}/read`, { method: "POST" })
      .then(() => window.dispatchEvent(new Event("inkwell-nav-refresh")))
      .catch(() => {});
  }, [conversationId]);

  // Start at the newest letter.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // New letters at the bottom follow along if you're there; older letters
  // added at the top keep what you were reading in place.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependAnchorRef.current !== null) {
      el.scrollTop += el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
    } else if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Check for new letters every 5 seconds while the page is visible.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const lastId = lastMessageIdRef.current;
      try {
        // With no letters yet there's no cursor, so ask for the thread itself.
        const res = await fetch(
          lastId
            ? `/api/letters/${conversationId}?since=${encodeURIComponent(lastId)}`
            : `/api/letters/${conversationId}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json = await res.json();
        const received = lastId ? json.data : json.data?.messages;
        const newMsgs: LetterMessage[] = Array.isArray(received) ? received : [];

        if (newMsgs.length > 0) {
          const ids = new Set(newMsgs.map((m) => m.id));
          setNewMessageIds((prev) => new Set([...prev, ...ids]));
          // Never add a letter twice (one you just sent can come back here).
          setMessages((prev) => {
            const have = new Set(prev.map((m) => m.id));
            return [...prev, ...newMsgs.filter((m) => !have.has(m.id))];
          });
          lastMessageIdRef.current = newMsgs[newMsgs.length - 1].id;

          fetch(`/api/letters/${conversationId}/read`, { method: "POST" })
            .then(() => window.dispatchEvent(new Event("inkwell-nav-refresh")))
            .catch(() => {});
        }
      } catch {
        // try again next time
      }
    };

    const start = () => {
      if (!interval) interval = setInterval(poll, 5000);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        poll();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) lastMessageIdRef.current = messages[messages.length - 1].id;
  }, [messages]);

  const handleDelete = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleUpdate = useCallback((id: string, updated: LetterMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? updated : m)));
  }, []);

  const loadOlderLetters = async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/letters/${conversationId}?before=${encodeURIComponent(oldest.id)}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      const older: LetterMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      prependAnchorRef.current = scrollRef.current?.scrollHeight ?? null;
      setMessages((prev) => {
        const have = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !have.has(m.id)), ...prev];
      });
      setHasMore(Boolean(data?.has_more));
    } catch {
      // leave the button for another try
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSent = useCallback(
    (message: LetterMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setNewMessageIds((prev) => new Set([...prev, message.id]));
      lastMessageIdRef.current = message.id;
      isAtBottomRef.current = true;
      setDraftHtml("");
      clearLetterDraft(conversationId);
      setReplyKey((k) => k + 1);
    },
    [conversationId]
  );

  const closeStationery = useCallback(() => {
    setComposeOpen(false);
    // Show whatever was written there back in the reply bar.
    setReplyKey((k) => k + 1);
  }, []);

  // Day separators and "same sitting" grouping.
  const rows = useMemo(() => {
    return messages.map((message, i) => {
      const prev = messages[i - 1];
      const day = dayKey(message.inserted_at, timeZone);
      const newDay = !prev || dayKey(prev.inserted_at, timeZone) !== day;
      const continued =
        !!prev &&
        !newDay &&
        prev.sender_username === message.sender_username &&
        new Date(message.inserted_at).getTime() - new Date(prev.inserted_at).getTime() < CONTINUATION_MS;
      return { message, newDay, continued };
    });
  }, [messages, timeZone]);

  return (
    <div className="letter-thread-container">
      <div className="letter-thread-header">
        <Link href="/letters" className="letter-thread-back" title="Back to Letterbox" aria-label="Back to Letterbox">
          ←
        </Link>
        <Link href={`/${other.username}`} className="letter-thread-who">
          <Avatar url={other.avatar_url} name={other.display_name} size={36} />
          <span className="letter-thread-who-text">
            <span className="letter-thread-who-name">{other.display_name}</span>
            <span className="letter-thread-who-handle">@{other.username}</span>
          </span>
        </Link>
        {canWrite && (
          <button
            type="button"
            className="letter-write-btn letter-write-btn-header"
            onClick={() => setComposeOpen(true)}
            title="Open the stationery"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>Stationery</span>
          </button>
        )}
      </div>

      <div className="letter-thread-body">
        <div ref={scrollRef} onScroll={handleScroll} className="letter-thread-messages">
          <div className="letter-thread-column">
            {hasMore && (
              <div className="letter-older">
                <button type="button" className="letter-older-btn" onClick={loadOlderLetters} disabled={loadingOlder}>
                  {loadingOlder ? "Loading…" : "↑ Earlier letters"}
                </button>
              </div>
            )}

            {!hasMore && messages.length > 0 && (
              <p className="letter-thread-start">
                The beginning of your letters with {other.display_name}
              </p>
            )}

            <AnimatePresence initial={false}>
              {rows.map(({ message, newDay, continued }) => (
                <div key={message.id}>
                  {newDay && (
                    <div className="letter-day" role="separator">
                      <span>{dayLabel(message.inserted_at, timeZone)}</span>
                    </div>
                  )}
                  <LetterPage
                    message={message}
                    conversationId={conversationId}
                    timeZone={timeZone}
                    continued={continued}
                    isNew={newMessageIds.has(message.id)}
                    isEditing={editingMessageId === message.id}
                    onStartEdit={(id) => setEditingMessageId(id)}
                    onCancelEdit={() => setEditingMessageId(null)}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </div>
              ))}
            </AnimatePresence>

            {messages.length === 0 && (
              <div className="letter-empty-state">
                <div className="letter-empty-icon" aria-hidden="true">
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="letter-empty-heading">Begin your correspondence</div>
                <div className="letter-empty-sub">
                  Write a quick note below, or open the stationery for a longer letter.
                </div>
              </div>
            )}
          </div>
        </div>

        {canWrite ? (
          <ReplyBar
            conversationId={conversationId}
            recipientName={other.display_name}
            draftHtml={draftHtml}
            editorKey={replyKey}
            onDraftChange={setDraftHtml}
            onSent={handleSent}
            onExpand={() => setComposeOpen(true)}
          />
        ) : (
          <div className="letter-reply-closed" role="status">
            You and {other.display_name} are no longer pen pals, so this conversation is closed to new
            letters. Your letters stay here.
          </div>
        )}
      </div>

      {canWrite && (
        <StationeryModal
          open={composeOpen}
          onClose={closeStationery}
          conversationId={conversationId}
          recipientDisplayName={other.display_name}
          recipientUsername={other.username}
          recipientAvatarUrl={other.avatar_url}
          initialDraftHtml={draftHtml}
          onDraftChange={setDraftHtml}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
