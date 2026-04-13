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

// ── Text cleaning ──────────────────────────────────────────────────
//
// Mastodon and other fediverse servers emit HTML with a lot of noise
// that reads fine in a timeline but is ugly in a newspaper card:
//   - HTML entities (&#39;, &amp;, &quot;)
//   - URLs with forced spaces ("https:// foo.com/bar") for line wrapping
//   - @mentions rendered as "@ username" with a space after @
//   - Trailing hashtag blocks ("# politics # war # news #...")
// We strip all of this for the card preview. The full formatted HTML
// still displays correctly on the /fediverse/[id] detail page.

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&[a-zA-Z]+;/g, " "); // strip any remaining named entities
}

function cleanFediverseText(html: string): string {
  let text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  text = decodeEntities(text);

  // Mastodon inserts a space after https:// for line wrapping display
  // ("https:// foo.com/bar" → full URL). Remove these URLs — they're noise
  // in a preview and readers can click through to see the real post.
  text = text.replace(/https?:\/\/\s*[^\s]+/g, "");

  // "@ username" → strip entirely (Mastodon's spaced-mention rendering)
  // Also strip common conversational openers that follow mentions
  // ("reports:", "says:", "writes:") since they read as orphans
  text = text.replace(
    /@\s+[\w.-]+(?:@[\w.-]+)?(?:\s+(?:reports?|says?|writes?|notes?|tweets?|posts?|responds?)\s*:?)?/gi,
    ""
  );

  // Trailing hashtag soup: "# foo # bar # baz" at end of post
  text = text.replace(/(?:\s*#\s+[\w-]+)+\s*$/, "");

  // Inline "# word" (with space) → just "#word"
  text = text.replace(/#\s+(\w)/g, "#$1");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function stripLeadingEmoji(text: string): string {
  // Strip leading emoji + whitespace so the headline starts with words.
  // Covers most emoji blocks; not exhaustive but catches the common ones
  // seen in fediverse news posts (🚨, 🔴, ⛽, 🕊️, ✈️, 🇺🇸 flags, etc.)
  return text
    .replace(
      /^(?:[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{200D}\uFE0F\s]+)/u,
      ""
    )
    .trim();
}

function extractHeadline(cleanText: string, title: string | null): string {
  if (title) return decodeEntities(title);

  const stripped = stripLeadingEmoji(cleanText);

  // Try to find a natural sentence break in the first 30-200 chars
  const sentenceMatch = stripped.match(/^(.{30,180}?[.!?])\s/);
  if (sentenceMatch) return sentenceMatch[1];

  // No early sentence break — cut at a word boundary near 140 chars
  if (stripped.length <= 140) return stripped;
  const cut = stripped.slice(0, 140).replace(/\s\S*$/, "");
  return cut + "…";
}

function extractExcerpt(
  cleanText: string,
  headline: string,
  title: string | null,
  maxLength = 220
): string {
  // Figure out where in the clean text the headline ends so we can
  // show content *after* it (not duplicate it).
  let rest: string;

  if (title) {
    // Headline came from the title field, not from body text. Show full body.
    rest = cleanText;
  } else {
    // Headline came from body. Strip leading emoji + headline content from start.
    const stripped = stripLeadingEmoji(cleanText);
    // Match by prefix rather than substring replace so ellipsis doesn't break
    const headlineNoEllipsis = headline.replace(/…$/, "").trim();
    if (stripped.startsWith(headlineNoEllipsis)) {
      rest = stripped.slice(headlineNoEllipsis.length).trim();
      // Remove leading punctuation that may have been the sentence terminator
      rest = rest.replace(/^[.!?…]+\s*/, "");
    } else {
      rest = stripped;
    }
  }

  if (!rest) return "";
  if (rest.length <= maxLength) return rest;
  return rest.slice(0, maxLength).replace(/\s\S*$/, "") + "…";
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
  const cleanText = cleanFediverseText(entry.body_html);
  const headline = extractHeadline(cleanText, entry.title);
  const excerpt = extractExcerpt(cleanText, headline, entry.title);
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
          <span className="gazette-card-byline">
            <span className="gazette-card-author">
              {entry.author.display_name || entry.author.username}
            </span>
            <span className="gazette-card-domain">
              {entry.author.domain}
            </span>
          </span>
        </div>

        <div className="gazette-card-engagement">
          {totalEngagement > 0 && (
            <span title={`${entry.engagement.boosts} boosts, ${entry.engagement.likes} likes`}>
              ✦ {totalEngagement}
            </span>
          )}
          {entry.engagement.replies > 0 && (
            <span title={`${entry.engagement.replies} replies`}>
              ↳ {entry.engagement.replies}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
