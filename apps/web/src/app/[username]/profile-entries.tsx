"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { EntryContent } from "@/components/entry-content";
import { MusicPlayer } from "@/components/music-player";
import { StampDisplay } from "@/components/stamp-display";
import { getMusicLabel } from "@/lib/music";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";
import { decodeEntities } from "@/lib/decode-entities";
import type { ProfileStyles } from "@/lib/profile-styles";

interface ProfileEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  stamps?: string[];
  comment_count?: number;
  published_at: string;
  word_count?: number;
  excerpt?: string | null;
  cover_image_id?: string | null;
  category?: string | null;
}

interface ProfileFilters {
  q: string;
  category: string | null;
  tag: string | null;
  year: number | null;
  sort: "newest" | "oldest";
}

interface ProfileEntriesProps {
  username: string;
  displayMode: "full" | "cards" | "preview";
  initialEntries: ProfileEntry[];
  totalCount: number;
  styles: ProfileStyles;
  filters?: ProfileFilters;
}

const PER_PAGE: Record<string, number> = {
  full: 1,
  cards: 9,
  preview: 20,
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readingTime(wordCount?: number): string | null {
  if (!wordCount || wordCount <= 0) return null;
  const mins = Math.max(1, Math.round(wordCount / 200));
  return `${mins} min read`;
}

// --- Pagination ---

function Pagination({
  page,
  totalPages,
  onPageChange,
  styles,
  mode,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  styles: ProfileStyles;
  mode: string;
}) {
  if (totalPages <= 1) return null;

  // Build page numbers with ellipsis
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  // Full post mode gets journal-style "Previous Entry / Next Entry"
  if (mode === "full") {
    return (
      <div className="flex items-center justify-between py-4">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1.5 text-sm font-medium transition-opacity disabled:opacity-30"
          style={{ color: styles.accent }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Previous Entry
        </button>
        <span className="text-xs" style={{ color: styles.muted, fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Entry {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1.5 text-sm font-medium transition-opacity disabled:opacity-30"
          style={{ color: styles.accent }}
        >
          Next Entry
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-1.5 rounded transition-opacity disabled:opacity-30"
        style={{ color: styles.muted }}
        aria-label="Previous page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs" style={{ color: styles.muted }}>...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[28px] h-7 rounded text-xs font-medium transition-colors ${
              p === page ? "text-white" : ""
            }`}
            style={
              p === page
                ? { background: styles.accent, color: "#fff" }
                : { color: styles.muted }
            }
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-1.5 rounded transition-opacity disabled:opacity-30"
        style={{ color: styles.muted }}
        aria-label="Next page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}

// --- Full Post Display ---

function FullPostEntry({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const rt = readingTime(entry.word_count);

  return (
    <article className={`profile-widget-card ${styles.borderRadius} border overflow-hidden`} style={styles.surface}>
      {/* Cover image */}
      {entry.cover_image_id && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 420 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${entry.cover_image_id}`}
            alt={entry.title ?? "Entry cover"}
            className="w-full object-cover"
            style={{ maxHeight: 420 }}
            loading="lazy"
          />
        </div>
      )}

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Date */}
        <time
          className="block text-xs mb-4 tracking-wide uppercase"
          style={{ color: styles.muted, fontFamily: "var(--font-lora, Georgia, serif)", letterSpacing: "0.06em" }}
          dateTime={entry.published_at}
        >
          {formatDate(entry.published_at)}
        </time>

        {/* Title */}
        {entry.title && (
          <h2 className="profile-entry-title text-2xl sm:text-3xl font-bold mb-4 leading-snug"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            <Link href={href} className="hover:underline">{entry.title}</Link>
          </h2>
        )}

        {/* Meta chips */}
        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs" style={{ color: styles.muted }}>
          {rt && <span>{rt}</span>}
          {entry.category && (
            <Link
              href={`/category/${getCategorySlug(entry.category)}`}
              className="px-2.5 py-0.5 rounded-full border transition-colors hover:opacity-80"
              style={{ borderColor: styles.accent, color: styles.accent }}
            >
              {getCategoryLabel(entry.category)}
            </Link>
          )}
          {entry.mood && (
            <span className="px-2.5 py-0.5 rounded-full border" style={{ borderColor: styles.border }}>
              {entry.mood}
            </span>
          )}
          {entry.music && (
            <span className="truncate max-w-[200px]">♪ {getMusicLabel(entry.music)}</span>
          )}
          {entry.stamps && entry.stamps.length > 0 && (
            <div className="ml-auto">
              <StampDisplay stamps={entry.stamps} size={22} />
            </div>
          )}
        </div>

        {/* Full body content */}
        <EntryContent html={entry.body_html} entryId={entry.id} className="prose-entry text-sm sm:text-base leading-relaxed" />

        {/* Music embed */}
        <MusicPlayer music={entry.music} />

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-6">
            {entry.tags.map((tag) => (
              <Link key={tag} href={`/tag/${tag}`}
                className="profile-tag-chip text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-accent"
                style={{ borderColor: styles.border, color: styles.muted }}>
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: styles.border }}>
          <Link href={href} className="text-sm font-medium hover:underline" style={{ color: styles.accent }}>
            Permalink
          </Link>
          <Link href={`${href}#comments`} className="flex items-center gap-1.5 text-sm" style={{ color: styles.muted }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {entry.comment_count ?? 0}
          </Link>
        </div>
      </div>
    </article>
  );
}

// --- Cards Display ---

function CardEntry({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const rt = readingTime(entry.word_count);
  const hasImage = !!entry.cover_image_id;
  const hasTitle = !!entry.title;

  // Show more body text when image/title are absent to fill the card
  const excerptClamp = hasImage && hasTitle
    ? "line-clamp-4"
    : hasImage
      ? "line-clamp-5"
      : hasTitle
        ? "line-clamp-[8]"
        : "line-clamp-[12]";

  return (
    <article className={`profile-widget-card profile-entry-item ${styles.borderRadius} border overflow-hidden flex flex-col h-full`} style={styles.surface}>
      {/* Cover image */}
      {entry.cover_image_id && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 200 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/images/${entry.cover_image_id}`}
            alt={entry.title ?? "Entry cover"}
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
            loading="lazy"
          />
        </div>
      )}

      <div className="p-3 sm:p-4 flex flex-col flex-1">
        {/* Stamps */}
        {entry.stamps && entry.stamps.length > 0 && (
          <div className="flex justify-end mb-1">
            <StampDisplay stamps={entry.stamps} size={18} />
          </div>
        )}

        {/* Title */}
        {entry.title && (
          <h3 className="profile-entry-title text-base font-semibold leading-snug mb-1.5"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            <Link href={href} className="hover:underline">{entry.title}</Link>
          </h3>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2 text-xs" style={{ color: styles.muted }}>
          <span>{timeAgo(entry.published_at)}</span>
          {rt && <><span>·</span><span>{rt}</span></>}
          {entry.category && (
            <Link
              href={`/category/${getCategorySlug(entry.category)}`}
              className="px-1.5 py-0.5 rounded-full border text-[10px] transition-colors hover:opacity-80"
              style={{ borderColor: styles.accent, color: styles.accent }}
            >
              {getCategoryLabel(entry.category)}
            </Link>
          )}
        </div>

        {/* Excerpt */}
        <div className="flex-1">
          {entry.excerpt ? (
            <p className={`text-sm leading-relaxed ${excerptClamp}`} style={{ opacity: 0.85 }}>
              {decodeEntities(entry.excerpt)}
            </p>
          ) : (
            <EntryContent html={entry.body_html} entryId={entry.id}
              className={`prose-entry text-sm leading-relaxed ${excerptClamp}`} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t" style={{ borderColor: styles.border }}>
          <div className="flex flex-wrap gap-1">
            {entry.tags.slice(0, 3).map((tag) => (
              <Link key={tag} href={`/tag/${tag}`}
                className="profile-tag-chip text-[10px] px-1.5 py-0.5 rounded-full border"
                style={{ borderColor: styles.border, color: styles.muted }}>
                #{tag}
              </Link>
            ))}
            {entry.tags.length > 3 && (
              <span className="text-[10px]" style={{ color: styles.muted }}>+{entry.tags.length - 3}</span>
            )}
          </div>
          <Link href={`${href}#comments`} className="flex items-center gap-1 text-xs" style={{ color: styles.muted }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {entry.comment_count ?? 0}
          </Link>
        </div>
      </div>
    </article>
  );
}

// --- Preview / Timeline Display ---

function PreviewEntry({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const rt = readingTime(entry.word_count);

  // Build a 1-line excerpt
  let oneLineExcerpt = entry.excerpt ? decodeEntities(entry.excerpt) : "";
  if (!oneLineExcerpt && entry.body_html) {
    oneLineExcerpt = decodeEntities(entry.body_html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120);
  }

  return (
    <article className="profile-entry-item flex items-start gap-3 py-3 border-b last:border-0" style={{ borderColor: styles.border }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          {entry.title ? (
            <Link href={href} className="profile-entry-title text-sm font-medium hover:underline truncate" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              {entry.title}
            </Link>
          ) : (
            <Link href={href} className="profile-entry-title text-sm italic hover:underline truncate" style={{ color: styles.muted }}>
              Untitled
            </Link>
          )}
          {entry.category && (
            <Link
              href={`/category/${getCategorySlug(entry.category)}`}
              className="profile-tag-chip text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 hidden sm:inline-block"
              style={{ borderColor: styles.accent, color: styles.accent }}
            >
              {getCategoryLabel(entry.category)}
            </Link>
          )}
        </div>
        {oneLineExcerpt && (
          <p className="text-xs truncate" style={{ color: styles.muted }}>{oneLineExcerpt}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 text-xs" style={{ color: styles.muted }}>
        {entry.stamps && entry.stamps.length > 0 && (
          <StampDisplay stamps={entry.stamps} size={14} />
        )}
        {rt && <span className="hidden sm:inline">{rt}</span>}
        <span>{timeAgo(entry.published_at)}</span>
        <Link href={`${href}#comments`} className="flex items-center gap-0.5" style={{ color: styles.muted }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {entry.comment_count ?? 0}
        </Link>
      </div>
    </article>
  );
}

// --- Main Component ---

export function ProfileEntries({
  username,
  displayMode,
  initialEntries,
  totalCount: initialTotalCount,
  styles,
  filters,
}: ProfileEntriesProps) {
  const perPage = PER_PAGE[displayMode] ?? 9;

  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<ProfileEntry[]>(initialEntries);
  const [filteredTotal, setFilteredTotal] = useState(initialTotalCount);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / perPage));

  // Build query string from filters
  const buildQuery = useCallback((p: number) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("per_page", String(perPage));
    if (filters?.q) params.set("q", filters.q);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.tag) params.set("tag", filters.tag);
    if (filters?.year) params.set("year", String(filters.year));
    if (filters?.sort && filters.sort !== "newest") params.set("sort", filters.sort);
    return params.toString();
  }, [perPage, filters]);

  const isFiltering = !!(filters?.q || filters?.category || filters?.tag || filters?.year || (filters?.sort && filters.sort !== "newest"));

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const qs = buildQuery(p);
      const res = await fetch(`/api/users/${username}/entries?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.data ?? []);
        if (data.pagination?.total != null) {
          setFilteredTotal(data.pagination.total);
        }
      }
    } catch {
      // keep current entries on error
    } finally {
      setLoading(false);
    }
  }, [username, buildQuery]);

  const handlePageChange = useCallback((p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    // Scroll to top of entries section
    document.getElementById("profile-entries-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page, totalPages]);

  // When filters change, reset to page 1 and fetch
  useEffect(() => {
    if (!isFiltering && page === 1) {
      setEntries(initialEntries);
      setFilteredTotal(initialTotalCount);
      return;
    }
    // Always fetch when filtering, or when page > 1
    fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters?.q, filters?.category, filters?.tag, filters?.year, filters?.sort]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filters?.q, filters?.category, filters?.tag, filters?.year, filters?.sort]);

  if (filteredTotal === 0 && !loading) {
    return (
      <div className={`profile-widget-card ${styles.borderRadius} border p-8 text-center`} style={styles.surface}>
        <p className="text-sm" style={{ color: styles.muted }}>
          {isFiltering ? "No entries match your filters." : "No public entries yet."}
        </p>
      </div>
    );
  }

  return (
    <div id="profile-entries-section" className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* Full post mode */}
      {displayMode === "full" && (
        <div className="flex flex-col gap-6">
          {entries.map((entry) => (
            <FullPostEntry key={entry.id} entry={entry} username={username} styles={styles} />
          ))}
        </div>
      )}

      {/* Cards mode */}
      {displayMode === "cards" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <CardEntry key={entry.id} entry={entry} username={username} styles={styles} />
          ))}
        </div>
      )}

      {/* Preview / timeline mode */}
      {displayMode === "preview" && (
        <div className={`profile-widget-card ${styles.borderRadius} border overflow-hidden`} style={styles.surface}>
          <div className="profile-entries-area px-3 sm:px-5">
            {entries.map((entry) => (
              <PreviewEntry key={entry.id} entry={entry} username={username} styles={styles} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        styles={styles}
        mode={displayMode}
      />
    </div>
  );
}
