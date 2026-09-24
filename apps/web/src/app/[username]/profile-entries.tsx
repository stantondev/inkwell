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
  excerpt_custom?: boolean;
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

function plainText(html: string | null | undefined): string {
  return decodeEntities(
    (html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|h[1-6]|li|blockquote|figcaption)>/gi, " ").replace(/<[^>]+>/g, ""),
  ).replace(/\s+/g, " ").trim();
}

function leadText(html: string, max = 700): string {
  const text = plainText(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/** The picture a story is shown with: its cover, else the first picture in it. */
function storyImage(entry: ProfileEntry): string | null {
  return entry.cover_image_id ? `/api/images/${entry.cover_image_id}` : firstImageSrc(entry.body_html);
}

/**
 * The text shown under a headline. Generated excerpts (and custom ones that
 * are just the opening, often frozen at an early draft and cut mid-word) are
 * replaced by the entry's current opening; a summary the writer actually
 * wrote is kept.
 */
function storyText(entry: ProfileEntry, max: number): string {
  const lead = leadText(entry.body_html, max);
  if (!entry.excerpt || !entry.excerpt_custom) return lead;
  const excerpt = decodeEntities(entry.excerpt).replace(/\s+/g, " ").trim();
  const bare = excerpt.replace(/(…|\.\.\.)$/, "").trim();
  if (!bare || plainText(entry.body_html).startsWith(bare)) return lead;
  // A short fragment that stops mid-sentence is a stale draft opening (often
  // cut mid-word), not a summary: show the real opening instead.
  const finished = /[.!?…"'”’)]$/.test(excerpt);
  if (!finished && excerpt.length < 160) return lead;
  return excerpt;
}

function storyTitle(entry: ProfileEntry): string {
  return entry.title ? decodeEntities(entry.title) : "Untitled entry";
}

function isQuoteReprint(entry: ProfileEntry): boolean {
  return /^RE: /.test(entry.title ?? "");
}

function isCoverWorthy(entry: ProfileEntry): boolean {
  return (entry.word_count ?? 0) >= 80 && !isQuoteReprint(entry);
}

const SERIF = "var(--font-lora, Georgia, serif)";

function Kicker({ entry, styles, label }: { entry: ProfileEntry; styles: ProfileStyles; label?: string }) {
  const parts = [entry.category ? getCategoryLabel(entry.category) : null, label].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: styles.accent }}>
      {parts.join(" · ")}
    </p>
  );
}

function Byline({ entry, styles, full = false }: { entry: ProfileEntry; styles: ProfileStyles; full?: boolean }) {
  const rt = readingTime(entry.word_count);
  const comments = entry.comment_count ?? 0;
  return (
    <p className="text-xs" style={{ color: styles.muted }}>
      {full ? <LocalDate iso={entry.published_at} options={FULL_DATE} /> : <span suppressHydrationWarning>{timeAgo(entry.published_at)}</span>}
      {rt && <> · {rt}</>}
      {comments > 0 && <> · {comments} {comments === 1 ? "comment" : "comments"}</>}
    </p>
  );
}

/** Top of the magazine: a double-ruled dateline, like the strip under a masthead. */
function MagazineDateline({ entries, page, totalPages, total, styles }: {
  entries: ProfileEntry[]; page: number; totalPages: number; total: number; styles: ProfileStyles;
}) {
  const newest = entries[0]?.published_at;
  const month = newest
    ? new Date(newest).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  return (
    <div
      className="flex items-center justify-between gap-4 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.2em]"
      style={{ color: styles.muted, borderTop: `3px double ${styles.foreground}`, borderBottom: `1px solid ${styles.foreground}` }}
    >
      <span>{page === 1 ? "This issue" : `Page ${page} of ${totalPages}`}</span>
      {month && <span className="hidden sm:inline" style={{ fontFamily: SERIF }}>{month}</span>}
      <span>{total} {total === 1 ? "entry" : "entries"}</span>
    </div>
  );
}

/** The cover story: big headline, picture, drop-capped opening set in two columns. */
function MagazineFeature({ entry, username, styles, isNewest }: {
  entry: ProfileEntry; username: string; styles: ProfileStyles; isNewest: boolean;
}) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const image = storyImage(entry);
  const lead = leadText(entry.body_html, image ? 700 : 1100);

  return (
    <article className="profile-entry-item magazine-feature min-w-0">
      <div className={image ? "grid gap-6 @4xl:grid-cols-[7fr_5fr] @4xl:items-center" : ""}>
        <div className={image ? "@4xl:order-2" : ""}>
          <Kicker entry={entry} styles={styles} label={isNewest ? "Latest entry" : "Cover story"} />
          <h3
            className="profile-entry-title text-4xl @2xl:text-5xl @5xl:text-6xl font-bold leading-[1.05] tracking-tight mb-4 [overflow-wrap:anywhere]"
            style={{ fontFamily: SERIF }}
          >
            <Link href={href} className="hover:underline decoration-2 underline-offset-4">{storyTitle(entry)}</Link>
          </h3>
          <div className="mb-6"><Byline entry={entry} styles={styles} full /></div>
          {isArchive(entry) && <p className="-mt-3 mb-6"><Seal entry={entry} where="feature" /></p>}
        </div>
        {image && (
          <Link href={href} className={`block overflow-hidden ${styles.borderRadius} @4xl:order-1`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={entry.title ?? "Entry picture"} className="w-full object-cover aspect-[4/3]" />
          </Link>
        )}
      </div>
      {lead && (
        <div
          className={`${lead.length > 200 ? "magazine-lead @3xl:columns-2" : ""} mt-4 gap-10 text-lg leading-relaxed`}
          style={{ fontFamily: SERIF, columnRule: `1px solid ${styles.border}` }}
        >
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

/** "In this issue": a contents list beside the cover story on wide pages. */
function MagazineContents({ entries, username, styles }: { entries: ProfileEntry[]; username: string; styles: ProfileStyles }) {
  return (
    <nav aria-label="In this issue" className="min-w-0 @5xl:pl-8 @5xl:border-l" style={{ borderColor: styles.border }}>
      <h4 className="text-[10px] uppercase tracking-[0.2em] pb-2 mb-1 border-b-2" style={{ color: styles.muted, borderColor: styles.foreground }}>
        In this issue
      </h4>
      <ol>
        {entries.map((entry, i) => (
          <li key={entry.id} className="flex gap-3 py-3 border-b last:border-0" style={{ borderColor: styles.border }}>
            <span className="text-2xl font-bold leading-none tabular-nums" style={{ fontFamily: SERIF, color: styles.accent }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              {entry.category && (
                <span className="block text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: styles.muted }}>
                  {getCategoryLabel(entry.category)}
                </span>
              )}
              <Link
                href={`/${username}/${entry.slug ?? entry.id}`}
                className="profile-entry-title block text-[15px] font-semibold leading-snug hover:underline [overflow-wrap:anywhere]"
                style={{ fontFamily: SERIF }}
              >
                {storyTitle(entry)}
              </Link>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A second feature across the page: picture on one side, story on the other. */
function MagazineSpread({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const image = storyImage(entry);
  return (
    <article className="profile-entry-item min-w-0 grid gap-6 @2xl:grid-cols-2 @2xl:items-center pt-6 border-t" style={{ borderColor: styles.border }}>
      {image && (
        <Link href={href} className={`block overflow-hidden ${styles.borderRadius}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={entry.title ?? "Entry picture"} className="w-full aspect-[3/2] object-cover" loading="lazy" />
        </Link>
      )}
      <div className="min-w-0">
        <Kicker entry={entry} styles={styles} />
        <h3 className="profile-entry-title text-3xl @4xl:text-4xl font-bold leading-tight tracking-tight mb-3 [overflow-wrap:anywhere]" style={{ fontFamily: SERIF }}>
          <Link href={href} className="hover:underline decoration-2 underline-offset-4">{storyTitle(entry)}</Link>
        </h3>
        <p className="text-base leading-relaxed mb-4 line-clamp-6" style={{ fontFamily: SERIF, opacity: 0.9 }}>
          {storyText(entry, 480)}
        </p>
        <Byline entry={entry} styles={styles} />
        {isArchive(entry) && <p className="mt-2"><Seal entry={entry} where="spread" /></p>}
      </div>
    </article>
  );
}

/**
 * A story in the newspaper columns. The columns flow like a printed page
 * (each story as tall as its own text), so a story with a picture never leaves
 * holes beside the ones without.
 */
function MagazineStory({ entry, username, styles }: { entry: ProfileEntry; username: string; styles: ProfileStyles }) {
  const href = `/${username}/${entry.slug ?? entry.id}`;
  const image = storyImage(entry);
  const words = entry.word_count ?? 0;
  const brief = words > 0 && words < 60 && !image;
  const text = storyText(entry, brief ? 400 : image ? 240 : 420);

  return (
    <article className="profile-entry-item min-w-0 break-inside-avoid pt-4 pb-5 border-b" style={{ borderColor: styles.border }}>
      {image && (
        <Link href={href} className={`block overflow-hidden ${styles.borderRadius} mb-3`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={entry.title ?? "Entry picture"} className="w-full aspect-[3/2] object-cover" loading="lazy" />
        </Link>
      )}
      <Kicker entry={entry} styles={styles} label={brief ? "In brief" : undefined} />
      <h3
        className={`profile-entry-title ${brief ? "text-lg" : "text-xl"} font-bold leading-snug mb-2 [overflow-wrap:anywhere]`}
        style={{ fontFamily: SERIF }}
      >
        <Link href={href} className="hover:underline">{storyTitle(entry)}</Link>
      </h3>
      {text && (
        <p
          className={`text-sm leading-relaxed mb-3 ${brief ? "italic" : image ? "line-clamp-4" : "line-clamp-[8]"}`}
          style={{ fontFamily: brief ? SERIF : undefined, opacity: 0.85 }}
        >
          {text}
        </p>
      )}
      <Byline entry={entry} styles={styles} />
      {isArchive(entry) && <p className="mt-2"><Seal entry={entry} where="story" /></p>}
    </article>
  );
}

function MagazineIssue({ entries, username, styles, page, totalPages, total, showCover }: {
  entries: ProfileEntry[]; username: string; styles: ProfileStyles;
  page: number; totalPages: number; total: number; showCover: boolean;
}) {
  // The cover story: the newest entry with some substance (not a quick
  // "RE:" quote reprint or a one-liner), falling back to the newest.
  const cover = showCover
    ? entries.find(isCoverWorthy) ?? entries.find((e) => !isQuoteReprint(e)) ?? entries[0] ?? null
    : null;
  let rest = cover ? entries.filter((e) => e.id !== cover.id) : entries;
  // A second feature across the page: the first remaining story with a
  // picture, when enough stories are left to fill the columns below it.
  const spread = rest.length >= 3 ? rest.find((e) => storyImage(e) && (e.word_count ?? 0) >= 40) ?? null : null;
  if (spread) rest = rest.filter((e) => e.id !== spread.id);
  const contents = cover ? entries.filter((e) => e.id !== cover.id).slice(0, 5) : [];

  return (
    <div className="flex flex-col gap-8">
      <MagazineDateline entries={entries} page={page} totalPages={totalPages} total={total} styles={styles} />

      {cover && (
        <div className={contents.length >= 2 ? "grid gap-8 @5xl:grid-cols-[1fr_280px]" : ""}>
          <MagazineFeature entry={cover} username={username} styles={styles} isNewest={cover.id === entries[0]?.id} />
          {contents.length >= 2 && (
            <div className="hidden @5xl:block">
              <MagazineContents entries={contents} username={username} styles={styles} />
            </div>
          )}
        </div>
      )}

      {spread && <MagazineSpread entry={spread} username={username} styles={styles} />}

      {rest.length > 0 && (
        <section>
          {(cover || spread) && (
            <h3 className="text-xs uppercase tracking-[0.2em] pb-2 border-b-2" style={{ color: styles.muted, borderColor: styles.foreground }}>
              More entries
            </h3>
          )}
          <div
            className={`gap-x-8 ${rest.length >= 2 ? "@xl:columns-2" : ""} ${rest.length >= 3 ? "@4xl:columns-3" : ""}`}
            style={{ columnRule: `1px solid ${styles.border}` }}
          >
            {rest.map((entry) => (
              <MagazineStory key={entry.id} entry={entry} username={username} styles={styles} />
            ))}
          </div>
        </section>
      )}
    </div>
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

      {/* Magazine layout: dateline, cover story, a spread, then newspaper columns */}
      {displayMode === "magazine" && (
        <MagazineIssue
          entries={entries}
          username={username}
          styles={styles}
          page={page}
          totalPages={totalPages}
          total={filteredTotal}
          showCover={page === 1 && !isFiltering}
        />
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
