"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { LETTERS_ARRIVED_EVENT } from "@/components/live-nav-counts";
import { Avatar } from "@/components/avatar";
import { NewLetterPicker } from "./new-letter-picker";
import type { ConversationPreview, LetterboxMeta } from "./page";

export type LetterboxFolder = "inbox" | "requests" | "archived";

interface Props {
  initialConversations: ConversationPreview[];
  initialFolder: LetterboxFolder;
  initialMeta: LetterboxMeta;
}

interface SearchHit {
  conversation_id: string;
  letter_id: string;
  other_user: { username: string; display_name: string; avatar_url: string | null };
  is_mine: boolean;
  body: string;
  inserted_at: string;
}

// Rendered in UTC on the server and the reader's own zone after hydration,
// so the two renders match (see letter-thread.tsx).
function formatPostmarkDate(dateStr: string | null, timeZone: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const day = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const now = Date.now();
  if (day(date) === day(new Date(now))) return "Today";
  if (day(date) === day(new Date(now - 86_400_000))) return "Yesterday";
  const diffDays = Math.floor((now - date.getTime()) / 86_400_000);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date);
}

// A short excerpt of `body` around the first match of `q`, split so the
// match can be highlighted.
function excerptAround(body: string, q: string): [string, string, string] {
  const i = body.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return [body.slice(0, 140), "", ""];
  const start = Math.max(0, i - 50);
  const end = Math.min(body.length, i + q.length + 80);
  return [
    (start > 0 ? "…" : "") + body.slice(start, i),
    body.slice(i, i + q.length),
    body.slice(i + q.length, end) + (end < body.length ? "…" : ""),
  ];
}

function EnvelopeCard({
  conv,
  index,
  prefersReducedMotion,
  timeZone,
}: {
  conv: ConversationPreview;
  index: number;
  prefersReducedMotion: boolean;
  timeZone: string;
}) {
  const [hovered, setHovered] = useState(false);
  const isUnread = conv.unread_count > 0;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: "easeOut" }}
    >
      <Link href={`/letters/${conv.id}`} style={{ display: "block", textDecoration: "none" }}>
        <motion.div
          onHoverStart={() => setHovered(true)}
          onHoverEnd={() => setHovered(false)}
          animate={prefersReducedMotion ? {} : { y: hovered ? -3 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            background: "var(--envelope-bg)",
            borderRadius: "8px",
            padding: "16px 20px",
            marginBottom: "12px",
            boxShadow: hovered
              ? `0 8px 24px var(--envelope-shadow-hover), 0 2px 8px var(--envelope-shadow)`
              : `0 2px 8px var(--envelope-shadow)`,
            transition: "box-shadow 0.2s ease",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {/* Envelope flap decoration (top edge fold) */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: `linear-gradient(90deg, var(--envelope-flap) 0%, var(--envelope-border) 50%, var(--envelope-flap) 100%)`,
              opacity: 0.6,
            }}
          />

          {/* Postage stamp: avatar */}
          <div
            style={{
              flexShrink: 0,
              width: "52px",
              height: "52px",
              borderRadius: "4px",
              border: "2px solid var(--envelope-border)",
              overflow: "hidden",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.3), 0 1px 3px var(--envelope-shadow)",
              background: "var(--envelope-stamp-bg)",
              position: "relative",
            }}
          >
            {conv.other_user.avatar_url ? (
              <img
                src={conv.other_user.avatar_url}
                alt={conv.other_user.display_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  color: "var(--envelope-stamp-initial)",
                  fontWeight: "600",
                }}
              >
                {conv.other_user.display_name[0]?.toUpperCase()}
              </div>
            )}
            {/* Stamp perforation dots */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                border: "2px dotted rgba(0,0,0,0.12)",
                borderRadius: "3px",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Letter content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <span
                style={{
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  fontSize: "15px",
                  fontWeight: isUnread ? "700" : "500",
                  color: "var(--envelope-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {conv.other_user.display_name}
                {conv.other_user.remote && (
                  <span className="letterbox-tag" title={conv.other_user.handle}>
                    fediverse
                  </span>
                )}
                {conv.muted && (
                  <span className="letterbox-tag" title="Muted: no notifications">
                    muted
                  </span>
                )}
                {conv.request === "incoming" && <span className="letterbox-tag letterbox-tag-request">request</span>}
                {conv.request === "outgoing" && (
                  <span className="letterbox-tag" title="Waiting for them to accept your letter">
                    waiting
                  </span>
                )}
              </span>

              {/* Postmark date */}
              <span
                style={{
                  flexShrink: 0,
                  fontSize: "11px",
                  color: "var(--envelope-text-muted)",
                  fontVariant: "small-caps",
                  letterSpacing: "0.05em",
                  border: "1px solid var(--envelope-border)",
                  borderRadius: "50%",
                  padding: "3px 7px",
                  lineHeight: "1",
                  whiteSpace: "nowrap",
                }}
              >
                {formatPostmarkDate(conv.last_message_at, timeZone)}
              </span>
            </div>

            <div
              style={{
                fontSize: "13px",
                color: isUnread ? "var(--envelope-text)" : "var(--envelope-text-muted)",
                marginTop: "4px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontStyle: conv.last_message ? "normal" : "italic",
                fontWeight: isUnread ? "500" : "400",
              }}
            >
              {conv.last_message
                ? conv.last_message.body
                : "No letters yet. Say hello!"}
            </div>
          </div>

          {/* Unread seal: wax dot */}
          {isUnread && (
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.06 + 0.2, type: "spring", stiffness: 300, damping: 20 }}
              style={{
                flexShrink: 0,
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 6px rgba(45,74,138,0.4)",
                position: "relative",
              }}
              title={`${conv.unread_count} unread`}
            >
              {/* Wax seal emboss effect */}
              <div
                aria-hidden="true"
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: "1.5px solid rgba(255,255,255,0.35)",
                }}
              />
              {conv.unread_count > 1 && (
                <span
                  style={{
                    position: "absolute",
                    fontSize: "9px",
                    fontWeight: "700",
                    color: "white",
                    lineHeight: "1",
                  }}
                >
                  {conv.unread_count > 9 ? "9+" : conv.unread_count}
                </span>
              )}
            </motion.div>
          )}
        </motion.div>
      </Link>
    </motion.div>
  );
}


const FOLDER_LABELS: Record<LetterboxFolder, string> = {
  inbox: "Letters",
  requests: "Requests",
  archived: "Archived",
};

export function Letterbox({ initialConversations, initialFolder, initialMeta }: Props) {
  const [folder, setFolder] = useState<LetterboxFolder>(initialFolder);
  const [conversations, setConversations] = useState(initialConversations);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [timeZone, setTimeZone] = useState("UTC");
  const [lettersFrom, setLettersFrom] = useState(initialMeta.letters_from);
  const [savingSetting, setSavingSetting] = useState(false);
  const [settingError, setSettingError] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const folderRef = useRef(folder);
  folderRef.current = folder;

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  const load = useCallback(async (which: LetterboxFolder) => {
    try {
      const res = await fetch(`/api/letters?folder=${which}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      // Ignore an answer for a tab you've already left.
      if (folderRef.current !== which) return;
      if (Array.isArray(json.data)) setConversations(json.data);
      if (json.meta) setMeta(json.meta);
    } catch {
      // keep what's shown
    } finally {
      if (folderRef.current === which) setLoading(false);
    }
  }, []);

  const switchFolder = (next: LetterboxFolder) => {
    if (next === folder) return;
    setFolder(next);
    folderRef.current = next;
    setLoading(true);
    load(next);
    // Keep the tab in the address so Back and sharing a link land on it.
    window.history.replaceState(null, "", next === "inbox" ? "/letters" : `/letters?tab=${next}`);
  };

  // Keep the list current: when a new letter arrives (the nav's 15-second
  // check announces it) and when you come back to the tab.
  useEffect(() => {
    const refresh = () => load(folderRef.current);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener(LETTERS_ARRIVED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(LETTERS_ARRIVED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  // Search the letters themselves, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/letters/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        setHits(Array.isArray(json.data) ? json.data : []);
      } catch {
        // aborted or offline
      }
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const q = query.trim().toLowerCase().replace(/^@/, "");
  const shown = useMemo(() => {
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.other_user.username.toLowerCase().includes(q) ||
        (c.other_user.display_name || "").toLowerCase().includes(q)
    );
  }, [conversations, q]);

  const saveLettersFrom = async (value: "pen_pals" | "anyone") => {
    if (value === lettersFrom || savingSetting) return;
    const previous = lettersFrom;
    setLettersFrom(value);
    setSavingSetting(true);
    setSettingError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { letters_from: value } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLettersFrom(previous);
      setSettingError("Couldn't save that. Please try again.");
    } finally {
      setSavingSetting(false);
    }
  };

  const tabCount = (f: LetterboxFolder) =>
    f === "requests" ? meta.counts.requests : f === "archived" ? meta.counts.archived : 0;

  const emptyText =
    folder === "requests"
      ? lettersFrom === "anyone"
        ? "No letter requests. When someone who isn't your pen pal writes to you, their letter waits here until you accept it."
        : "Only your pen pals can write to you, so there are no requests. You can change that below."
      : folder === "archived"
        ? "Nothing archived. Archive a conversation from its menu to tidy it away; it comes back when a new letter arrives."
        : null;

  return (
    <div>
      <div className="letterbox-toolbar">
        <input
          type="search"
          className="letterbox-search"
          placeholder="Search letters"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search names and letters"
        />
        <button type="button" className="letter-send-btn letterbox-new" onClick={() => setPickerOpen(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          New letter
        </button>
      </div>

      <div className="letterbox-tabs" role="tablist" aria-label="Letterbox">
        {(Object.keys(FOLDER_LABELS) as LetterboxFolder[]).map((f) => {
          const count = tabCount(f);
          const attention = f === "requests" && meta.counts.requests_unread > 0;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={folder === f}
              className={`letterbox-tab ${folder === f ? "letterbox-tab-active" : ""}`}
              onClick={() => switchFolder(f)}
            >
              {FOLDER_LABELS[f]}
              {count > 0 && (
                <span className={`letterbox-tab-count ${attention ? "letterbox-tab-count-new" : ""}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <NewLetterPicker open={pickerOpen} onClose={closePicker} />

      {hits && hits.length > 0 && (
        <section className="letterbox-hits" aria-label="Letters that mention your search">
          <h2 className="letterbox-hits-title">In your letters</h2>
          {hits.map((hit) => {
            const [before, match, after] = excerptAround(hit.body, query.trim());
            return (
              <Link
                key={hit.letter_id}
                href={`/letters/${hit.conversation_id}?letter=${hit.letter_id}`}
                className="letterbox-hit"
              >
                <Avatar url={hit.other_user.avatar_url} name={hit.other_user.display_name} size={28} />
                <span className="letterbox-hit-text">
                  <span className="letterbox-hit-who">
                    {hit.is_mine ? `You to ${hit.other_user.display_name}` : hit.other_user.display_name}
                    <span className="letterbox-hit-date">{formatPostmarkDate(hit.inserted_at, timeZone)}</span>
                  </span>
                  <span className="letterbox-hit-body">
                    {before}
                    {match && <mark>{match}</mark>}
                    {after}
                  </span>
                </span>
              </Link>
            );
          })}
        </section>
      )}
      {hits && hits.length === 0 && shown.length === 0 && (
        <p className="letterbox-note">No letters or names match “{query.trim()}”.</p>
      )}

      <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>
        <AnimatePresence mode="wait">
          {conversations.length === 0 && folder === "inbox" && !loading && meta.counts.requests > 0 ? (
            <motion.div key="requests-waiting" className="letterbox-note">
              {meta.counts.requests === 1
                ? "No letters yet, but one letter request is waiting for you."
                : `No letters yet, but ${meta.counts.requests} letter requests are waiting for you.`}{" "}
              <button type="button" className="letter-link-btn" style={{ color: "var(--accent)" }} onClick={() => switchFolder("requests")}>
                See requests
              </button>
            </motion.div>
          ) : conversations.length === 0 && folder === "inbox" && !loading ? (
            <motion.div
              key="empty"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                textAlign: "center",
                padding: "64px 24px",
                background: "var(--envelope-bg)",
                borderRadius: "12px",
                border: "1px dashed var(--envelope-border)",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px", filter: "grayscale(0.3)" }}>✉</div>
              <h2
                style={{
                  fontFamily: "var(--font-lora, Georgia, serif)",
                  fontSize: "20px",
                  fontWeight: "600",
                  color: "var(--envelope-text)",
                  marginBottom: "8px",
                }}
              >
                Your letterbox is empty
              </h2>
              <p style={{ fontSize: "14px", color: "var(--envelope-text-muted)", marginBottom: "24px" }}>
                Letters are private notes between pen pals. Write to one to get started.
              </p>
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  padding: "10px 20px",
                  borderRadius: "9999px",
                  background: "var(--accent)",
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Write a letter
              </button>
            </motion.div>
          ) : (
            <motion.div key={`list-${folder}`}>
              {conversations.length === 0 && emptyText && !loading && <p className="letterbox-note">{emptyText}</p>}
              {q && shown.length === 0 && conversations.length > 0 && !(hits && hits.length > 0) && (
                <p className="letterbox-note">No one here matches “{query.trim()}”.</p>
              )}
              {shown.map((conv, index) => (
                <EnvelopeCard
                  key={conv.id}
                  conv={conv}
                  index={index}
                  prefersReducedMotion={prefersReducedMotion}
                  timeZone={timeZone}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <section className="letterbox-setting" aria-labelledby="letters-from-title">
        <h2 id="letters-from-title">Who can write to you</h2>
        <div className="letterbox-segment" role="radiogroup" aria-labelledby="letters-from-title">
          {(
            [
              ["pen_pals", "Pen pals only"],
              ["anyone", "Anyone on Inkwell"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={lettersFrom === value}
              className={`letterbox-segment-btn ${lettersFrom === value ? "letterbox-segment-btn-on" : ""}`}
              onClick={() => saveLettersFrom(value)}
              disabled={savingSetting}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="letterbox-setting-help">
          {lettersFrom === "anyone"
            ? "Members who aren't your pen pals can send you one letter. It waits in Requests, without notifying you, until you accept it or reply. Declining is private."
            : "Only people you're pen pals with can write to you."}
        </p>
        {settingError && (
          <p className="letter-page-error" role="alert">
            {settingError}
          </p>
        )}
      </section>
    </div>
  );
}
