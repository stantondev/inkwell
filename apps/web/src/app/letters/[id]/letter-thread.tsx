"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { Avatar } from "@/components/avatar";
import type { LetterMessage, ThreadData } from "./page";

// Deterministic "random" rotation from message ID — gives each note a slight tilt
function seedRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  // Clamp to ±1.5 degrees
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

function LetterNote({
  message,
  conversationId,
  onDelete,
  prefersReducedMotion,
  isNew,
}: {
  message: LetterMessage;
  conversationId: string;
  onDelete: (id: string) => void;
  prefersReducedMotion: boolean;
  isNew: boolean;
}) {
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rotation = prefersReducedMotion ? 0 : seedRotation(message.id);

  const handleDelete = async () => {
    if (!confirm("Remove this letter from your side?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/letters/${conversationId}/messages/${message.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        onDelete(message.id);
      }
    } catch {
      setDeleting(false);
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
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
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
          transform: `rotate(${rotation}deg)`,
          transition: prefersReducedMotion ? "none" : "transform 0.2s ease",
        }}
      >
        {/* Drop shadow — looks like paper lifting slightly */}
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
            padding: "14px 18px",
            border: `1px solid ${message.is_mine ? "#c8d5f0" : "#e0d4b8"}`,
            // Ruled lines effect
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
          {/* Message body */}
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

          {/* Postmark timestamp */}
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
              }}
            >
              {formatMessageTime(message.inserted_at)}
            </span>

            {/* Delete button (own messages only) */}
            {message.is_mine && (
              <AnimatePresence>
                {showDelete && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "11px",
                      color: "#aa6666",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      opacity: deleting ? 0.5 : 1,
                    }}
                    title="Remove this letter"
                  >
                    ✕ remove
                  </motion.button>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface Props {
  initialThread: ThreadData;
  conversationId: string;
  currentUsername: string;
}

export function LetterThread({ initialThread, conversationId, currentUsername }: Props) {
  const [messages, setMessages] = useState<LetterMessage[]>(initialThread.messages);
  const [hasMore, setHasMore] = useState(initialThread.has_more);
  const [page, setPage] = useState(initialThread.page);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageIds, setNewMessageIds] = useState<Set<string>>(new Set());
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

            // Mark as read and refresh nav badge
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
            // Subtle aged-paper background
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
                prefersReducedMotion={prefersReducedMotion}
                isNew={newMessageIds.has(message.id)}
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

        {/* Compose area */}
        <ComposeArea
          conversationId={conversationId}
          onSend={(message) => {
            setMessages((prev) => [...prev, message]);
            setNewMessageIds((prev) => new Set([...prev, message.id]));
            lastMessageIdRef.current = message.id;
            // Refresh nav to update badge
            router.refresh();
          }}
          prefersReducedMotion={prefersReducedMotion}
        />
      </div>
    </div>
  );
}

function ComposeArea({
  conversationId,
  onSend,
  prefersReducedMotion,
}: {
  conversationId: string;
  onSend: (message: LetterMessage) => void;
  prefersReducedMotion: boolean;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MAX = 2000;

  const send = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/letters/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.errors?.body?.[0] ?? json.error ?? "Failed to send letter");
        return;
      }
      setBody("");
      onSend(json.data);
      // Re-focus after send
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch {
      setError("Failed to send letter — please try again");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  const charsUsed = body.length;
  const showCounter = charsUsed > MAX * 0.8;
  const isDisabled = !body.trim() || sending || charsUsed > MAX;

  return (
    <motion.div className="letter-compose-area">
      {/* Notepad top edge — the yellow strip */}
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
        <span style={{ fontSize: "10px", color: "var(--muted)", opacity: 0.7 }}>
          ⌘↵ to send
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

      <div className="letter-compose-body">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Dear friend..."
          maxLength={MAX}
          rows={5}
          style={{
            width: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "15px",
            lineHeight: "28px",
            fontFamily: "var(--font-lora, Georgia, serif)",
            color: "#1a100a",
            padding: "0",
          }}
        />
      </div>

      <div className="letter-compose-footer">
        {showCounter && (
          <span
            style={{
              fontSize: "11px",
              color: charsUsed >= MAX ? "var(--danger)" : "#8a7a4a",
              fontVariant: "small-caps",
            }}
          >
            {charsUsed}/{MAX}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <motion.button
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          onClick={send}
          disabled={isDisabled}
          style={{
            padding: "10px 22px",
            borderRadius: "9999px",
            background: isDisabled ? "#d4cbb8" : "var(--accent)",
            color: isDisabled ? "#9a9080" : "white",
            border: "none",
            cursor: isDisabled ? "not-allowed" : "pointer",
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
