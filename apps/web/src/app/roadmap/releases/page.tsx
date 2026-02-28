import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { CategoryBadge } from "../badges";

export const metadata: Metadata = {
  title: "Release Notes",
  description: "What's new at Inkwell — a changelog of shipped features, fixes, and improvements.",
};

interface ReleaseItem {
  id: string;
  title: string;
  category: string;
  release_note: string;
  completed_at: string | null;
  vote_count: number;
  author: {
    id: string | null;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface ReleasesResponse {
  data: ReleaseItem[];
  pagination: { page: number; per_page: number; total: number };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

function groupByMonth(items: ReleaseItem[]): { month: string; items: ReleaseItem[] }[] {
  const groups: { month: string; items: ReleaseItem[] }[] = [];
  let currentMonth: string | null = null;

  for (const item of items) {
    const dateStr = item.completed_at || item.completed_at;
    if (!dateStr) continue;
    const month = formatMonthYear(dateStr);
    if (month !== currentMonth) {
      groups.push({ month, items: [] });
      currentMonth = month;
    }
    groups[groups.length - 1].items.push(item);
  }

  return groups;
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ReleasesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);
  const perPage = 20;
  const session = await getSession();

  let data: ReleasesResponse;
  try {
    data = await apiFetch<ReleasesResponse>(
      `/api/feedback/releases?page=${page}&per_page=${perPage}`,
      {},
      session?.token
    );
  } catch {
    data = { data: [], pagination: { page: 1, per_page: perPage, total: 0 } };
  }

  const totalPages = Math.max(1, Math.ceil((data.pagination.total || 0) / perPage));
  const groups = groupByMonth(data.data);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {/* Back link */}
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm mb-8 transition-colors hover:underline"
          style={{ color: "var(--muted)" }}
        >
          ← Back to Roadmap
        </Link>

        {/* Header */}
        <header className="text-center mb-10">
          <h1
            className="text-3xl sm:text-4xl font-semibold italic tracking-tight mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Release Notes
          </h1>
          <div
            className="flex items-center justify-center gap-3 text-sm mb-3"
            style={{ color: "var(--muted)" }}
          >
            <span>·</span>
            <span>·</span>
            <span>·</span>
          </div>
          <p
            className="text-sm italic"
            style={{ color: "var(--muted)", fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            What&rsquo;s new at Inkwell
          </p>
        </header>

        {/* Content */}
        {data.data.length === 0 ? (
          <div
            className="release-notes-empty rounded-2xl border p-16 text-center relative overflow-hidden"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <div className="release-notes-paper-texture" />
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto mb-4 relative"
              style={{ color: "var(--muted)", opacity: 0.3 }}
              aria-hidden="true"
            >
              <path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34" />
              <polygon points="18 2 22 6 12 16 8 16 8 12 18 2" />
            </svg>
            <p
              className="text-lg font-semibold mb-2 relative"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              No release notes yet
            </p>
            <p
              className="text-sm max-w-xs mx-auto relative"
              style={{ color: "var(--muted)" }}
            >
              Stay tuned &mdash; shipped features and improvements will appear here.
            </p>
          </div>
        ) : (
          <div className="release-notes-timeline">
            {groups.map((group) => (
              <div key={group.month} className="release-notes-month">
                {/* Month header */}
                <h2 className="release-notes-month-header">
                  {group.month}
                </h2>

                {/* Items */}
                <div className="release-notes-items">
                  {group.items.map((item) => (
                    <article
                      key={item.id}
                      className="release-notes-card"
                    >
                      <div className="release-notes-card-inner">
                        {/* Date */}
                        <time
                          className="release-notes-date"
                          dateTime={item.completed_at || ""}
                        >
                          {item.completed_at ? formatDate(item.completed_at) : ""}
                        </time>

                        {/* Category + Title */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <CategoryBadge category={item.category} />
                          <Link
                            href={`/roadmap/${item.id}`}
                            className="font-semibold hover:underline"
                            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                          >
                            {item.title}
                          </Link>
                        </div>

                        {/* Release note body */}
                        <p className="release-notes-body">
                          {item.release_note}
                        </p>

                        {/* Attribution */}
                        <div className="release-notes-attribution">
                          {item.author.username !== "[deleted]" ? (
                            <>
                              <span style={{ color: "var(--muted)" }}>Suggested by</span>
                              <Avatar
                                url={item.author.avatar_url}
                                name={item.author.display_name}
                                size={16}
                              />
                              <Link
                                href={`/${item.author.username}`}
                                className="font-medium hover:underline"
                                style={{ color: "var(--accent)" }}
                              >
                                @{item.author.username}
                              </Link>
                            </>
                          ) : (
                            <span style={{ color: "var(--muted)" }}>Community suggestion</span>
                          )}
                          {item.vote_count > 0 && (
                            <span className="release-notes-votes">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 19V5M5 12l7-7 7 7" />
                              </svg>
                              {item.vote_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="release-notes-pagination">
            {page > 1 && (
              <Link
                href={`/roadmap/releases?page=${page - 1}`}
                className="hover:underline"
                style={{ color: "var(--accent)" }}
              >
                ← Prev
              </Link>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/roadmap/releases?page=${page + 1}`}
                className="hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Next →
              </Link>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
