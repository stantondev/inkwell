"use client";

// "This month on Inkwell" (writers to meet, most inked, popular tags) tucked
// behind a ribbon bookmark instead of taking a page of the book. Until
// 2026-09-28 it was the cover of Explore's book: the whole left page of the
// first spread on a computer and the whole first page on a phone, so the
// writing started a page late. Now the book opens on writing, and the ribbon
// (hanging from the top edge of the book on a computer, beside the search box
// on a phone) opens it as a paper insert. It opens by itself once, on a
// reader's first visit, with a note saying how to close it and bring it back.
//
// The provider owns the panel; the two ribbons only toggle it, so they can
// sit anywhere inside it (one lives in JournalFeed's book, one in the header).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const SEEN_KEY = "inkwell-explore-ribbon-seen";

interface RibbonState {
  open: boolean;
  toggle: (from: HTMLElement | null) => void;
}

const RibbonContext = createContext<RibbonState | null>(null);

export function ExploreRibbonProvider({
  children,
  panel,
  serverSeen,
  signedIn,
}: {
  children: React.ReactNode;
  /** The insert's contents (ExploreCover). */
  panel: React.ReactNode;
  /** Signed in and already shown once on some device. */
  serverSeen: boolean;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [phone, setPhone] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // First visit: unfold it once, with the note. Remembered per browser, and
  // on the account for signed-in readers so a second device doesn't repeat it.
  useEffect(() => {
    let seen = serverSeen;
    try {
      if (localStorage.getItem(SEEN_KEY) === "true") seen = true;
    } catch { /* storage unavailable: rely on the account */ }
    if (seen) return;
    const t = window.setTimeout(() => {
      setFirstTime(true);
      setOpen(true);
      try { localStorage.setItem(SEEN_KEY, "true"); } catch { /* ignore */ }
      if (signedIn) {
        fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { explore_ribbon_seen: true } }),
        }).catch(() => {});
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [serverSeen, signedIn]);

  const close = useCallback(() => {
    setOpen(false);
    setFirstTime(false);
    openerRef.current?.focus({ preventScroll: true });
  }, []);

  const toggle = useCallback((from: HTMLElement | null) => {
    openerRef.current = from;
    if (open) close();
    else setOpen(true);
  }, [open, close]);

  // Desktop: hang the insert just left of the ribbon on the book's edge.
  useEffect(() => {
    if (!open || phone) return;
    const place = () => {
      const ribbon = document.querySelector<HTMLElement>(".explore-ribbon");
      const r = ribbon?.getBoundingClientRect();
      const top = Math.max(12, (r?.top ?? 80) + 14);
      const right = r ? Math.max(12, window.innerWidth - r.left + 10) : 24;
      setPos({ top, right, maxHeight: window.innerHeight - top - 16 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [open, phone]);

  // Esc closes; so does a click outside the insert (not on a ribbon, which
  // toggles it itself).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || panelRef.current?.contains(t) || t.closest("[data-explore-ribbon]")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  // The phone sheet holds the page still underneath it.
  useEffect(() => {
    if (!open || !phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, phone]);

  // Opened by hand: put the keyboard in it. Opened by itself: leave focus
  // alone. (Waits for the insert to be placed; it isn't rendered before.)
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!open) { focusedRef.current = false; return; }
    if (firstTime || focusedRef.current || !panelRef.current) return;
    focusedRef.current = true;
    panelRef.current.querySelector<HTMLElement>(".explore-insert-close")?.focus({ preventScroll: true });
  }, [open, firstTime, pos, phone]);

  const insert = (
    <>
      {phone && <div className="explore-insert-scrim" aria-hidden="true" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={phone}
        aria-labelledby="explore-cover-title"
        className={`explore-insert${phone ? " is-sheet" : ""}`}
        style={!phone && pos ? { top: pos.top, right: pos.right, maxHeight: pos.maxHeight } : undefined}
      >
        {phone && <div className="explore-insert-handle" aria-hidden="true" />}
        <button type="button" className="explore-insert-close" onClick={close} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="explore-insert-scroll">
          {firstTime && (
            <div className="explore-insert-note" role="note">
              <p>
                <strong>Tucked in for you:</strong> writers to meet, this month&rsquo;s
                most-inked entries and popular tags. Close it whenever you like.{" "}
                {phone
                  ? "The ribbon beside the search box brings it back."
                  : "The ribbon on the edge of the page brings it back."}
              </p>
              <button type="button" onClick={() => setFirstTime(false)}>Got it</button>
            </div>
          )}
          {panel}
        </div>
      </div>
    </>
  );

  return (
    <RibbonContext.Provider value={{ open, toggle }}>
      {children}
      {mounted && open && (phone || pos) ? createPortal(insert, document.body) : null}
    </RibbonContext.Provider>
  );
}

/** The ribbon on the book's top edge (computer). */
export function ExploreRibbonTab() {
  const ctx = useContext(RibbonContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-explore-ribbon
      className={`explore-ribbon${ctx.open ? " is-open" : ""}`}
      aria-expanded={ctx.open}
      aria-label="This month on Inkwell: writers to meet, most inked, popular tags"
      onClick={(e) => ctx.toggle(e.currentTarget)}
    >
      <span className="ribbon-silk" aria-hidden="true" />
      <span className="explore-ribbon-fleuron" aria-hidden="true">{"❦\uFE0E"}</span>
      <span className="explore-ribbon-text" aria-hidden="true">This month</span>
    </button>
  );
}

/** The same ribbon, small, beside the search box (phones). */
export function ExploreRibbonChip() {
  const ctx = useContext(RibbonContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      data-explore-ribbon
      className={`explore-ribbon-chip${ctx.open ? " is-open" : ""}`}
      aria-expanded={ctx.open}
      aria-label="This month on Inkwell: writers to meet, most inked, popular tags"
      onClick={(e) => ctx.toggle(e.currentTarget)}
    >
      <span className="ribbon-silk" aria-hidden="true" />
      <span aria-hidden="true">{"❦\uFE0E"}</span>
    </button>
  );
}
