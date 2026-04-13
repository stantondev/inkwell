import Link from "next/link";
import { getTopicLabel } from "@/lib/gazette-topics";

export interface GazetteEntry {
  id: string;
  ap_id: string;
  url: string;
  title: string | null;
  body_html: string;
  tags: string[];
  published_at: string;
  sensitive: boolean;
  content_warning: string | null;
  quality_score?: number;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    domain: string;
    ap_id: string;
    profile_url: string | null;
  };
  engagement: {
    boosts: number;
    likes: number;
    replies: number;
  };
  // AI fields (Phase 2)
  gazette_summary?: string | null;
  gazette_topic?: string | null;
}

function extractHeadline(entry: GazetteEntry): string {
  if (entry.title) return entry.title;
  // Extract first sentence from body text
  const text = entry.body_html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = text.match(/^(.{30,200}?[.!?])\s/);
  return match ? match[1] : text.slice(0, 150) + (text.length > 150 ? "..." : "");
}

function extractExcerpt(entry: GazetteEntry, maxLength = 200): string {
  const text = entry.body_html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-zA-Z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Skip past the headline if we used first sentence as headline
  const headline = entry.title ? "" : extractHeadline(entry);
  const remaining = headline ? text.replace(headline, "").trim() : text;
  if (remaining.length <= maxLength) return remaining;
  return remaining.slice(0, maxLength).replace(/\s\S*$/, "") + "...";
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GazetteEntryCard({ entry }: { entry: GazetteEntry }) {
  const headline = extractHeadline(entry);
  const excerpt = extractExcerpt(entry);
  const totalEngagement = entry.engagement.boosts + entry.engagement.likes;

  return (
    <article className="gazette-card">
      <div className="gazette-card-header">
        {entry.gazette_topic && (
          <span className="gazette-topic-badge">
            {getTopicLabel(entry.gazette_topic)}
          </span>
        )}
        <span className="gazette-time">{timeAgo(entry.published_at)}</span>
      </div>

      <Link href={`/fediverse/${entry.id}`} className="gazette-card-headline">
        {headline}
      </Link>

      {entry.gazette_summary ? (
        <p className="gazette-card-summary">{entry.gazette_summary}</p>
      ) : excerpt ? (
        <p className="gazette-card-excerpt">{excerpt}</p>
      ) : null}

      <div className="gazette-card-footer">
        <div className="gazette-card-source">
          {entry.author.avatar_url && (
            <img
              src={entry.author.avatar_url}
              alt=""
              className="gazette-card-avatar"
            />
          )}
          <span className="gazette-card-author">
            {entry.author.display_name || entry.author.username}
          </span>
          <span className="gazette-card-domain">
            @{entry.author.domain}
          </span>
        </div>

        <div className="gazette-card-engagement">
          {totalEngagement > 0 && (
            <span title={`${entry.engagement.boosts} boosts, ${entry.engagement.likes} likes`}>
              {totalEngagement} engagements
            </span>
          )}
          {entry.engagement.replies > 0 && (
            <span>{entry.engagement.replies} replies</span>
          )}
        </div>
      </div>

      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="gazette-card-external"
      >
        View on {entry.author.domain}
      </a>
    </article>
  );
}
