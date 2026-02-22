import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession, getToken } from "@/lib/session";
import { parseMusicUrl } from "@/lib/music";
import { Avatar } from "@/components/avatar";
import { EntryContent } from "@/components/entry-content";
import { CommentForm } from "./comment-form";
import { DeleteCommentButton } from "./delete-comment-button";
import { EntryActions } from "./entry-actions";
import { ReadingProgress } from "./reading-progress";
import { EntryStamps } from "./entry-stamps";

interface EntryParams {
  params: Promise<{ username: string; slug: string }>;
}

interface EntryAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  pronouns: string | null;
}

interface EntryData {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  privacy: string;
  slug: string;
  published_at: string;
  created_at: string;
  stamps?: string[];
  my_stamp?: string | null;
  author: EntryAuthor;
}

interface Comment {
  id: string;
  body_html: string;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  remote_author?: {
    username: string;
    domain: string;
    display_name: string;
    avatar_url: string | null;
    profile_url: string | null;
    ap_id: string | null;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Maps mood keywords to an HSL hue for --mood-hue CSS custom property.
 * Used by .mood-pill and .entry-ambient in globals.css.
 */
function getMoodHue(mood: string | null): number | null {
  if (!mood) return null;
  const m = mood.toLowerCase();
  if (/happy|joy|excit|grat|delight/.test(m)) return 45;
  if (/hopeful|content|peace|calm|serene/.test(m)) return 150;
  if (/sad|melanchol|blue|down|depress|griev/.test(m)) return 215;
  if (/anxi|nerv|worr|stress|uneas/.test(m)) return 25;
  if (/angr|frust|rage|irrit/.test(m)) return 0;
  if (/nostalg|reflect|pensiv/.test(m)) return 270;
  if (/tired|exhaust|sleep|weary/.test(m)) return 210;
  if (/curios|wonder|intrigu/.test(m)) return 195;
  if (/love|affe|tender|warm/.test(m)) return 340;
  return 265; // default violet
}

export async function generateMetadata({ params }: EntryParams): Promise<Metadata> {
  const { username, slug } = await params;
  try {
    const token = await getToken();
    const data = await apiFetch<{ data: EntryData }>(
      `/api/users/${username}/entries/${slug}`, {}, token
    );
    const entry = data.data;
    return {
      title: entry.title ? `${entry.title} · ${username}` : `Entry by @${username}`,
      description: entry.body_html.replace(/<[^>]+>/g, "").slice(0, 160),
    };
  } catch {
    return { title: `Entry · @${username}` };
  }
}

export default async function EntryPage({ params }: EntryParams) {
  const { username, slug } = await params;
  const token = await getToken();
  const session = await getSession();

  let entry: EntryData;
  try {
    const data = await apiFetch<{ data: EntryData }>(
      `/api/users/${username}/entries/${slug}`, {}, token
    );
    entry = data.data;
  } catch {
    notFound();
  }

  let comments: Comment[] = [];
  try {
    const data = await apiFetch<{ data: Comment[] }>(
      `/api/users/${username}/entries/${slug}/comments`
    );
    comments = data.data ?? [];
  } catch {
    // show empty
  }

  const author = entry.author;
  const isOwnEntry = session?.user.username === username;
  const isAdmin = session?.user.is_admin ?? false;

  const moodHue = getMoodHue(entry.mood);
  const mins = readingTime(entry.body_html);
  const progressColor = moodHue !== null
    ? `hsl(${moodHue} 65% 55%)`
    : "var(--accent)";

  const musicEmbed = parseMusicUrl(entry.music ?? "");

  return (
    <div
      className="min-h-screen"
      style={{
        background: "var(--background)",
        color: "var(--foreground)",
        ...(moodHue !== null ? { "--mood-hue": String(moodHue) } as React.CSSProperties : {}),
      }}
    >
      <ReadingProgress color={progressColor} />

      {/* ── Ambient hero header ─────────────────────────────────────── */}
      <div className={moodHue !== null ? "entry-ambient" : ""}>
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-12">

          {/* Nav row */}
          <div className="flex items-center justify-between mb-10">
            <Link
              href={`/${username}`}
              className="text-sm transition-colors hover:underline flex items-center gap-1.5"
              style={{ color: "var(--muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              @{username}
            </Link>
            {(isOwnEntry || isAdmin) && (
              <EntryActions entryId={entry.id} username={username} showEdit={isOwnEntry} />
            )}
          </div>

          {/* Date */}
          <time
            className="block text-sm mb-5"
            style={{ color: "var(--muted)", letterSpacing: "0.01em" }}
            dateTime={entry.published_at}
          >
            {formatDate(entry.published_at)}
          </time>

          {/* Title */}
          {entry.title && (
            <h1
              className="text-4xl font-bold leading-tight mb-7"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {entry.title}
            </h1>
          )}

          {/* Meta chips */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href={`/${username}`} className="flex items-center gap-2 hover:underline">
              <Avatar url={author.avatar_url} name={author.display_name} size={26} />
              <span className="text-sm font-medium">{author.display_name}</span>
            </Link>

            <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>

            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {mins} min read
            </span>

            {entry.mood && (
              <span className="mood-pill">feeling {entry.mood}</span>
            )}

            {/* Plain text music (not a URL) — show as chip */}
            {entry.music && !musicEmbed && (
              <span className="music-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M9 18V5l12-2v13"/>
                  <circle cx="6" cy="18" r="3"/>
                  <circle cx="18" cy="16" r="3"/>
                </svg>
                {entry.music}
              </span>
            )}
          </div>

          {/* ── Embedded music player (Spotify / YouTube / Apple Music) ── */}
          {musicEmbed && (
            <div className="music-embed-container mt-6">
              <div className="flex items-center gap-1.5 mb-2">
                {musicEmbed.service === "spotify" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1DB954" }}>
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                )}
                {musicEmbed.service === "youtube" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FF0000" }}>
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                )}
                {musicEmbed.service === "apple-music" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#FA243C" }}>
                    <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0 0 19.2.04a9.224 9.224 0 0 0-1.755-.045C17.178 0 16.91 0 16.643 0h-9.48c-.11 0-.22.005-.33.01a9.413 9.413 0 0 0-1.988.17A5.149 5.149 0 0 0 2.72 1.475c-.657.66-1.07 1.438-1.321 2.33a8.46 8.46 0 0 0-.26 1.83l-.005.29v12.15l.005.305c.024.65.098 1.29.26 1.92.254.88.667 1.66 1.32 2.32a5.065 5.065 0 0 0 2.45 1.4c.58.14 1.17.21 1.77.24.18.01.36.01.54.02h9.29c.2 0 .4 0 .59-.01.7-.03 1.39-.1 2.05-.33a4.882 4.882 0 0 0 2.06-1.31 5.06 5.06 0 0 0 1.06-1.78c.21-.57.34-1.17.39-1.78.02-.2.03-.41.03-.61V7.36c0-.12 0-.24-.01-.36l-.02-.87z"/>
                  </svg>
                )}
                <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Now playing
                </span>
              </div>
              <div className="rounded-xl overflow-hidden shadow-sm">
                <iframe
                  src={musicEmbed.embedUrl}
                  width="100%"
                  height={musicEmbed.height}
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  title={`${musicEmbed.label} embed`}
                  className="block"
                  style={{ border: "none" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Entry body ──────────────────────────────────────────────── */}
      <article className="mx-auto max-w-2xl px-4 pb-16">
        <EntryContent
          html={entry.body_html}
          entryId={entry.id}
          className={`prose-entry${entry.title ? " drop-cap" : ""}`}
        />

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-10 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
            {entry.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tag/${tag}`}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Stamps */}
        <div className="mt-10 pt-8 border-t" style={{ borderColor: "var(--border)" }}>
          <EntryStamps
            entryId={entry.id}
            initialStamps={entry.stamps ?? []}
            initialMyStamp={entry.my_stamp ?? null}
            isOwnEntry={isOwnEntry ?? false}
            isLoggedIn={!!session}
            isPlus={session?.user.subscription_tier === "plus"}
          />
        </div>

        {/* Author card */}
        <div className="mt-8 pt-8 border-t flex items-center gap-4" style={{ borderColor: "var(--border)" }}>
          <Link href={`/${username}`} className="flex-shrink-0">
            <Avatar url={author.avatar_url} name={author.display_name} size={48} />
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/${username}`} className="font-semibold hover:underline">
              {author.display_name}
            </Link>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              @{username}
              {author.bio && ` · ${author.bio}`}
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline flex-shrink-0" style={{ color: "var(--muted)" }}>
            ← Feed
          </Link>
        </div>
      </article>

      {/* ── Comments ────────────────────────────────────────────────── */}
      <section
        id="comments"
        className="mx-auto max-w-2xl px-4 pb-20 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest mt-10 mb-8" style={{ color: "var(--muted)" }}>
          {comments.length > 0
            ? `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`
            : "Comments"}
        </h2>

        {comments.length > 0 && (
          <div className="flex flex-col gap-7 mb-10">
            {comments.map((comment) => {
              const isLocal = !!comment.author;
              const isRemote = !isLocal && !!comment.remote_author;
              const displayName = isLocal
                ? comment.author!.display_name
                : isRemote
                  ? (comment.remote_author!.display_name || comment.remote_author!.username)
                  : "Anonymous";
              const avatarUrl = isLocal
                ? comment.author!.avatar_url
                : isRemote
                  ? comment.remote_author!.avatar_url
                  : null;
              const profileHref = isLocal
                ? `/${comment.author!.username}`
                : isRemote && comment.remote_author!.profile_url
                  ? comment.remote_author!.profile_url
                  : null;

              return (
                <div key={comment.id} className="flex gap-3">
                  {profileHref ? (
                    <a
                      href={profileHref}
                      className="flex-shrink-0 mt-0.5"
                      {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      <Avatar url={avatarUrl} name={displayName} size={30} />
                    </a>
                  ) : (
                    <div className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5"
                      style={{ background: "var(--surface-hover)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2 flex-wrap">
                      {profileHref ? (
                        <a
                          href={profileHref}
                          className="text-sm font-semibold hover:underline"
                          {...(isRemote ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        >
                          {displayName}
                        </a>
                      ) : (
                        <span className="text-sm font-semibold" style={{ color: "var(--muted)" }}>
                          {displayName}
                        </span>
                      )}
                      {isRemote && comment.remote_author && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full border"
                          style={{ borderColor: "var(--border)", color: "var(--muted)", fontSize: "0.65rem" }}>
                          @{comment.remote_author.username}@{comment.remote_author.domain}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    <div
                      className="prose-entry"
                      style={{ fontSize: "0.925rem", lineHeight: 1.65 }}
                      dangerouslySetInnerHTML={{ __html: comment.body_html }}
                    />
                  </div>
                  {(session?.user.username === comment.author?.username || isAdmin) && (
                    <DeleteCommentButton commentId={comment.id} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <CommentForm entryId={entry.id} isLoggedIn={!!session} />
      </section>
    </div>
  );
}
