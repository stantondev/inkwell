import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EntryContent } from "@/components/entry-content";
import { MusicPlayer } from "@/components/music-player";
import { StampDisplay } from "@/components/stamp-display";
import { JournalPage } from "@/components/journal-page";

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
  published_at: string;
  slug: string;
  author: {
    id?: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
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
  const href = `/${entry.author.username}/${entry.slug ?? entry.id}`;
  const ago = timeAgo(entry.published_at);

  return (
    <JournalPage corner edge className="flex flex-col h-full">
      {/* Top section */}
      <div className="p-6 lg:p-8 flex-1 flex flex-col relative">
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
            className="text-2xl font-bold mb-4 leading-snug pr-20"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            <Link href={href} className="hover:underline">
              {entry.title}
            </Link>
          </h2>
        )}

        {/* Author row + meta */}
        <div className="flex items-center gap-3 mb-5">
          <Link
            href={`/${entry.author.username}`}
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

          {/* Mood + music meta (desktop only) */}
          {(entry.mood || entry.music) && (
            <div className="hidden sm:flex items-center gap-2 ml-auto text-right">
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
                  className="text-xs truncate max-w-[160px]"
                  style={{ color: "var(--muted)" }}
                >
                  ♪ {entry.music}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body with fade */}
        <div className="journal-body-fade flex-1">
          <EntryContent
            html={entry.body_html}
            entryId={entry.id}
            className="prose-entry text-sm leading-relaxed"
          />
        </div>

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
          className="flex items-center justify-between px-6 lg:px-8 py-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <Link
            href={href}
            className="text-sm font-medium transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Read full entry &rarr;
          </Link>
          <Link
            href={`${href}#comments`}
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
