import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ContentWarning } from "@/components/content-warning";
import { EntryContent } from "@/components/entry-content";
import { MusicPlayer } from "@/components/music-player";
import { StampDisplay } from "@/components/stamp-display";
import { JournalPage } from "@/components/journal-page";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";
import { getMusicLabel } from "@/lib/music";
import { decodeEntities } from "@/lib/decode-entities";

export interface JournalEntry {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  privacy: string;
  comment_count?: number;
  stamps?: string[];
  my_stamp?: string | null;
  bookmarked?: boolean;
  published_at: string;
  slug: string;
  word_count?: number;
  excerpt?: string | null;
  cover_image_id?: string | null;
  category?: string | null;
  series?: {
    id: string;
    title: string;
    slug: string;
    username: string;
    series_order: number;
  } | null;
  ink_count?: number;
  my_ink?: boolean;
  sensitive?: boolean;
  content_warning?: string | null;
  is_sensitive?: boolean;
  is_paywalled?: boolean;
  is_paid?: boolean;
  /** "local" (default) or "remote" for federated entries */
  source?: "local" | "remote";
  /** Original URL for remote entries */
  url?: string;
  author: {
    id?: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    /** Domain of the remote instance (e.g. "mastodon.social") */
    domain?: string;
    /** URL to the remote user's profile */
    profile_url?: string;
    subscription_tier?: string;
    ink_donor_status?: string | null;
  };
}

/** Extract the first image src from HTML body content */
function extractFirstImage(html: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface JournalEntryCardProps {
  entry: JournalEntry;
  /** Optional custom footer actions (replaces default static footer) */
  actions?: React.ReactNode;
  /** Translated body HTML — when set, replaces the original body content */
  translatedBody?: string | null;
  /** Translated title — when set, replaces the original title */
  translatedTitle?: string | null;
}

export function JournalEntryCard({ entry, actions, translatedBody, translatedTitle }: JournalEntryCardProps) {
  const isRemote = entry.source === "remote";
  const href = isRemote
    ? (entry.url ?? `/${entry.author.username}/${entry.id}`)
    : `/${entry.author.username}/${entry.slug ?? entry.id}`;
  const authorHref = isRemote
    ? (entry.author.profile_url ?? "#")
    : `/${entry.author.username}`;
  const ago = timeAgo(entry.published_at);

  const readingMins = entry.word_count && entry.word_count > 0
    ? Math.max(1, Math.round(entry.word_count / 200))
    : null;

  // Compact mode for short fediverse posts (no title, short body)
  const isCompact = isRemote && !entry.title && entry.body_html && entry.body_html.replace(/<[^>]+>/g, "").length < 280;

  return (
    <JournalPage corner edge className={`flex flex-col${isRemote ? " journal-page-fediverse" : ""}${isCompact ? " fediverse-compact" : ""}`}>
      {/* Top section */}
      <div className={`${isCompact ? "p-3 sm:p-4" : "p-4 sm:p-5 lg:p-6"} flex flex-col relative`}>
        {/* Stamps — top-right corner like an ink stamp pressed on paper */}
        {entry.stamps && entry.stamps.length > 0 && (
          <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
            <StampDisplay stamps={entry.stamps} size="md" />
          </div>
        )}

        {/* Date — compact fediverse posts use inline relative time */}
        {!isCompact && (
          <time
            className="block text-xs mb-4 tracking-wide uppercase"
            style={{
              color: "var(--muted)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              letterSpacing: "0.06em",
            }}
            dateTime={entry.published_at}
          >
            {formatDate(entry.published_at)}
          </time>
        )}

        {/* Title */}
        {entry.title && (
          <h2
            className="text-2xl font-bold mb-4 leading-snug pr-14 sm:pr-24"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            {isRemote ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {translatedTitle || entry.title}
              </a>
            ) : (
              <Link href={href} className="hover:underline">
                {translatedTitle || entry.title}
              </Link>
            )}
            {(entry.is_paywalled || entry.is_paid) && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="inline-block ml-2 align-middle"
                style={{ color: "var(--muted)", verticalAlign: "middle" }}
                aria-label="Paid subscribers only"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </h2>
        )}

        {/* Author row */}
        <div className="flex items-center gap-3 mb-3">
          {isRemote ? (
            <div className="flex items-center gap-2 flex-nowrap min-w-0">
              <a
                href={authorHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 group"
              >
                <Avatar
                  url={entry.author.avatar_url}
                  name={entry.author.display_name}
                  size={28}
                />
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-sm font-medium group-hover:underline truncate">
                    {entry.author.display_name}
                  </span>
                  <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                    @{entry.author.username}@{entry.author.domain} &middot; {ago}
                  </span>
                </div>
              </a>
              {/* Fediverse instance pill */}
              {entry.author.domain && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0 max-w-[140px]"
                  style={{
                    background: "var(--fediverse-accent-light)",
                    color: "var(--fediverse-accent, #569e85)",
                    border: "1px solid var(--fediverse-accent-border)",
                  }}
                >
                  <svg className="shrink-0" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span className="truncate">{entry.author.domain}</span>
                </span>
              )}
            </div>
          ) : (
            <Link
              href={authorHref}
              className="flex items-center gap-2 group"
            >
              <Avatar
                url={entry.author.avatar_url}
                name={entry.author.display_name}
                size={28}
              />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium group-hover:underline">
                  {entry.author.display_name}
                  {entry.author.subscription_tier === "plus" && (
                    <span className="ml-1 inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium align-middle"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      Plus
                    </span>
                  )}
                  {entry.author.ink_donor_status === "active" && (
                    <span className="ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium align-middle"
                      style={{ background: "var(--ink-deep, #2d4a8a)", color: "#fff", opacity: 0.9 }}>
                      <svg width="6" height="8" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                        <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
                      </svg>
                      Donor
                    </span>
                  )}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  @{entry.author.username} &middot; {ago}
                </span>
              </div>
            </Link>
          )}
        </div>

        {/* Entry meta — editorial byline strip */}
        {(readingMins || entry.category || entry.series || entry.mood || entry.music) && (
          <MetaStrip
            readingMins={readingMins}
            entry={entry}
          />
        )}

        {/* Sensitive content wrapper — hides body/cover/music/tags behind CW */}
        <ContentWarning isSensitive={!!entry.is_sensitive} contentWarning={entry.content_warning} compact>
          {/* Cover image */}
          {entry.cover_image_id && (
            <div className="w-full overflow-hidden rounded-lg mb-4" style={{ maxHeight: "min(280px, 45vw)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/images/${entry.cover_image_id}`}
                alt={entry.title ?? "Entry cover"}
                className="w-full object-cover"
                style={{ maxHeight: "min(280px, 45vw)" }}
                loading="lazy"
              />
            </div>
          )}

          {/* Body preview — compact fediverse posts show full content, others use excerpt/clamp */}
          {isCompact ? (
            <div>
              <EntryContent
                html={translatedBody || entry.body_html}
                entryId={entry.id}
                className="prose-entry text-sm leading-relaxed"
              />
            </div>
          ) : translatedBody ? (
            <div>
              <div className="journal-body-clamp">
                <EntryContent
                  html={translatedBody}
                  entryId={entry.id}
                  className="prose-entry text-sm leading-relaxed"
                />
              </div>
              {isRemote ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </a>
              ) : (
                <Link
                  href={href}
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </Link>
              )}
            </div>
          ) : entry.excerpt ? (
            <div>
              {/* Preview image extracted from body (when no cover image) */}
              {!entry.cover_image_id && (() => {
                const previewSrc = extractFirstImage(entry.body_html);
                return previewSrc ? (
                  <div className="w-full overflow-hidden rounded-lg mb-4" style={{ maxHeight: "min(200px, 35vw)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewSrc}
                      alt=""
                      className="w-full object-cover"
                      style={{ maxHeight: "min(200px, 35vw)" }}
                      loading="lazy"
                    />
                  </div>
                ) : null;
              })()}
              <p
                className="text-sm leading-relaxed line-clamp-8"
                style={{ color: "var(--foreground)", opacity: 0.85 }}
              >
                {decodeEntities(entry.excerpt)}
              </p>
              {isRemote ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </a>
              ) : (
                <Link
                  href={href}
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </Link>
              )}
            </div>
          ) : (
            <div>
              <div className="journal-body-clamp">
                <EntryContent
                  html={entry.body_html}
                  entryId={entry.id}
                  className="prose-entry text-sm leading-relaxed"
                />
              </div>
              {isRemote ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </a>
              ) : (
                <Link
                  href={href}
                  className="inline-block mt-3 text-sm font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Continue reading &rarr;
                </Link>
              )}
            </div>
          )}

          {/* Music embed */}
          <MusicPlayer music={entry.music} />

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-5">
              {entry.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/tag/${tag}`}
                  className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-accent"
                  style={{
                    borderColor: "var(--border)",
                    color: "var(--muted)",
                  }}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </ContentWarning>
      </div>

      {/* Footer — either custom actions or static default */}
      {actions ?? (
        <div
          className={`flex items-center justify-between ${isCompact ? "px-3 sm:px-4" : "px-4 sm:px-5 lg:px-6"} py-2.5 border-t`}
          style={{ borderColor: "var(--border)" }}
        >
          {isRemote ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="fediverse-view-link flex items-center gap-1.5 text-xs font-medium transition-colors hover:underline"
              style={{ color: "var(--fediverse-accent, #569e85)" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {entry.author.domain ? `View on ${entry.author.domain}` : "View original"} &rarr;
            </a>
          ) : (
            <span />
          )}
          <Link
            href={isRemote ? "#" : `${href}#comments`}
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted)" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {entry.comment_count ?? 0}
          </Link>
        </div>
      )}
    </JournalPage>
  );
}

function MetaStrip({
  readingMins,
  entry,
}: {
  readingMins: number | null;
  entry: JournalEntry;
}) {
  const items: React.ReactNode[] = [];

  if (readingMins) {
    items.push(
      <span key="read" className="entry-meta-item">
        {readingMins} min read
      </span>
    );
  }

  if (entry.category) {
    items.push(
      <Link
        key="cat"
        href={`/category/${getCategorySlug(entry.category)}`}
        className="entry-meta-item entry-meta-link"
        style={{ color: "var(--accent)" }}
      >
        {getCategoryLabel(entry.category)}
      </Link>
    );
  }

  if (entry.series) {
    items.push(
      <Link
        key="series"
        href={`/${entry.series.username}/series/${entry.series.slug}`}
        className="entry-meta-item entry-meta-link"
      >
        Part {entry.series.series_order} of{" "}
        <em>{entry.series.title}</em>
      </Link>
    );
  }

  if (entry.mood) {
    items.push(
      <span key="mood" className="entry-meta-item">
        {entry.mood}
      </span>
    );
  }

  if (entry.music) {
    items.push(
      <span key="music" className="entry-meta-item entry-meta-music">
        ♪ {getMusicLabel(entry.music)}
      </span>
    );
  }

  return (
    <div
      className="entry-meta-strip flex flex-wrap items-center gap-y-0.5 mb-4"
      style={{ color: "var(--muted)" }}
    >
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span className="entry-meta-dot" aria-hidden="true">
              &middot;
            </span>
          )}
          {item}
        </span>
      ))}
    </div>
  );
}
