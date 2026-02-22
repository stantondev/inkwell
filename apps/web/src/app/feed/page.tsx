import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { MusicPlayer } from "@/components/music-player";
import { EntryContent } from "@/components/entry-content";
import { StampDisplay } from "@/components/stamp-display";

export const metadata: Metadata = { title: "Feed" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FeedEntry {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  privacy: string;
  comment_count?: number;
  stamps?: string[];
  published_at: string;
  slug: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  const initials = name[0]?.toUpperCase() ?? "?";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} width={size} height={size}
      className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center font-semibold text-xs select-none flex-shrink-0"
      style={{ width: size, height: size, background: "var(--accent-light)", color: "var(--accent)", fontSize: size * 0.38 }}
      aria-label={name}>
      {initials}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry card
// ---------------------------------------------------------------------------
function EntryCard({ entry }: { entry: FeedEntry }) {
  const ago = timeAgo(entry.published_at);
  const href = `/${entry.author.username}/${entry.slug ?? entry.id}`;

  return (
    <article className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-sm"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {/* Author header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b"
        style={{ borderColor: "var(--border)" }}>
        <Link href={`/${entry.author.username}`} className="flex items-center gap-2.5 group">
          <Avatar url={entry.author.avatar_url} name={entry.author.display_name} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium group-hover:underline">{entry.author.display_name}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              @{entry.author.username} · {ago}
            </span>
          </div>
        </Link>
        {(entry.mood || entry.music) && (
          <div className="hidden sm:flex flex-col items-end gap-0.5 text-right max-w-[240px]">
            {entry.mood && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                <span className="font-medium" style={{ color: "var(--foreground)" }}>mood:</span> {entry.mood}
              </span>
            )}
            {entry.music && (
              <span className="text-xs truncate max-w-full" style={{ color: "var(--muted)" }}>
                <span className="font-medium" style={{ color: "var(--foreground)" }}>♪</span> {entry.music}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 relative">
        {/* Stamps — top-right corner like a postage stamp */}
        {entry.stamps && entry.stamps.length > 0 && (
          <div className="absolute top-3 right-4">
            <StampDisplay stamps={entry.stamps} size={20} />
          </div>
        )}
        {entry.title && (
          <h2 className="text-xl font-semibold mb-3 leading-snug pr-16"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            <Link href={href} className="hover:underline">{entry.title}</Link>
          </h2>
        )}
        <EntryContent html={entry.body_html} entryId={entry.id}
          className="prose-entry text-sm leading-relaxed line-clamp-6" />
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {entry.tags.map((tag) => (
              <Link key={tag} href={`/tag/${tag}`}
                className="text-xs px-2 py-0.5 rounded-full border transition-colors hover:border-accent"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                #{tag}
              </Link>
            ))}
          </div>
        )}
        <MusicPlayer music={entry.music} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t"
        style={{ borderColor: "var(--border)" }}>
        <Link href={href} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Read full entry →
        </Link>
        <Link href={`${href}#comments`}
          className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {entry.comment_count ?? 0}
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyFeed({ username }: { username: string }) {
  return (
    <div className="rounded-2xl border p-12 text-center"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <p className="text-lg font-semibold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        Your feed is quiet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Follow some pen pals to see their journal entries here, or write your first entry.
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        <Link href="/editor"
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}>
          Write your first entry
        </Link>
        <Link href={`/${username}`}
          className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
          View your profile
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function FeedPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) notFound();

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: FeedEntry[] = [];
  try {
    const data = await apiFetch<{ data: FeedEntry[] }>(
      `/api/feed?page=${page}`,
      {},
      session.token
    );
    entries = data.data ?? [];
  } catch {
    // If the feed fails (e.g. no friends yet), show empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          {/* Feed */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold">Pen Pals feed</h1>
              <div className="flex gap-2">
                <span className="text-xs px-3 py-1 rounded-full border font-medium"
                  style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}>
                  Pen Pals
                </span>
                <Link href="/explore" className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  Explore
                </Link>
              </div>
            </div>

            {entries.length === 0 ? (
              <EmptyFeed username={session.user.username} />
            ) : (
              <>
                <div className="flex flex-col gap-5">
                  {entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                </div>
                <div className="flex justify-between mt-8 text-sm">
                  {page > 1 ? (
                    <Link href={`/feed?page=${page - 1}`}
                      className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                      ← Newer
                    </Link>
                  ) : <span />}
                  {entries.length === 20 && (
                    <Link href={`/feed?page=${page + 1}`}
                      className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                      Older →
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>

          {/* Sidebar */}
          <aside className="flex flex-col gap-6">
            <Link href="/editor"
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#fff" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Write an entry
            </Link>

            {/* Profile quick-link */}
            <div className="rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h3 className="text-xs font-medium uppercase tracking-widest mb-3"
                style={{ color: "var(--muted)" }}>Your journal</h3>
              <Link href={`/${session.user.username}`}
                className="flex items-center gap-2 text-sm hover:underline">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  {session.user.display_name[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{session.user.display_name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>@{session.user.username}</div>
                </div>
              </Link>
            </div>
            {session.user.subscription_tier !== "plus" && (
              <div className="rounded-xl border p-4"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <h3 className="text-xs font-medium uppercase tracking-widest mb-2"
                  style={{ color: "var(--muted)" }}>Support Inkwell</h3>
                <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                  Upgrade to Plus for $5/mo — unlock extra features and keep Inkwell ad-free.
                </p>
                <Link href="/settings/billing"
                  className="block text-center rounded-full py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  Upgrade to Plus
                </Link>
              </div>
            )}

            {/* Roadmap link */}
            <Link href="/roadmap"
              className="flex items-center gap-2 text-xs transition-colors hover:underline"
              style={{ color: "var(--muted)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Roadmap & Feedback
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
