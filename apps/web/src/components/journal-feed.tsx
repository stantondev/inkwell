"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { JournalEntryCard, type JournalEntry } from "./journal-entry-card";
import { FeedCardActions } from "./feed-card-actions";
import { DoubleTapInk } from "./double-tap-ink";
import { emitEntryState, useEntryState } from "@/lib/entry-state";
import { packEntriesIntoSpreads } from "@/lib/page-packing";
import { STICKY_SAVED_EVENT } from "./jot-composer";
import { ClassicFeed } from "./classic-feed";

interface TranslationData {
  translated_title: string | null;
  translated_body: string;
  source_language: string;
}

export interface FeedSession {
  userId: string;
  username: string;
  isLoggedIn: boolean;
  isPlus: boolean;
  isAdmin?: boolean;
  preferredLanguage?: string | null;
}

interface JournalFeedProps {
  entries: JournalEntry[];
  page: number;
  basePath: string;
  loadMorePath?: string;
  extraParams?: string;
  emptyState?: React.ReactNode;
  session?: FeedSession | null;
  /** Put stickies the viewer posts at the front of this feed as soon as they're posted. */
  showNewStickies?: boolean;
  /** "classic": the reader chose the 2004 view, a LiveJournal friends page. */
  look?: "modern" | "classic";
}

export function JournalFeed({
  entries: initialEntries,
  page,
  basePath,
  loadMorePath,
  extraParams = "",
  emptyState,
  session,
  showNewStickies = false,
  look = "modern",
}: JournalFeedProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [currentPage, setCurrentPage] = useState(page);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialEntries.length === 20);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [translations, setTranslations] = useState<Record<string, TranslationData>>({});
  const [isMobile, setIsMobile] = useState(true);
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSpreadIndex, setActiveSpreadIndex] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Mobile hooks (must be called unconditionally before any early returns)
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const mobileWrapperRef = useRef<HTMLDivElement>(null);
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const mobileSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isDesktop = !isMobile;

  // A sticky posted from the Jot composer shows up here right away; an edited
  // one is updated in place wherever it appears.
  useEffect(() => {
    function onSaved(e: Event) {
      const { entry, edited } = (e as CustomEvent<{ entry: JournalEntry; edited: boolean }>).detail;
      setEntries((prev) => {
        if (edited || prev.some((x) => x.id === entry.id)) {
          return prev.map((x) => (x.id === entry.id ? { ...x, ...entry, author: x.author } : x));
        }
        if (!showNewStickies) return prev;
        const fresh: JournalEntry = { ...entry, source: "local", comment_count: 0, stamps: [], ink_count: 0, reprint_count: 0 };
        return [fresh, ...prev];
      });
      if (!edited && showNewStickies) {
        scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
        mobileScrollRef.current?.scrollTo({ left: 0, behavior: "smooth" });
      }
    }
    window.addEventListener(STICKY_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(STICKY_SAVED_EVENT, onSaved);
  }, [showNewStickies]);

  const { refreshing, pullDistance } = usePullToRefresh({
    onRefresh: () => router.refresh(),
    enabled: isMobile,
  });

  const spreads = useMemo(() => packEntriesIntoSpreads(entries), [entries]);

  // Track active spread
  useEffect(() => {
    if (!isDesktop || !scrollRef.current) return;
    const container = scrollRef.current;
    const handleScroll = () => {
      const w = container.clientWidth;
      if (w === 0) return;
      setActiveSpreadIndex(Math.round(container.scrollLeft / w));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isDesktop]);

  // Keyboard nav
  useEffect(() => {
    if (!isDesktop) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const container = scrollRef.current;
        if (!container) return;
        container.scrollBy({
          left: (e.key === "ArrowRight" ? 1 : -1) * container.clientWidth,
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isDesktop, prefersReducedMotion]);

  // Auto-load more
  useEffect(() => {
    if (!isDesktop || !sentinelRef.current || !hasMore || !loadMorePath) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.5 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isDesktop, hasMore, loadMorePath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track active mobile page
  useEffect(() => {
    if (isDesktop || !mobileScrollRef.current) return;
    const container = mobileScrollRef.current;
    const handleScroll = () => {
      const w = container.clientWidth;
      if (w === 0) return;
      setMobileActiveIndex(Math.round(container.scrollLeft / w));
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [isDesktop]);

  // The phone reader. Entries used to scroll up and down inside a strip that
  // turned sideways, and phones (iPhones most) kept handing swipes that began
  // in the text to the entry's own scroll, so pages wouldn't turn unless you
  // swiped on the action bar (2026-09-25). Now there's one vertical scroller,
  // the page itself: each entry is its full length, the strip is as tall as
  // the page you're on, and sideways swipes are handled here. The first ~8px
  // decide: more sideways than up/down turns the page, anything else is an
  // ordinary page scroll. The strip is overflow: hidden, so the browser
  // never competes for sideways swipes.
  useEffect(() => {
    if (isDesktop) return;
    const track = mobileScrollRef.current;
    const wrapper = mobileWrapperRef.current;
    if (!track || !wrapper) return;

    const pages = () => Array.from(track.children) as HTMLElement[];
    const width = () => track.clientWidth || 1;
    const indexNow = () => Math.round(track.scrollLeft / width());
    let busy = false; // dragging or animating: leave the height alone

    // The strip is as tall as the page being read.
    const syncHeight = () => {
      if (busy) return;
      const page = pages()[indexNow()];
      if (page) track.style.height = `${page.offsetHeight}px`;
    };
    const ro = new ResizeObserver(syncHeight);
    pages().forEach((p) => ro.observe(p));
    syncHeight();

    // Where the reader's top should sit: just under the sticky top bar.
    const dockLine = () => {
      const bar = document.querySelector(".mobile-top-bar-shell");
      return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    };

    let active = false;
    let axis: "x" | "y" | null = null;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, startLeft = 0, from = 0, lift = 0;
    let frame = 0;

    // Leave sideways swipes alone inside things that scroll sideways
    // themselves (photo carousels, wide tables, code blocks).
    const inSidewaysScroller = (target: EventTarget | null) => {
      let el = target instanceof Element ? target : null;
      while (el && el !== track) {
        if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 2) {
          const ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    // Beginning a turn partway down a long entry: show the neighbours from
    // their tops, level with the top of the screen, not from the same depth.
    const beginTurn = () => {
      busy = true;
      from = indexNow();
      lift = Math.max(0, dockLine() - wrapper.getBoundingClientRect().top);
      const all = pages();
      let tallest = all[from]?.offsetHeight ?? 0;
      for (const i of [from - 1, from + 1]) {
        const p = all[i];
        if (!p) continue;
        p.style.transform = lift ? `translateY(${lift}px)` : "";
        tallest = Math.max(tallest, p.offsetHeight + lift);
      }
      track.style.height = `${tallest}px`;
    };
    const finishTurn = (to: number) => {
      pages().forEach((p) => { p.style.transform = ""; });
      busy = false;
      // The new page was showing from its top at the top of the screen; keep
      // it there now that the lift is gone.
      if (to !== from && lift) window.scrollBy(0, -lift);
      lift = 0;
      syncHeight();
    };
    const animateTo = (to: number) => {
      const target = Math.min(pages().length - 1, Math.max(0, to));
      const start = track.scrollLeft;
      const end = target * width();
      const t = performance.now();
      const ms = Math.min(320, Math.max(160, Math.abs(end - start) * 0.9));
      cancelAnimationFrame(frame);
      const step = (now: number) => {
        const k = Math.min(1, (now - t) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        track.scrollLeft = start + (end - start) * eased;
        if (k < 1) frame = requestAnimationFrame(step);
        else finishTurn(target);
      };
      frame = requestAnimationFrame(step);
    };

    const onStart = (e: TouchEvent) => {
      active = e.touches.length === 1 && !inSidewaysScroller(e.target);
      if (!active) return;
      axis = null;
      dx = 0;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = e.timeStamp;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const mx = e.touches[0].clientX - x0;
      const my = e.touches[0].clientY - y0;
      if (!axis) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (axis === "x") {
          cancelAnimationFrame(frame);
          if (!busy) beginTurn();
          startLeft = track.scrollLeft;
          x0 += mx > 0 ? 8 : -8; // no jump from the 8px dead zone
        }
      }
      if (axis !== "x") return;
      if (e.cancelable) e.preventDefault(); // no page scroll during a turn
      dx = e.touches[0].clientX - x0;
      track.scrollLeft = startLeft - dx;
    };
    const onEnd = (e: TouchEvent) => {
      if (!active || axis !== "x") { active = false; return; }
      active = false;
      const w = width();
      const speed = dx / Math.max(1, e.timeStamp - t0); // px per ms
      let to = from;
      if (dx < -w * 0.18 || (dx < -20 && speed < -0.35)) to = from + 1;
      else if (dx > w * 0.18 || (dx > 20 && speed > 0.35)) to = from - 1;
      animateTo(to);
    };

    // Trackpads and mice (a narrow window, a tablet with a keyboard): a
    // sideways scroll turns one page.
    let wheelSum = 0;
    let wheelLockUntil = 0;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (busy || e.timeStamp < wheelLockUntil) return;
      wheelSum += e.deltaX;
      if (Math.abs(wheelSum) > 40) {
        beginTurn();
        animateTo(from + (wheelSum > 0 ? 1 : -1));
        wheelSum = 0;
        wheelLockUntil = e.timeStamp + 500;
      }
    };

    // Keep the current page lined up when the width changes (rotation).
    const onResize = () => {
      if (busy) return;
      track.scrollLeft = indexNow() * width();
      syncHeight();
    };

    track.addEventListener("touchstart", onStart, { passive: true });
    track.addEventListener("touchmove", onMove, { passive: false });
    track.addEventListener("touchend", onEnd);
    track.addEventListener("touchcancel", onEnd);
    track.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      track.removeEventListener("touchstart", onStart);
      track.removeEventListener("touchmove", onMove);
      track.removeEventListener("touchend", onEnd);
      track.removeEventListener("touchcancel", onEnd);
      track.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [isDesktop, entries.length]);

  // Auto-load more on mobile
  useEffect(() => {
    if (isDesktop || !mobileSentinelRef.current || !hasMore || !loadMorePath) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.5 }
    );
    observer.observe(mobileSentinelRef.current);
    return () => observer.disconnect();
  }, [isDesktop, hasMore, loadMorePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !loadMorePath) return;
    setLoading(true);
    try {
      const nextPage = currentPage + 1;
      const sep = loadMorePath.includes("?") ? "&" : "?";
      const res = await fetch(`${loadMorePath}${sep}page=${nextPage}`);
      if (res.ok) {
        const { data } = await res.json();
        if (!data || data.length < 20) setHasMore(false);
        if (data && data.length > 0) {
          setEntries((prev) => {
            const ids = new Set(prev.map((e) => e.id));
            return [...prev, ...data.filter((e: JournalEntry) => !ids.has(e.id))];
          });
          setCurrentPage(nextPage);
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [loading, hasMore, currentPage, loadMorePath]);

  // ─── Shared helpers ──────────────────────────────────────────────

  const inkingRef = useRef(new Set<string>());
  const feedSelf = useRef({}).current;

  // Keep the feed's copy of each entry in step with the Ink/Bookmark buttons,
  // so a double-tap after a button tap starts from the right state.
  useEntryState(null, (patch, id) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, feedSelf);

  // Double-tap only ever adds an ink. Already inked: the splash plays, nothing is sent.
  const inkEntry = useCallback(async (entry: JournalEntry) => {
    if (!session?.isLoggedIn || entry.my_ink || inkingRef.current.has(entry.id)) return;
    inkingRef.current.add(entry.id);
    const before = { my_ink: false, ink_count: entry.ink_count ?? 0 };
    const optimistic = { my_ink: true, ink_count: before.ink_count + 1 };
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...optimistic } : e)));
    emitEntryState(entry.id, optimistic, feedSelf);
    const path = entry.source === "remote" ? `/api/remote-entries/${entry.id}/ink` : `/api/entries/${entry.id}/ink`;
    let settled = before;
    try {
      const res = await fetch(path, { method: "POST", cache: "no-store" });
      if (res.ok) {
        const { data } = await res.json();
        settled = { my_ink: data.inked, ink_count: data.ink_count };
      }
    } catch { /* revert below */ } finally {
      inkingRef.current.delete(entry.id);
    }
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...settled } : e)));
    emitEntryState(entry.id, settled, feedSelf);
  }, [session?.isLoggedIn, feedSelf]);

  // The "swipe · double-tap" hint shows on the first few visits only.
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    // isMobile starts true before the first measurement; check the real width.
    if (!isMobile || window.innerWidth >= 1024) return;
    try {
      const seen = Number(localStorage.getItem("inkwell-reader-hint") || "0");
      if (seen < 3) {
        setShowHint(true);
        localStorage.setItem("inkwell-reader-hint", String(seen + 1));
      }
    } catch { /* storage unavailable: skip the hint */ }
  }, [isMobile]);

  // Must come after every hook above: returning earlier changed the number of
  // hooks between renders, which crashes React when the list goes from empty
  // to non-empty (or back).
  if (entries.length === 0) return <>{emptyState}</>;

  function handleTranslation(entryId: string, translation: TranslationData | null) {
    setTranslations((prev) => {
      if (translation) return { ...prev, [entryId]: translation };
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  }

  function renderActions(entry: JournalEntry) {
    const isRemote = entry.source === "remote";
    const entryHref = isRemote
      ? (entry.url ?? `/${entry.author.username}/${entry.id}`)
      : `/${entry.author.username}/${entry.slug ?? entry.id}`;
    const isOwnEntry = session ? entry.author.id === session.userId : false;

    return (
      <FeedCardActions
        entryId={entry.id}
        entryHref={entryHref}
        commentCount={entry.comment_count ?? 0}
        stamps={entry.stamps ?? []}
        myStamp={entry.my_stamp ?? null}
        bookmarked={entry.bookmarked ?? false}
        inkCount={entry.ink_count ?? 0}
        myInk={entry.my_ink ?? false}
        reprintCount={entry.reprint_count ?? 0}
        myReprint={entry.my_reprint ?? false}
        isOwnEntry={isOwnEntry}
        isLoggedIn={session?.isLoggedIn ?? false}
        isPlus={session?.isPlus ?? false}
        isRemote={isRemote}
        entryTitle={entry.title}
        entryAuthorUsername={entry.author.username}
        preferredLanguage={session?.preferredLanguage}
        sessionUser={session ? { id: session.userId, username: session.username, is_admin: session.isAdmin } : null}
        onTranslation={(t) => handleTranslation(entry.id, t)}
        {...(isRemote
          ? {
              stampApiPath: `/api/remote-entries/${entry.id}/stamp`,
              commentApiPath: `/api/remote-entries/${entry.id}/comments`,
              inkApiPath: `/api/remote-entries/${entry.id}/ink`,
              externalUrl: entry.url,
              externalDomain: entry.author.domain,
            }
          : {})}
      />
    );
  }
  if (look === "classic") {
    return (
      <ClassicFeed
        entries={entries}
        renderActions={renderActions}
        translations={translations}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={loadMorePath ? loadMore : undefined}
      />
    );
  }


  const renderCard = (entry: JournalEntry, bookMode = false) => {
    const isOwnEntry = session ? entry.author.id === session.userId : false;
    const card = (
      <JournalEntryCard
        entry={entry}
        actions={session ? renderActions(entry) : undefined}
        translatedBody={translations[entry.id]?.translated_body ?? null}
        translatedTitle={translations[entry.id]?.translated_title ?? null}
        bookMode={bookMode}
        isOwn={isOwnEntry}
      />
    );
    // Mobile: double-tap the page to ink it
    if (isMobile && session?.isLoggedIn && !isOwnEntry) {
      return <DoubleTapInk onInk={() => inkEntry(entry)}>{card}</DoubleTapInk>;
    }
    return card;
  };

  const goToSpread = (idx: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: idx * scrollRef.current.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  // ─── Desktop: Horizontal Book Spread ──────────────────────────────
  if (isDesktop) {
    const totalSpreads = spreads.length;

    return (
      <div className="journal-book-wrapper">
        <div ref={scrollRef} className="journal-book-container">
          {spreads.map((spread, idx) => (
            <div key={idx} className="journal-book-spread">
              {/* Left page */}
              <div className="journal-book-half journal-book-half-left">
                {spread.left.map((entry) => (
                  <div key={entry.id} className={`journal-book-cell${entry.kind === "sticky" ? " journal-book-cell-sticky" : ""}`}>
                    {renderCard(entry, true)}
                  </div>
                ))}
              </div>

              {/* Spine */}
              <div className="journal-book-spine" />

              {/* Right page */}
              <div className="journal-book-half journal-book-half-right">
                {spread.right.length > 0 ? (
                  spread.right.map((entry) => (
                    <div key={entry.id} className={`journal-book-cell${entry.kind === "sticky" ? " journal-book-cell-sticky" : ""}`}>
                      {renderCard(entry, true)}
                    </div>
                  ))
                ) : (
                  <div className="journal-book-cell journal-book-cell-empty">
                    <p style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic", color: "var(--muted)", fontSize: "15px" }}>
                      The next page awaits...
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Load-more sentinel */}
          {hasMore && loadMorePath && (
            <div ref={sentinelRef} className="journal-book-spread journal-book-sentinel">
              <div className="journal-book-sentinel-inner">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ background: "var(--accent)", color: "#fff", opacity: loading ? 0.6 : 1, fontFamily: "var(--font-lora, Georgia, serif)" }}
                >
                  {loading ? "Loading..." : "Turn the page..."}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nav arrows */}
        {totalSpreads > 1 && (
          <>
            {activeSpreadIndex > 0 && (
              <button onClick={() => goToSpread(activeSpreadIndex - 1)} className="journal-book-nav journal-book-nav-prev" aria-label="Previous spread">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            {activeSpreadIndex < totalSpreads - 1 && (
              <button onClick={() => goToSpread(activeSpreadIndex + 1)} className="journal-book-nav journal-book-nav-next" aria-label="Next spread">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            )}
          </>
        )}

        {/* Page counter */}
        {totalSpreads > 1 && (
          <div className="journal-book-counter">
            <span>{activeSpreadIndex + 1}</span>
            <span className="journal-book-counter-sep">&mdash;</span>
            <span>{totalSpreads}</span>
          </div>
        )}
      </div>
    );
  }

  // ─── Mobile: Horizontal Scroll-Snap (matching desktop book feel) ─────
  return (
    <div ref={mobileWrapperRef} className="mobile-book-wrapper">
      {/* Pull-to-refresh */}
      {pullDistance > 0 || refreshing ? (
        <div className="pull-to-refresh-indicator" style={{ height: pullDistance || (refreshing ? 40 : 0), position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
          {refreshing ? (
            <svg className="pull-to-refresh-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: `rotate(${Math.min(pullDistance / 40 * 180, 180)}deg)`, transition: "transform 0.1s" }}>
              <polyline points="7 13 12 18 17 13" /><line x1="12" y1="6" x2="12" y2="18" />
            </svg>
          )}
        </div>
      ) : null}

      {/* Gesture hint — first few visits only */}
      {showHint && (
        <div className="mobile-book-swipe-hints" aria-hidden="true">
          <span>swipe for the next page</span>
          {session?.isLoggedIn && <><span className="mobile-book-hint-dot">·</span><span>double-tap to ink</span></>}
        </div>
      )}

      <div ref={mobileScrollRef} className="mobile-book-scroll">
        {entries.map((entry) => (
          <div key={entry.id} className={`mobile-book-page${entry.kind === "sticky" ? " mobile-book-page-sticky" : ""}`}>
            {renderCard(entry, true)}
          </div>
        ))}

        {/* Load-more sentinel */}
        {hasMore && loadMorePath && (
          <div ref={mobileSentinelRef} className="mobile-book-page mobile-book-sentinel">
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <button
                onClick={loadMore}
                disabled={loading}
                className="rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "#fff", opacity: loading ? 0.6 : 1, fontFamily: "var(--font-lora, Georgia, serif)" }}
              >
                {loading ? "Loading..." : "Turn the page..."}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Page counter */}
      {entries.length > 1 && (
        <div className="mobile-book-counter">
          <span>{mobileActiveIndex + 1}</span>
          <span style={{ opacity: 0.4, margin: "0 6px" }}>&mdash;</span>
          <span>{entries.length}</span>
        </div>
      )}
    </div>
  );
}
