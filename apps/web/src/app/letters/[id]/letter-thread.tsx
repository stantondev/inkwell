"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Avatar } from "@/components/avatar";
import { LetterEditor } from "@/components/letter-editor";
import { StationeryModal } from "./stationery-modal";
import type { LetterMessage, ThreadData } from "./page";

// Deterministic "random" rotation from message ID — gives each note a slight tilt
function seedRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return ((hash % 100) / 100) * 3 - 1.5;
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// ---------------------------------------------------------------------------
// LetterNote — individual message
// ---------------------------------------------------------------------------

function LetterNote({
  message,
  conversationId,
  onDelete,
  onUpdate,
  prefersReducedMotion,
  isNew,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  message: LetterMessage;
  conversationId: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updated: LetterMessage) => void;
  prefersReducedMotion: boolean;
  isNew: boolean;
  isEditing: boolean;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editHtmlRef = useRef(message.body_html || message.body || "");
  const rotation = prefersReducedMotion ? 0 : seedRotation(message.id);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  // On touch devices, always show actions for own messages (no hover available)
  const actionsVisible = isTouchDevice ? message.is_mine : showActions;

  const handleDelete = async () => {
    if (!confirm("Remove this letter from your side?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/letters/${conversationId}/messages/${message.id}`,
        { method: "DELETE" }
      );
      if (res.ok) onDelete(message.id);
    } catch {
      setDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    const html = editHtmlRef.current;
    if (!html || saving) return;
    setSaving(true);
    setEditError(null);

    try {
      const res = await fetch(
        `/api/letters/${conversationId}/messages/${message.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body_html: html }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setEditError(json.error || "Failed to save");
        return;
      }
      onUpdate(message.id, json.data);
      onCancelEdit();
    } catch {
      setEditError("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={
        prefersReducedMotion
          ? false
          : isNew
          ? { opacity: 0, y: 30, scale: 0.95 }
          : { opacity: 0, y: 16 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={
        isNew
          ? { type: "spring", stiffness: 260, damping: 22 }
          : { duration: 0.35, ease: "easeOut" }
      }
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: message.is_mine ? "flex-end" : "flex-start",
        marginBottom: "20px",
      }}
      onMouseEnter={isTouchDevice ? undefined : () => setShowActions(true)}
      onMouseLeave={isTouchDevice ? undefined : () => setShowActions(false)}
    >
      {/* Sender label */}
      {!message.is_mine && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--muted)",
            marginBottom: "4px",
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontStyle: "italic",
            paddingLeft: "4px",
          }}
        >
          {message.sender_display_name}
        </div>
      )}

      {/* Paper note */}
      <div
        style={{
          maxWidth: "min(480px, 80%)",
          position: "relative",
          transform: isEditing ? "none" : `rotate(${rotation}deg)`,
          transition: prefersReducedMotion ? "none" : "transform 0.2s ease",
        }}
      >
        {/* Drop shadow */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "3px -1px -4px 1px",
            background: "rgba(0,0,0,0.08)",
            borderRadius: "4px",
            filter: "blur(4px)",
            zIndex: 0,
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            background: message.is_mine ? "#f0f4fd" : "#fdf8ee",
            borderRadius: "4px",
            padding: isEditing ? "8px" : "14px 18px",
            border: `1px solid ${message.is_mine ? "#c8d5f0" : "#e0d4b8"}`,
            backgroundImage: message.is_mine
              ? `repeating-linear-gradient(
                  transparent,
                  transparent 23px,
                  rgba(180,200,240,0.25) 23px,
                  rgba(180,200,240,0.25) 24px
                )`
              : `repeating-linear-gradient(
                  transparent,
                  transparent 23px,
                  rgba(180,160,100,0.2) 23px,
                  rgba(180,160,100,0.2) 24px
                )`,
          }}
        >
          {/* Message body — edit mode or display mode */}
          {isEditing ? (
            <div>
              <LetterEditor
                content={message.body_html || `<p>${(message.body || "").replace(/\n/g, "</p><p>")}</p>`}
                onChange={(html) => { editHtmlRef.current = html; }}
                onSubmit={handleSaveEdit}
                compact
                autoFocus
              />
              {editError && (
                <div style={{ fontSize: "12px", color: "var(--danger)", marginTop: "6px" }}>
                  {editError}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px", justifyContent: "flex-end" }}>
                <button
                  onClick={onCancelEdit}
                  style={{
                    background: "none",
                    border: "1px solid rgba(180,160,100,0.3)",
                    borderRadius: "6px",
                    padding: "4px 12px",
                    fontSize: "12px",
                    color: "#6a5a3a",
                    cursor: "pointer",
                    fontFamily: "var(--font-lora, Georgia, serif)",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  style={{
                    background: "var(--accent)",
                    border: "none",
                    borderRadius: "6px",
                    padding: "4px 12px",
                    fontSize: "12px",
                    color: "white",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-lora, Georgia, serif)",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Render rich HTML or plain text */}
              {message.body_html ? (
                <div
                  className="prose-letter"
                  dangerouslySetInnerHTML={{ __html: message.body_html }}
                />
              ) : (
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    lineHeight: "24px",
                    fontFamily: "var(--font-lora, Georgia, serif)",
                    color: "#1a100a",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {message.body}
                </p>
              )}
            </>
          )}

          {/* Footer: timestamp + actions */}
          {!isEditing && (
            <div
              style={{
                marginTop: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  color: message.is_mine ? "#6a80aa" : "#8a7a4a",
                  fontVariant: "small-caps",
                  letterSpacing: "0.06em",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {formatMessageTime(message.inserted_at)}
                {message.edited_at && (
                  <span
                    title={`Edited ${new Date(message.edited_at).toLocaleString()}`}
                    style={{ fontStyle: "italic", opacity: 0.7 }}
                  >
                    (edited)
                  </span>
                )}
              </span>

              {/* Edit + Delete buttons (own messages only) */}
              {message.is_mine && (
                <AnimatePresence>
                  {actionsVisible && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: "flex", gap: "4px", alignItems: "center" }}
                    >
                      <button
                        onClick={() => onStartEdit(message.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "11px",
                          color: message.is_mine ? "#6a80aa" : "#8a7a4a",
                          padding: "2px 4px",
                        }}
                        title="Edit this letter"
                      >
                        edit
                      </button>
                      <span style={{ fontSize: "10px", color: "var(--muted)", opacity: 0.4 }}>·</span>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "11px",
                          color: "#aa6666",
                          padding: "2px 4px",
                          opacity: deleting ? 0.5 : 1,
                        }}
                        title="Remove this letter"
                      >
                        remove
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// LetterThread — main thread component
// ---------------------------------------------------------------------------

interface Props {
  initialThread: ThreadData;
  conversationId: string;
  currentUsername: string;
}

export function LetterThread({ initialThread, conversationId }: Props) {
  const [messages, setMessages] = useState<LetterMessage[]>(initialThread.messages);
  const [hasMore, setHasMore] = useState(initialThread.has_more);
  const [page, setPage] = useState(initialThread.page);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [draftHtml, setDraftHtml] = useState("");
  const prefersReducedMotion = usePrefersReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].id : null
  );
  const isAtBottomRef = useRef(true);
  const router = useRouter();

  // Mark as read on mount and refresh nav badge
  useEffect(() => {
    fetch(`/api/letters/${conversationId}/read`, { method: "POST" })
      .then(() => window.dispatchEvent(new Event("inkwell-nav-refresh")))
      .catch(() => {});
  }, [conversationId]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < 80;
  }, []);

  // Scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 5-second polling for new messages when tab is focused
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      interval = setInterval(async () => {
        const lastId = lastMessageIdRef.current;
        if (!lastId) return;

        try {
          const res = await fetch(`/api/letters/${conversationId}?since=${lastId}`, {
            cache: "no-store",
          });
          if (!res.ok) return;
          const json = await res.json();
          const newMsgs: LetterMessage[] = json.data ?? [];

          if (newMsgs.length > 0) {
            const ids = new Set(newMsgs.map((m) => m.id));
            setNewMessageIds((prev) => new Set([...prev, ...ids]));
            setMessages((prev) => [...prev, ...newMsgs]);
            lastMessageIdRef.current = newMsgs[newMsgs.length - 1].id;

            fetch(`/api/letters/${conversationId}/read`, { method: "POST" })
              .then(() => window.dispatchEvent(new Event("inkwell-nav-refresh")))
              .catch(() => {});
          }
        } catch {
          // silently ignore poll errors
        }
      }, 5000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [conversationId, router]);

  // Keep lastMessageIdRef current
  useEffect(() => {
    if (messages.length > 0) {
      lastMessageIdRef.current = messages[messages.length - 1].id;
    }
  }, [messages]);

  const handleDelete = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleUpdate = useCallback((id: string, updated: LetterMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? updated : m))
    );
  }, []);

  const loadOlderLetters = async () => {
    setLoadingOlder(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/letters/${conversationId}?page=${nextPage}`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data;
      setMessages((prev) => [...(data.messages ?? []), ...prev]);
      setHasMore(data.has_more);
      setPage(nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSent = useCallback((message: LetterMessage) => {
    setMessages((prev) => [...prev, message]);
    setNewMessageIds((prev) => new Set([...prev, message.id]));
    lastMessageIdRef.current = message.id;
    // Ensure we scroll to the new letter even if the user had scrolled up
    isAtBottomRef.current = true;
    router.refresh();
  }, [router]);

  return (
    <div className="letter-thread-container">
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <Link
          href="/letters"
          style={{
            color: "var(--muted)",
            textDecoration: "none",
            fontSize: "20px",
            lineHeight: "1",
            marginRight: "4px",
          }}
          title="Back to Letterbox"
        >
          ←
        </Link>

        <Avatar
          url={initialThread.other_user.avatar_url}
          name={initialThread.other_user.display_name}
          size={36}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontWeight: "600",
              fontSize: "15px",
              color: "var(--foreground)",
            }}
          >
            {initialThread.other_user.display_name}
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            <Link
              href={`/${initialThread.other_user.username}`}
              style={{ color: "var(--muted)", textDecoration: "none" }}
            >
              @{initialThread.other_user.username}
            </Link>
          </div>
        </div>

        {/* Write a letter button (desktop, hidden on narrow screens) */}
        <button
          type="button"
          className="letter-write-btn letter-write-btn-header"
          onClick={() => setComposeOpen(true)}
          title="Write a letter"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span>Write a letter</span>
        </button>
      </div>

      {/* Messages area — full-width, no sidebar */}
      <div className="letter-thread-body">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="letter-thread-messages"
          style={{
            background: `
              repeating-linear-gradient(
                90deg,
                transparent,
                transparent 40px,
                rgba(180,160,100,0.03) 40px,
                rgba(180,160,100,0.03) 41px
              ),
              var(--background)
            `,
          }}
        >
          {/* Load older letters */}
          {hasMore && (
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <button
                onClick={loadOlderLetters}
                disabled={loadingOlder}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: "9999px",
                  padding: "6px 16px",
                  fontSize: "12px",
                  color: "var(--muted)",
                  cursor: loadingOlder ? "default" : "pointer",
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  fontStyle: "italic",
                }}
              >
                {loadingOlder ? "Loading..." : "↑ Load older letters"}
              </button>
            </div>
          )}

          {/* Messages */}
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <LetterNote
                key={message.id}
                message={message}
                conversationId={conversationId}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                prefersReducedMotion={prefersReducedMotion}
                isNew={newMessageIds.has(message.id)}
                isEditing={editingMessageId === message.id}
                onStartEdit={(id) => setEditingMessageId(id)}
                onCancelEdit={() => setEditingMessageId(null)}
              />
            ))}
          </AnimatePresence>

          {messages.length === 0 && (
            <div className="letter-empty-state">
              <div className="letter-empty-icon" aria-hidden="true">
                <svg
                  width="44"
                  height="44"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <div className="letter-empty-heading">
                Begin your correspondence
              </div>
              <div className="letter-empty-sub">
                Pull out a sheet of stationery and write the first letter.
              </div>
              <button
                type="button"
                className="letter-write-btn letter-write-btn-empty"
                onClick={() => setComposeOpen(true)}
              >
                Write the first letter
              </button>
            </div>
          )}

          {/* Reply prompt — blank stationery waiting to be written on.
              Appended after the last message so the user's eyes land right on it. */}
          {messages.length > 0 && (
            <button
              type="button"
              className="letter-reply-prompt"
              onClick={() => setComposeOpen(true)}
              aria-label={`Write back to ${initialThread.other_user.display_name}`}
            >
              <div className="letter-reply-prompt-inner">
                <span className="letter-reply-prompt-label">Your turn</span>
                <span className="letter-reply-prompt-heading">
                  Write back to{" "}
                  <em>{initialThread.other_user.display_name}</em>
                </span>
                <span className="letter-reply-prompt-cta">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  Open a fresh sheet of stationery
                </span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Mobile: floating action button */}
      <button
        type="button"
        className="letter-write-fab"
        onClick={() => setComposeOpen(true)}
        aria-label="Write a letter"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      </button>

      {/* Stationery compose modal */}
      <StationeryModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        conversationId={conversationId}
        recipientDisplayName={initialThread.other_user.display_name}
        recipientUsername={initialThread.other_user.username}
        recipientAvatarUrl={initialThread.other_user.avatar_url}
        initialDraftHtml={draftHtml}
        onDraftChange={setDraftHtml}
        onSent={handleSent}
      />
    </div>
  );
}
