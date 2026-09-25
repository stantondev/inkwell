import Link from "next/link";
import { AvatarWithFrame } from "@/components/avatar";
import { ContentWarning } from "@/components/content-warning";
import { EntryContent } from "@/components/entry-content";
import { StampDisplay } from "@/components/stamp-display";
import type { JournalEntry } from "@/components/journal-entry-card";
import { stickyTilt } from "@/lib/stickies";

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.max(0, Math.floor(diff / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Exact timestamp for the hover tooltip.
 *
 * Locale AND time zone are pinned. `toLocaleString()` with neither renders in
 * the *server's* zone during SSR (Fly runs UTC) and in the *reader's* zone on
 * the client, which is a text mismatch React can't reconcile — it throws away
 * the server HTML for the entire page and re-renders it (error #418). Same
 * reason every other date here passes an explicit timeZone.
 */
function exactTime(isoString: string): string {
  const formatted = new Date(isoString).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return `${formatted} UTC`;
}

interface StickyNoteCardProps {
  entry: JournalEntry;
  /** Footer actions (ink, stamp, comments…) — feed cards pass FeedCardActions. */
  actions?: React.ReactNode;
  translatedBody?: string | null;
  /** The viewer wrote this sticky: shows "Expand into an entry". */
  isOwn?: boolean;
  /** Arrived since the reader last opened their Feed. */
  isNew?: boolean;
  /** "feed" (default), "board" (profile corkboard: smaller, no actions), "page" (the sticky's own page). */
  variant?: "feed" | "board" | "page";
}

/**
 * A Sticky: a short post drawn as a sticky note stuck into the journal.
 * No title, no cover. The paper color is the writer's choice.
 */
export function StickyNoteCard({ entry, actions, translatedBody, isOwn = false, isNew = false, variant = "feed" }: StickyNoteCardProps) {
  const href = `/${entry.author.username}/${entry.slug ?? entry.id}`;
  const color = entry.sticky_color || "yellow";
  const expanded = entry.expanded_into;

  return (
    <article
      className={`sticky-note sticky-note--${color} sticky-note--${variant}`}
      style={{ "--sticky-tilt": `${stickyTilt(entry.id)}deg` } as React.CSSProperties}
      aria-label={`Sticky by ${entry.author.display_name}`}
    >
      <span className="sticky-note-tape" aria-hidden="true" />

      <div className="sticky-note-inner">
        {variant !== "board" && entry.stamps && entry.stamps.length > 0 && (
          <div className="sticky-note-stamps">
            <StampDisplay stamps={entry.stamps} size="sm" />
          </div>
        )}

        {variant === "board" && (
          <div className="sticky-note-byline sticky-note-byline--board">
            <Link href={href} className="sticky-note-time" title={exactTime(entry.published_at)}>
              <time dateTime={entry.published_at} suppressHydrationWarning>{timeAgo(entry.published_at)}</time>
            </Link>
          </div>
        )}

        {variant === "feed" && (
          <div className="sticky-note-byline">
            <Link href={`/${entry.author.username}`} className="sticky-note-author">
              <AvatarWithFrame
                url={entry.author.avatar_url}
                name={entry.author.display_name}
                size={24}
                frame={entry.author.avatar_frame}
                animation={entry.author.avatar_animation}
                subscriptionTier={entry.author.subscription_tier}
              />
              <span className="sticky-note-name">{entry.author.display_name}</span>
            </Link>
            {isNew && <span className="feed-new-tag">New</span>}
            <Link href={href} className="sticky-note-time" title={exactTime(entry.published_at)}>
              <time dateTime={entry.published_at} suppressHydrationWarning>{timeAgo(entry.published_at)}</time>
            </Link>
          </div>
        )}

        <ContentWarning isSensitive={!!entry.is_sensitive} contentWarning={entry.content_warning} compact>
          <EntryContent
            html={translatedBody || entry.body_html}
            entryId={entry.id}
            className="sticky-note-body"
          />
        </ContentWarning>

        {(expanded || (isOwn && variant !== "board")) && (
          <div className="sticky-note-links">
            {expanded ? (
              <Link href={`/${expanded.username}/${expanded.slug}`} className="sticky-note-link">
                Grew into <em>{expanded.title || "an entry"}</em> &rarr;
              </Link>
            ) : (
              <Link href={`/editor?from_sticky=${entry.id}`} className="sticky-note-link">
                Expand into an entry &rarr;
              </Link>
            )}
          </div>
        )}
      </div>

      {variant === "feed" && actions && <div className="sticky-note-actions">{actions}</div>}
    </article>
  );
}
