"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Avatar } from "@/components/avatar";
import { LetterEditor } from "@/components/letter-editor";
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
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editHtmlRef = useRef(message.body_html || message.body || "");
  const rotation = prefersReducedMotion ? 0 : seedRotation(message.id);

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
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
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
                  {showActions && (
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
// ResizeHandle — draggable divider between messages and compose
// ---------------------------------------------------------------------------

function ResizeHandle({
  onResize,
}: {
  onResize: (deltaX: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      startXRef.current = e.clientX;

      const handleMouseMove = (ev: MouseEvent) => {
        const delta = startXRef.current - ev.clientX;
        startXRef.current = ev.clientX;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onResize]
  );

  return (
    <div
      className={`letter-resize-handle ${dragging ? "dragging" : ""}`}
      onMouseDown={handleMouseDown}
    />
  );
}

// ---------------------------------------------------------------------------
// ComposeArea — TipTap rich text compose
// ---------------------------------------------------------------------------

function ComposeArea({
  conversationId,
  onSend,
  prefersReducedMotion,
  composeWidth,
  expanded,
  onToggleExpand,
}: {
  conversationId: string;
  onSend: (message: LetterMessage) => void;
  prefersReducedMotion: boolean;
  composeWidth: number | null;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const htmlRef = useRef("");
  const editorKeyRef = useRef(0);

  const send = async () => {
    const html = htmlRef.current;
    // Check if content is empty (just empty p tags)
    const stripped = html.replace(/<[^>]*>/g, "").trim();
    if (!stripped || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/letters/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_html: html }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.errors?.body?.[0] ?? json.error ?? "Failed to send letter");
        return;
      }
      htmlRef.current = "";
      editorKeyRef.current += 1;
      onSend(json.data);
    } catch {
      setError("Failed to send letter — please try again");
    } finally {
      setSending(false);
    }
  };

  const widthStyle = composeWidth
    ? { width: `${expanded ? Math.max(composeWidth, 500) : composeWidth}px` }
    : expanded
    ? { width: "60%" }
    : undefined;

  return (
    <motion.div
      className="letter-compose-area"
      style={widthStyle}
    >
      {/* Notepad header */}
      <div className="letter-compose-header">
        <span
          style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontStyle: "italic",
            fontSize: "13px",
            color: "#8a7a4a",
          }}
        >
          Write a letter&hellip;
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            className="letter-compose-expand-btn"
            onClick={onToggleExpand}
            title={expanded ? "Collapse compose" : "Expand compose"}
          >
            {expanded ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
          <span style={{ fontSize: "10px", color: "var(--muted)", opacity: 0.7 }}>
            ⌘↵ to send
          </span>
        </span>
      </div>

      {error && (
        <div
          style={{
            margin: "0 18px 8px",
            fontSize: "12px",
            color: "var(--danger)",
            padding: "6px 10px",
            background: "rgba(220,38,38,0.08)",
            borderRadius: "6px",
          }}
        >
          {error}
        </div>
      )}

      <div className="letter-compose-body" style={{ flex: 1, overflow: "auto" }}>
        <LetterEditor
          key={editorKeyRef.current}
          content=""
          onChange={(html) => { htmlRef.current = html; }}
          onSubmit={send}
          autoFocus
        />
      </div>

      <div className="letter-compose-footer">
        <div style={{ flex: 1 }} />
        <motion.button
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          onClick={send}
          disabled={sending}
          style={{
            padding: "10px 22px",
            borderRadius: "9999px",
            background: sending ? "#d4cbb8" : "var(--accent)",
            color: sending ? "#9a9080" : "white",
            border: "none",
            cursor: sending ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "600",
            fontFamily: "var(--font-lora, Georgia, serif)",
            transition: "background 0.2s, color 0.2s, transform 0.1s",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            whiteSpace: "nowrap",
          }}
        >
          {sending ? (
            "Sending..."
          ) : (
            <>
              Seal &amp; Send <span style={{ fontSize: "16px" }}>✉</span>
            </>
          )}
        </motion.button>
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

const COMPOSE_MIN = 280;
const COMPOSE_MAX = 600;
const COMPOSE_DEFAULT = 340;
const COMPOSE_STORAGE_KEY = "inkwell-compose-width";

export function LetterThread({ initialThread, conversationId, currentUsername }: Props) {
  const [messages, setMessages] = useState<LetterMessage[]>(initialThread.messages);
  const [hasMore, setHasMore] = useState(initialThread.has_more);
  const [page, setPage] = useState(initialThread.page);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [composeExpanded, setComposeExpanded] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(
    messages.length > 0 ? messages[messages.length - 1].id : null
  );
  const isAtBottomRef = useRef(true);
  const router = useRouter();

  // Compose width from localStorage
  const [composeWidth, setComposeWidth] = useState<number | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem(COMPOSE_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed >= COMPOSE_MIN && parsed <= COMPOSE_MAX) {
        setComposeWidth(parsed);
      }
    }
  }, []);

  const handleResize = useCallback((delta: number) => {
    setComposeWidth((prev) => {
      const current = prev ?? COMPOSE_DEFAULT;
      const next = Math.min(COMPOSE_MAX, Math.max(COMPOSE_MIN, current + delta));
      localStorage.setItem(COMPOSE_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
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

        <div>
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
      </div>

      {/* Desktop: side-by-side layout  |  Mobile: stacked */}
      <div className="letter-thread-body">
        {/* Message thread */}
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
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--muted)",
                fontFamily: "var(--font-lora, Georgia, serif)",
                fontStyle: "italic",
                fontSize: "15px",
              }}
            >
              The envelope is empty — write the first letter!
            </div>
          )}
        </div>

        {/* Resize handle (desktop only) */}
        <ResizeHandle onResize={handleResize} />

        {/* Compose area */}
        <ComposeArea
          conversationId={conversationId}
          onSend={(message) => {
            setMessages((prev) => [...prev, message]);
            setNewMessageIds((prev) => new Set([...prev, message.id]));
            lastMessageIdRef.current = message.id;
            router.refresh();
          }}
          prefersReducedMotion={prefersReducedMotion}
          composeWidth={composeWidth}
          expanded={composeExpanded}
          onToggleExpand={() => setComposeExpanded((p) => !p)}
        />
      </div>
    </div>
  );
}
