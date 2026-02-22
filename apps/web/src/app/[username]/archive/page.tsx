import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession, getToken } from "@/lib/session";

interface ArchiveParams {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}

interface ArchiveEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  privacy: string;
  published_at: string;
  comment_count?: number;
}

interface ProfileUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function groupByYear(entries: ArchiveEntry[]) {
  const groups: Record<string, ArchiveEntry[]> = {};
  for (const entry of entries) {
    const year = new Date(entry.published_at).getFullYear().toString();
    if (!groups[year]) groups[year] = [];
    groups[year].push(entry);
  }
  return Object.entries(groups).sort(([a], [b]) => parseInt(b) - parseInt(a));
}

export async function generateMetadata({ params }: ArchiveParams): Promise<Metadata> {
  const { username } = await params;
  return { title: `Archive · @${username}` };
}

export default async function ArchivePage({ params, searchParams }: ArchiveParams) {
  const { username } = await params;
  const { page: pageParam } = await searchParams;
  const page = parseInt(pageParam ?? "1", 10);
  const perPage = 50;

  const session = await getSession();
  const token = await getToken();
  const isOwnProfile = session?.user.username === username;

  // Verify user exists
  let profile: ProfileUser;
  try {
    const data = await apiFetch<{ data: ProfileUser }>(`/api/users/${username}`);
    profile = data.data;
  } catch {
    notFound();
  }

  // Fetch entries — owner and friends see more
  let entries: ArchiveEntry[] = [];
  let totalCount = 0;
  try {
    const data = await apiFetch<{ data: ArchiveEntry[]; pagination: { page: number; per_page: number } }>(
      `/api/users/${username}/entries?page=${page}&per_page=${perPage}`,
      {},
      token
    );
    entries = data.data ?? [];
    totalCount = entries.length; // approximate — we'll show next page if full
  } catch {
    // show empty
  }

  const grouped = groupByYear(entries);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href={`/${username}`} className="text-sm hover:underline"
              style={{ color: "var(--muted)" }}>
              ← @{username}
            </Link>
            <h1 className="text-2xl font-bold mt-1">Archive</h1>
          </div>
          {isOwnProfile && (
            <Link href="/editor"
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}>
              + New entry
            </Link>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="rounded-2xl border p-12 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>No entries yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {grouped.map(([year, yearEntries]) => (
              <section key={year}>
                <h2 className="text-xs font-semibold uppercase tracking-widest mb-4 pb-2 border-b"
                  style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {year} · {yearEntries.length} {yearEntries.length === 1 ? "entry" : "entries"}
                </h2>
                <div className="flex flex-col gap-px">
                  {yearEntries.map((entry) => {
                    const href = `/${username}/${entry.slug}`;
                    return (
                      <Link key={entry.id} href={href}
                        className="flex items-start justify-between gap-4 py-3 px-4 rounded-xl -mx-4 hover:bg-[var(--surface-hover)] transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-snug group-hover:underline truncate"
                            style={{ fontFamily: entry.title ? "var(--font-lora, Georgia, serif)" : undefined }}>
                            {entry.title ?? (
                              <span className="italic" style={{ color: "var(--muted)" }}>
                                {entry.body_html.replace(/<[^>]+>/g, "").slice(0, 60) || "Untitled"}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs"
                            style={{ color: "var(--muted)" }}>
                            {entry.mood && <span>feeling {entry.mood}</span>}
                            {entry.tags.slice(0, 3).map(tag => (
                              <span key={tag}>#{tag}</span>
                            ))}
                            {entry.privacy !== "public" && (
                              <span className="px-1.5 py-0.5 rounded text-xs"
                                style={{ background: "var(--surface-hover)" }}>
                                {entry.privacy}
                              </span>
                            )}
                          </div>
                        </div>
                        <time className="text-xs flex-shrink-0 mt-0.5" style={{ color: "var(--muted)" }}
                          dateTime={entry.published_at}>
                          {new Date(entry.published_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric"
                          })}
                        </time>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between mt-10">
          {page > 1 ? (
            <Link href={`/${username}/archive?page=${page - 1}`}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              ← Newer
            </Link>
          ) : <div />}
          {totalCount >= perPage ? (
            <Link href={`/${username}/archive?page=${page + 1}`}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Older →
            </Link>
          ) : <div />}
        </div>
      </div>
    </div>
  );
}
