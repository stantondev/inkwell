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
  const sentenceMatch = stripped.match(/^(.{30,180}?[.!?])\s/);
  if (sentenceMatch) return sentenceMatch[1];

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
  let rest: string;

  if (title) {
    rest = cleanText;
  } else {
    const stripped = stripLeadingEmoji(cleanText);
    const headlineNoEllipsis = headline.replace(/…$/, "").trim();
    if (stripped.startsWith(headlineNoEllipsis)) {
      rest = stripped.slice(headlineNoEllipsis.length).trim();
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

function formattedDate(dateStr: string): string {
  const date = new Date(dateStr.endsWith("Z") ? dateStr : dateStr + "Z");
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Every Gazette card deep-links to the fediverse detail page with ?from=gazette
// so the detail page can render a "Back to The Gazette" link instead of "Back to Explore".
function entryHref(id: string): string {
  return `/fediverse/${id}?from=gazette`;
}

interface CardProps {
  entry: GazetteEntry;
}

// ── Prepared card content ────────────────────────────────────────
interface PreparedEntry {
  headline: string;
  excerpt: string;
  summary: string | null;
  topicLabel: string | null;
  byline: string;
  bylineDomain: string;
  time: string;
  fullDate: string;
  totalEngagement: number;
  replies: number;
  avatarUrl: string | null;
  href: string;
}

function prepare(entry: GazetteEntry): PreparedEntry {
  const cleanText = cleanFediverseText(entry.body_html);
  const headline = extractHeadline(cleanText, entry.title);
  const excerpt = extractExcerpt(cleanText, headline, entry.title);

  return {
    headline,
    excerpt,
    summary: entry.gazette_summary ?? null,
    topicLabel: entry.gazette_topic ? getTopicLabel(entry.gazette_topic) : null,
    byline: entry.author.display_name || entry.author.username,
    bylineDomain: entry.author.domain,
    time: timeAgo(entry.published_at),
    fullDate: formattedDate(entry.published_at),
    totalEngagement: entry.engagement.boosts + entry.engagement.likes,
    replies: entry.engagement.replies,
    avatarUrl: entry.author.avatar_url,
    href: entryHref(entry.id),
  };
}

// ── LEAD card: above-the-fold feature story ─────────────────────
// Large serif headline, deck subtitle, drop-cap first paragraph,
// byline underneath. Used for the single top story on page 1.

export function GazetteLeadCard({ entry }: CardProps) {
  const p = prepare(entry);

  return (
    <article className="gazette-lead">
      {p.topicLabel && (
        <div className="gazette-lead-kicker">
          {p.topicLabel} <span className="gazette-lead-kicker-dot">·</span>{" "}
          {p.fullDate}
        </div>
      )}

      <Link href={p.href} className="gazette-lead-headline">
        {p.headline}
      </Link>

      {p.summary && <p className="gazette-lead-deck">{p.summary}</p>}

      {p.excerpt && (
        <p className="gazette-lead-lede">
          <span className="gazette-drop-cap">{p.excerpt.charAt(0)}</span>
          {p.excerpt.slice(1)}
        </p>
      )}

      <div className="gazette-lead-byline">
        <span className="gazette-lead-byline-label">By</span>{" "}
        <span className="gazette-lead-byline-name">{p.byline}</span>
        <span className="gazette-lead-byline-sep">·</span>
        <span className="gazette-lead-byline-domain">{p.bylineDomain}</span>
        {p.totalEngagement > 0 && (
          <>
            <span className="gazette-lead-byline-sep">·</span>
            <span className="gazette-lead-byline-engagement">
              ✦ {p.totalEngagement}
            </span>
          </>
        )}
      </div>
    </article>
  );
}

// ── STANDARD card: 2-column secondary stories ───────────────────
// Medium headline, 2-3 line excerpt, compact byline.

export function GazetteEntryCard({ entry }: CardProps) {
  const p = prepare(entry);

  return (
    <article className="gazette-card">
      <div className="gazette-card-header">
        {p.topicLabel && (
          <span className="gazette-topic-badge">{p.topicLabel}</span>
        )}
        <span className="gazette-time">{p.time}</span>
      </div>

      <Link href={p.href} className="gazette-card-headline">
        {p.headline}
      </Link>

      {p.summary ? (
        <p className="gazette-card-summary">{p.summary}</p>
      ) : p.excerpt ? (
        <p className="gazette-card-excerpt">{p.excerpt}</p>
      ) : null}

      <div className="gazette-card-footer">
        <div className="gazette-card-source">
          {p.avatarUrl && (
            <img
              src={p.avatarUrl}
              alt=""
              className="gazette-card-avatar"
            />
          )}
          <span className="gazette-card-byline">
            <span className="gazette-card-author">{p.byline}</span>
            <span className="gazette-card-domain">{p.bylineDomain}</span>
          </span>
        </div>

        <div className="gazette-card-engagement">
          {p.totalEngagement > 0 && (
            <span
              title={`${entry.engagement.boosts} boosts, ${entry.engagement.likes} likes`}
            >
              ✦ {p.totalEngagement}
            </span>
          )}
          {p.replies > 0 && (
            <span title={`${p.replies} replies`}>↳ {p.replies}</span>
          )}
        </div>
      </div>
    </article>
  );
}

// ── DIGEST card: compact list item for "In Brief" grid ──────────
// Just headline + kicker + time. No excerpt. Dense multi-column layout.

export function GazetteDigestCard({ entry }: CardProps) {
  const p = prepare(entry);

  return (
    <article className="gazette-digest">
      <div className="gazette-digest-header">
        {p.topicLabel && (
          <span className="gazette-digest-kicker">{p.topicLabel}</span>
        )}
        <span className="gazette-digest-time">{p.time}</span>
      </div>
      <Link href={p.href} className="gazette-digest-headline">
        {p.headline}
      </Link>
      <div className="gazette-digest-byline">
        <span className="gazette-digest-byline-name">{p.byline}</span>
        <span className="gazette-digest-byline-sep">·</span>
        <span className="gazette-digest-byline-domain">{p.bylineDomain}</span>
      </div>
    </article>
  );
}
