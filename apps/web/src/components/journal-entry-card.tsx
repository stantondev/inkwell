import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EntryContent } from "@/components/entry-content";
import { MusicPlayer } from "@/components/music-player";
import { StampDisplay } from "@/components/stamp-display";
import { JournalPage } from "@/components/journal-page";
import { getCategoryLabel, getCategorySlug } from "@/lib/categories";

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
  };
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
}

export function JournalEntryCard({ entry, actions }: JournalEntryCardProps) {
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

  return (
    <JournalPage corner edge className="flex flex-col h-full">
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

      {/* Top section */}
      <div className="p-4 sm:p-6 lg:p-8 flex-1 flex flex-col relative">
        {/* Stamps — top-right corner like an ink stamp pressed on paper */}
        {entry.stamps && entry.stamps.length > 0 && (
          <div className="absolute top-4 right-4 lg:top-6 lg:right-6">
            <StampDisplay stamps={entry.stamps} size={32} />
          </div>
        )}

        {/* Date */}
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

        {/* Title */}
        {entry.title && (
          <h2
            className="text-2xl font-bold mb-4 leading-snug pr-12 sm:pr-20"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            {isRemote ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {entry.title}
              </a>
            ) : (
              <Link href={href} className="hover:underline">
                {entry.title}
              </Link>
            )}
          </h2>
        )}

        {/* Author row + meta */}
        <div className="flex items-center gap-3 mb-5">
          {isRemote ? (
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
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium group-hover:underline">
                  {entry.author.display_name}
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  @{entry.author.username}@{entry.author.domain} &middot; {ago}
                </span>
              </div>
            </a>
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
                </span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  @{entry.author.username} &middot; {ago}
                </span>
              </div>
            </Link>
          )}

          {/* Reading time + mood + music meta (desktop only) */}
          <div className="hidden sm:flex items-center gap-2 ml-auto text-right">
            {readingMins && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {readingMins} min read
              </span>
            )}
            {entry.category && (
              <Link
                href={`/category/${getCategorySlug(entry.category)}`}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-80"
                style={{
                  borderColor: "var(--accent)",
                  color: "var(--accent)",
                  background: "var(--accent-light)",
                }}
              >
                {getCategoryLabel(entry.category)}
              </Link>
            )}
            {entry.series && (
              <Link
                href={`/${entry.series.username}/series/${entry.series.slug}`}
                className="text-xs px-2.5 py-1 rounded-full border transition-colors hover:opacity-80"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted)",
                }}
              >
                Part {entry.series.series_order} of {entry.series.title}
              </Link>
            )}
            {entry.mood && (
              <span
                className="text-xs px-2.5 py-1 rounded-full border"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted)",
                }}
              >
                {entry.mood}
              </span>
            )}
            {entry.music && (
              <span
                className="text-xs truncate max-w-[100px] sm:max-w-[160px]"
                style={{ color: "var(--muted)" }}
              >
                ♪ {entry.music}
              </span>
            )}
          </div>
        </div>

        {/* Body preview — excerpt (plain text) or HTML fade */}
        {entry.excerpt ? (
          <p
            className="flex-1 text-sm leading-relaxed line-clamp-4"
            style={{ color: "var(--foreground)", opacity: 0.85 }}
          >
            {entry.excerpt}
          </p>
        ) : (
          <div className="journal-body-fade flex-1">
            <EntryContent
              html={entry.body_html}
              entryId={entry.id}
              className="prose-entry text-sm leading-relaxed"
            />
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
      </div>

      {/* Footer — either custom actions or static default */}
      {actions ?? (
        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 px-4 sm:px-6 lg:px-8 py-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          {isRemote ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium transition-colors hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {entry.author.domain ? `View on ${entry.author.domain}` : "View original"} &rarr;
            </a>
          ) : (
            <Link
              href={href}
              className="text-sm font-medium transition-colors hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Read full entry &rarr;
            </Link>
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
