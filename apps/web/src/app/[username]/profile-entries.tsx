"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { LocalDate, FULL_DATE } from "@/components/local-date";
import { EntryContent } from "@/components/entry-content";
import { MusicPlayer } from "@/components/music-player";
import { StampDisplay } from "@/components/stamp-display";
import { getMusicLabel } from "@/lib/music";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";
import { decodeEntities } from "@/lib/decode-entities";
import type { ProfileStyles } from "@/lib/profile-styles";
import type { ProfileFilters } from "./profile-search-bar";
import { ArchivePostmark, ArchiveSeal } from "@/components/archive-postmark";
import { archiveOriginName } from "@/lib/archive";

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
  imported_from?: string | null;
  archive_mark?: boolean;
}

function isArchive(entry: ProfileEntry) {
  return !!(entry.archive_mark && entry.imported_from);
}

function Seal({ entry, where }: { entry: ProfileEntry; where: string }) {
  return <ArchiveSeal origin={entry.imported_from} publishedAt={entry.published_at} uid={`${where}-${entry.id}`} />;
}


interface ProfileEntriesProps {
  username: string;
  displayMode: "full" | "cards" | "preview" | "magazine";
  initialEntries: ProfileEntry[];
  totalCount: number;
  styles: ProfileStyles;
  filters?: ProfileFilters;
  perPage?: number;
  /** Controlled page (the filter wrapper owns it and keeps it in the URL). */
  page?: number;
  onPageChange?: (page: number) => void;
  /** Filtered total, reported up for the "N results" line. */
  onTotalChange?: (total: number) => void;
  /** The page + filters the server already rendered `initialEntries` for. */
  initialKey?: string;
}

const PER_PAGE: Record<string, number> = {
  full: 5,
  cards: 9,
  preview: 20,
  magazine: 10,
};

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
          Previous
        </button>
        <span className="text-xs" style={{ color: styles.muted, fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1.5 text-sm font-medium transition-opacity disabled:opacity-30"
          style={{ color: styles.accent }}
        >
          Next
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
          <time
            className="block text-xs tracking-wide uppercase"
            style={{ color: styles.muted, fontFamily: "var(--font-lora, Georgia, serif)", letterSpacing: "0.06em" }}
            dateTime={entry.published_at}
          >
            <LocalDate iso={entry.published_at} options={FULL_DATE} asTime={false} />
          </time>
          {isArchive(entry) && <Seal entry={entry} where="full" />}
        </div>

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
              <StampDisplay stamps={entry.stamps} size="sm" showPopup={false} />
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
              <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`}
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
            <StampDisplay stamps={entry.stamps} size="xs" showPopup={false} />
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
          <span suppressHydrationWarning>{timeAgo(entry.published_at)}</span>
          {rt && <><span>·</span><span>{rt}</span></>}
          {isArchive(entry) && <Seal entry={entry} where="card" />}
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
              <Link key={tag} href={`/tag/${encodeURIComponent(tag)}`}
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

// --- Magazine Display ---

function firstImageSrc(html: string | null | undefined): string | null {
  const m = html?.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function leadText(html: string, max = 700): string {
  const text = decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

const SERIF = "var(--font-lora, Georgia, serif)";

/** The newest entry as a cover story: big headline, drop-capped opening, large picture. */
function MagazineFeature({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const rt = readingTime(entry.word_count);
  const image = entry.cover_image_id ? `/api/images/${entry.cover_image_id}` : firstImageSrc(entry.body_html);
  const lead = leadText(entry.body_html);

  return (
    <article className="profile-entry-item magazine-feature min-w-0">
      <div className={image ? "grid gap-6 @4xl:grid-cols-[7fr_5fr] @4xl:items-center" : ""}>
        <div className={image ? "@4xl:order-2" : ""}>
          <p className="text-xs uppercase tracking-[0.2em] mb-4" style={{ color: styles.accent }}>
            {entry.category ? `${getCategoryLabel(entry.category)} · ` : ""}Latest entry
          </p>
          <h3
            className="profile-entry-title text-4xl @2xl:text-5xl @5xl:text-6xl font-bold leading-[1.05] tracking-tight mb-4 [overflow-wrap:anywhere]"
            style={{ fontFamily: SERIF }}
          >
            <Link href={href} className="hover:underline decoration-2 underline-offset-4">
              {entry.title ? decodeEntities(entry.title) : "Untitled entry"}
            </Link>
          </h3>
          <p className="text-sm mb-6" style={{ color: styles.muted }}>
            <LocalDate iso={entry.published_at} options={FULL_DATE} />
            {rt && <> · {rt}</>}
          </p>
          {isArchive(entry) && <p className="-mt-4 mb-6"><Seal entry={entry} where="feature" /></p>}
        </div>
        {image && (
          <Link href={href} className={`block overflow-hidden ${styles.borderRadius} @4xl:order-1`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={entry.title ?? "Entry picture"} className="w-full object-cover aspect-[4/3]" />
          </Link>
        )}
      </div>
      {lead && (
        <div className={`${lead.length > 200 ? "magazine-lead @3xl:columns-2" : ""} mt-2 gap-10 text-lg leading-relaxed`} style={{ fontFamily: SERIF }}>
          <p>{lead}</p>
        </div>
      )}
      <p className="mt-4">
        <Link href={href} className="text-sm font-medium hover:underline" style={{ color: styles.accent }}>
          Keep reading →
        </Link>
      </p>
    </article>
  );
}

/** A smaller story in the columns below the feature. */
function MagazineStory({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const rt = readingTime(entry.word_count);
  const image = entry.cover_image_id ? `/api/images/${entry.cover_image_id}` : null;
  return (
    <article className="profile-entry-item min-w-0 flex flex-col pt-4 border-t" style={{ borderColor: styles.border }}>
      {image && (
        <Link href={href} className={`block overflow-hidden ${styles.borderRadius} mb-3`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={entry.title ?? "Entry cover"} className="w-full aspect-[3/2] object-cover" loading="lazy" />
        </Link>
      )}
      {entry.category && (
        <p className="text-[10px] uppercase tracking-[0.18em] mb-1.5" style={{ color: styles.accent }}>
          {getCategoryLabel(entry.category)}
        </p>
      )}
      <h3 className="profile-entry-title text-xl font-bold leading-snug mb-2 [overflow-wrap:anywhere]" style={{ fontFamily: SERIF }}>
        <Link href={href} className="hover:underline">{entry.title ? decodeEntities(entry.title) : "Untitled entry"}</Link>
      </h3>
      <p className="text-sm leading-relaxed line-clamp-4 mb-3" style={{ opacity: 0.85 }}>
        {entry.excerpt ? decodeEntities(entry.excerpt) : leadText(entry.body_html, 260)}
      </p>
      <p className="text-xs mt-auto" style={{ color: styles.muted }}>
        <span suppressHydrationWarning>{timeAgo(entry.published_at)}</span>
        {rt && <> · {rt}</>}
        {(entry.comment_count ?? 0) > 0 && <> · {entry.comment_count} {entry.comment_count === 1 ? "comment" : "comments"}</>}
      </p>
      {isArchive(entry) && <p className="mt-2"><Seal entry={entry} where="story" /></p>}
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
          <StampDisplay stamps={entry.stamps} size="xs" showPopup={false} />
        )}
        {isArchive(entry) && (
          <ArchivePostmark
            origin={entry.imported_from}
            publishedAt={entry.published_at}
            uid={`tl-${entry.id}`}
            width={22}
            waves={false}
            title={`From the ${archiveOriginName(entry.imported_from)} archive`}
          />
        )}
        {rt && <span className="hidden sm:inline">{rt}</span>}
        <span suppressHydrationWarning>{timeAgo(entry.published_at)}</span>
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

export function profileEntriesKey(filters: ProfileFilters | undefined, page: number): string {
  const f = filters ?? { q: "", category: null, tag: null, year: null, month: null, sort: "newest" };
  return JSON.stringify([f.q || "", f.category, f.tag, f.year, f.year ? f.month : null, f.sort, page]);
}

export function ProfileEntries({
  username,
  displayMode,
  initialEntries,
  totalCount: initialTotalCount,
  styles,
  filters,
  perPage: perPageProp,
  page: controlledPage,
  onPageChange,
  onTotalChange,
  initialKey,
}: ProfileEntriesProps) {
  const perPage = perPageProp ?? PER_PAGE[displayMode] ?? 9;

  const [ownPage, setOwnPage] = useState(1);
  const page = controlledPage ?? ownPage;
  const setPage = onPageChange ?? setOwnPage;
  const [entries, setEntries] = useState<ProfileEntry[]>(initialEntries);
  const [filteredTotal, setFilteredTotal] = useState(initialTotalCount);
  const [loading, setLoading] = useState(false);
  // Only the latest request may update the list (a slow reply to an older
  // filter/page must not overwrite a newer one).
  const requestSeq = useRef(0);

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
    if (filters?.year && filters?.month) params.set("month", String(filters.month));
    if (filters?.sort && filters.sort !== "newest") params.set("sort", filters.sort);
    return params.toString();
  }, [perPage, filters]);

  const isFiltering = !!(filters?.q || filters?.category || filters?.tag || filters?.year || (filters?.sort && filters.sort !== "newest"));

  const fetchPage = useCallback(async (p: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const qs = buildQuery(p);
      const res = await fetch(`/api/users/${username}/entries?${qs}`);
      if (res.ok && seq === requestSeq.current) {
        const data = await res.json();
        setEntries(data.data ?? []);
        if (data.pagination?.total != null) {
          setFilteredTotal(data.pagination.total);
        }
      }
    } catch {
      // keep current entries on error
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [username, buildQuery]);

  const handlePageChange = useCallback((p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    setPage(p);
    // Scroll to top of entries section
    document.getElementById("profile-entries-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page, totalPages, setPage]);

  // Fetch whenever the filters or page change, except for the combination
  // the server already rendered.
  const dataKey = profileEntriesKey(filters, page);
  const firstKey = useRef(initialKey ?? profileEntriesKey(undefined, 1));
  useEffect(() => {
    if (dataKey === firstKey.current) {
      requestSeq.current++;
      setEntries(initialEntries);
      setFilteredTotal(initialTotalCount);
      setLoading(false);
      return;
    }
    fetchPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  useEffect(() => {
    onTotalChange?.(filteredTotal);
  }, [filteredTotal, onTotalChange]);

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
    <div id="profile-entries-section" className={"@container " + (loading ? "opacity-60 transition-opacity" : "transition-opacity")}>
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
        <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
          {entries.map((entry) => (
            <CardEntry key={entry.id} entry={entry} username={username} styles={styles} />
          ))}
        </div>
      )}

      {/* Magazine layout: the newest entry as a cover story, then columns of stories */}
      {displayMode === "magazine" && (() => {
        // The cover story: the newest entry with some substance (not a quick
        // "RE:" quote-reprint or a one-liner), falling back to the newest.
        const featured =
          page === 1 && !isFiltering
            ? entries.find((e) => (e.word_count ?? 0) >= 80 && !/^RE: /.test(e.title ?? "")) ?? entries[0]
            : null;
        const rest = featured ? entries.filter((e) => e.id !== featured.id) : entries;
        return (
          <div className="flex flex-col gap-10">
            {featured && <MagazineFeature entry={featured} username={username} styles={styles} />}
            {rest.length > 0 && (
              <div>
                {featured && (
                  <h3 className="text-xs uppercase tracking-[0.2em] mb-4 pb-2 border-b-2" style={{ color: styles.muted, borderColor: styles.foreground }}>
                    More entries
                  </h3>
                )}
                <div className="grid gap-x-8 gap-y-8 @xl:grid-cols-2 @4xl:grid-cols-3">
                  {rest.map((entry) => (
                    <MagazineStory key={entry.id} entry={entry} username={username} styles={styles} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
