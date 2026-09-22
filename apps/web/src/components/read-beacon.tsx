"use client";

import { useEffect } from "react";

// How long an entry has to be on screen before it counts as read.
const READ_AFTER_MS = 10_000;

/**
 * Tells Inkwell that someone read this entry, once they've had it on screen
 * for ten seconds (time in a background tab doesn't count). Only the site
 * that sent them here is shared, as a referrer; see Inkwell.Reads for how
 * readers are counted without being tracked.
 */
export function ReadBeacon({ entryId }: { entryId: string }) {
  useEffect(() => {
    let visibleMs = 0;
    let since = document.visibilityState === "visible" ? Date.now() : 0;
    let sent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      if (sent) return;
      sent = true;
      const body = JSON.stringify({ referrer: document.referrer || "" });
      fetch(`/api/entries/${entryId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    };

    const schedule = () => {
      clearTimeout(timer);
      if (sent || !since) return;
      timer = setTimeout(send, Math.max(0, READ_AFTER_MS - visibleMs));
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        since = Date.now();
        schedule();
      } else {
        if (since) visibleMs += Date.now() - since;
        since = 0;
        clearTimeout(timer);
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [entryId]);

  return null;
}
