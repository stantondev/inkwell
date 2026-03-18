"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { JournalEntryCard, type JournalEntry } from "./journal-entry-card";
import { FeedCardActions } from "./feed-card-actions";
import { MobileSwipeableCard } from "./mobile-swipeable-card";
import { packEntriesIntoSpreads } from "@/lib/page-packing";

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
}

export function JournalFeed({
  entries: initialEntries,
  page,
  basePath,
  loadMorePath,
  extraParams = "",
  emptyState,
  session,
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
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const mobileSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const isDesktop = !isMobile;

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

  if (entries.length === 0) return <>{emptyState}</>;

  // ─── Shared helpers ──────────────────────────────────────────────

  const inkingRef = useRef(new Set<string>());

  const toggleInk = useCallback(async (entryId: string, isRemote: boolean) => {
    if (!session?.isLoggedIn) return;
    if (inkingRef.current.has(entryId)) return;
    inkingRef.current.add(entryId);
    const path = isRemote ? `/api/remote-entries/${entryId}/ink` : `/api/entries/${entryId}/ink`;
    try {
      const res = await fetch(path, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => prev.map(e => e.id === entryId ? { ...e, my_ink: data.inked, ink_count: data.ink_count } : e));
      }
    } catch { /* silent */ } finally {
      inkingRef.current.delete(entryId);
    }
  }, [session?.isLoggedIn]);

  const toggleBookmark = useCallback(async (entryId: string) => {
    if (!session?.isLoggedIn) return;
    try {
      const res = await fetch(`/api/entries/${entryId}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setEntries(prev => prev.map(e => e.id === entryId ? { ...e, bookmarked: data.bookmarked } : e));
      }
    } catch { /* silent */ }
  }, [session?.isLoggedIn]);

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

  const renderCard = (entry: JournalEntry, bookMode = false) => {
    const isRemote = entry.source === "remote";
    const isOwnEntry = session ? entry.author.id === session.userId : false;
    const card = (
      <JournalEntryCard
        entry={entry}
        actions={session ? renderActions(entry) : undefined}
        translatedBody={translations[entry.id]?.translated_body ?? null}
        translatedTitle={translations[entry.id]?.translated_title ?? null}
        bookMode={bookMode}
      />
    );
    // Mobile vertical swipe: up = ink, down = bookmark
    if (isMobile && session?.isLoggedIn && !isOwnEntry) {
      return (
        <MobileSwipeableCard
          onSwipeUp={() => toggleInk(entry.id, isRemote)}
          onSwipeDown={() => toggleBookmark(entry.id)}
          upActive={entry.my_ink ?? false}
          downActive={entry.bookmarked ?? false}
          upLabel="Ink"
          downLabel="Bookmark"
        >
          {card}
        </MobileSwipeableCard>
      );
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
                  <div key={entry.id} className="journal-book-cell">
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
                    <div key={entry.id} className="journal-book-cell">
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
    <div className="mobile-book-wrapper">
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

      {/* Swipe hint — shown briefly on first visit */}
      <div className="mobile-book-swipe-hints">
        <span className="mobile-book-hint-left">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </span>
        <span className="mobile-book-hint-text">swipe to read</span>
        <span className="mobile-book-hint-right">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </span>
      </div>

      <div ref={mobileScrollRef} className="mobile-book-scroll">
        {entries.map((entry, idx) => (
          <div key={entry.id} className="mobile-book-page">
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
