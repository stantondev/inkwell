"use client";

import { useEffect } from "react";

// Remembers how far the reader has read their Feed (settings.feed_seen_at, so
// it follows them between devices), which is what "New" and "N new since your
// last visit" compare against. Saved after a few seconds on the page, so a
// quick reload doesn't clear the marks before anyone has seen them.
export function FeedSeen({ newest, seenAt }: { newest: string | null; seenAt: string | null }) {
  useEffect(() => {
    if (!newest) return;
    if (seenAt && Date.parse(seenAt) >= Date.parse(newest)) return;
    const t = window.setTimeout(() => {
      fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { feed_seen_at: newest } }),
      }).catch(() => {});
    }, 5000);
    return () => window.clearTimeout(t);
  }, [newest, seenAt]);

  return null;
}
