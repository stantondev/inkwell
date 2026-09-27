"use client";

import { useEffect, useRef } from "react";

// Same rule as ReadBeacon on an entry's own page: ten seconds on screen.
const READ_AFTER_MS = 10_000;
const TICK_MS = 1_000;

// Entries already reported during this visit (the server also counts each
// reader once a day, so this only saves requests).
const reported = new Set<string>();

/**
 * Counts reads of Inkwell entries read in the Feed or Explore. Most people
 * read there now (the whole entry is shown), so counting only on an entry's
 * own page told writers almost nobody read them.
 *
 * An element marked `data-read-entry="<entry id>"` counts as read once it has
 * been on screen for ten seconds in total while the tab is visible. "On
 * screen" means at least half of it is showing, or it fills at least half
 * the window (a long entry never fits). Reported the same way as ReadBeacon,
 * so the same privacy rules apply (see Inkwell.Reads).
 *
 * `watchKey` changes whenever the cards on the page change (more loaded,
 * layout switched), so new ones get picked up.
 */
export function useFeedReadCounter(watchKey: string) {
  const timeOnScreen = useRef(new Map<string, number>());

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const nearby = new Set<HTMLElement>();
    const observer = new IntersectionObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (r.isIntersecting) nearby.add(el);
        else nearby.delete(el);
      }
    });

    document.querySelectorAll<HTMLElement>("[data-read-entry]").forEach((el) => {
      if (!reported.has(el.dataset.readEntry ?? "")) observer.observe(el);
    });

    const onScreen = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
      const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (w <= 0 || h <= 0) return false;
      const mostlyInView = w * h >= 0.5 * r.width * r.height;
      const fillsWindow = h >= 0.5 * window.innerHeight && w >= 0.5 * r.width;
      return mostlyInView || fillsWindow;
    };

    const report = (id: string) => {
      reported.add(id);
      fetch(`/api/entries/${id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrer: `${window.location.origin}/` }),
        keepalive: true,
      }).catch(() => {});
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || nearby.size === 0) return;
      for (const el of Array.from(nearby)) {
        const id = el.dataset.readEntry;
        if (!id || reported.has(id)) {
          observer.unobserve(el);
          nearby.delete(el);
          continue;
        }
        if (!onScreen(el)) continue;
        const ms = (timeOnScreen.current.get(id) ?? 0) + TICK_MS;
        timeOnScreen.current.set(id, ms);
        if (ms >= READ_AFTER_MS) {
          report(id);
          observer.unobserve(el);
          nearby.delete(el);
        }
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
      observer.disconnect();
    };
  }, [watchKey]);
}
