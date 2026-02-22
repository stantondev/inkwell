import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Avatar } from "@/components/avatar";

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface TagEntry {
  id: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  comment_count?: number;
  published_at: string;
  slug: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  return { title: `#${tag} · Inkwell` };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { tag } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: TagEntry[] = [];
  try {
    const data = await apiFetch<{ data: TagEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tag)}&page=${page}`
    );
    entries = data.data ?? [];
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <nav className="mb-6">
          <Link href="/explore" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Explore
          </Link>
        </nav>

        <h1 className="text-3xl font-bold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          #{tag}
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          Public entries tagged #{tag}
        </p>

        {entries.length === 0 ? (
          <div className="rounded-2xl border p-10 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>No public entries with this tag yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {entries.map((entry) => {
              const href = `/${entry.author.username}/${entry.slug}`;
              return (
                <article key={entry.id} className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-2.5 px-5 pt-4 pb-3 border-b"
                    style={{ borderColor: "var(--border)" }}>
                    <Avatar url={entry.author.avatar_url} name={entry.author.display_name} size={32} />
                    <div className="flex flex-col leading-tight">
                      <Link href={`/${entry.author.username}`}
                        className="text-sm font-medium hover:underline">
                        {entry.author.display_name}
                      </Link>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        @{entry.author.username} · {timeAgo(entry.published_at)}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    {entry.title && (
                      <h2 className="text-xl font-semibold mb-3"
                        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                        <Link href={href} className="hover:underline">{entry.title}</Link>
                      </h2>
                    )}
                    <div className="prose-entry text-sm leading-relaxed line-clamp-4"
                      dangerouslySetInnerHTML={{ __html: entry.body_html }} />
                  </div>
                  <div className="px-5 py-3 border-t flex items-center justify-between"
                    style={{ borderColor: "var(--border)" }}>
                    <Link href={href} className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                      Read →
                    </Link>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.tags.filter(t => t !== tag).slice(0, 4).map((t) => (
                        <Link key={t} href={`/tag/${t}`}
                          className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                          #{t}
                        </Link>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}

            <div className="flex justify-between mt-4 text-sm">
              {page > 1 ? (
                <Link href={`/tag/${tag}?page=${page - 1}`}
                  className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  ← Newer
                </Link>
              ) : <span />}
              {entries.length === 20 && (
                <Link href={`/tag/${tag}?page=${page + 1}`}
                  className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  Older →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
