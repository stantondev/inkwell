import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { MusicPlayer } from "@/components/music-player";
import { EntryContent } from "@/components/entry-content";

export const metadata: Metadata = { title: "Explore · Inkwell" };

interface ExploreEntry {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  privacy: string;
  comment_count?: number;
  published_at: string;
  slug: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function EntryCard({ entry }: { entry: ExploreEntry }) {
  const ago = timeAgo(entry.published_at);
  const href = `/${entry.author.username}/${entry.slug}`;

  return (
    <article className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-sm"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b"
        style={{ borderColor: "var(--border)" }}>
        <Link href={`/${entry.author.username}`} className="flex items-center gap-2.5 group">
          <Avatar url={entry.author.avatar_url} name={entry.author.display_name} size={36} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium group-hover:underline">{entry.author.display_name}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              @{entry.author.username} · {ago}
            </span>
          </div>
        </Link>
        {(entry.mood || entry.music) && (
          <div className="hidden sm:flex flex-col items-end gap-0.5 text-right max-w-[200px]">
            {entry.mood && (
              <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                <span className="font-medium" style={{ color: "var(--foreground)" }}>mood:</span> {entry.mood}
              </span>
            )}
            {entry.music && (
              <span className="text-xs truncate max-w-full" style={{ color: "var(--muted)" }}>
                ♪ {entry.music}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-4">
        {entry.title && (
          <h2 className="text-xl font-semibold mb-3 leading-snug"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            <Link href={href} className="hover:underline">{entry.title}</Link>
          </h2>
        )}
        <EntryContent html={entry.body_html} entryId={entry.id}
          className="prose-entry text-sm leading-relaxed line-clamp-5" />
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

      <div className="flex items-center justify-between px-5 py-3 border-t"
        style={{ borderColor: "var(--border)" }}>
        <Link href={href} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          Read full entry →
        </Link>
        <Link href={`${href}#comments`} className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--muted)" }}>
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

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: ExploreEntry[] = [];
  try {
    const data = await apiFetch<{ data: ExploreEntry[] }>(`/api/explore?page=${page}`);
    entries = data.data ?? [];
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
          <section>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-semibold">Explore</h1>
              <div className="flex gap-2">
                <Link href="/feed" className="text-xs px-3 py-1 rounded-full border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  Pen Pals
                </Link>
                <span className="text-xs px-3 py-1 rounded-full border font-medium"
                  style={{ borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }}>
                  Explore
                </span>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-2xl border p-12 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-lg font-semibold mb-2"
                  style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                  Nothing here yet
                </p>
                <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
                  Be the first to write a public journal entry.
                </p>
                <Link href="/editor"
                  className="rounded-full px-4 py-2 text-sm font-medium"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  Start writing
                </Link>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-5">
                  {entries.map((entry) => <EntryCard key={entry.id} entry={entry} />)}
                </div>
                <div className="flex justify-between mt-8 text-sm">
                  {page > 1 ? (
                    <Link href={`/explore?page=${page - 1}`}
                      className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                      ← Newer
                    </Link>
                  ) : <span />}
                  {entries.length === 20 && (
                    <Link href={`/explore?page=${page + 1}`}
                      className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                      Older →
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="flex flex-col gap-6">
            <Link href="/editor"
              className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Write an entry
            </Link>
            <div className="rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <h3 className="text-xs font-medium uppercase tracking-widest mb-2"
                style={{ color: "var(--muted)" }}>About Inkwell</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                A federated journaling platform. No algorithms, no ads — just writing and pen pals.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
