import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { StatusBadge, CategoryBadge } from "./badges";
import { UpvoteButton } from "./upvote-button";

export const metadata: Metadata = { title: "Roadmap · Inkwell" };

interface FeedbackPost {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  admin_response: string | null;
  release_note: string | null;
  completed_at: string | null;
  vote_count: number;
  comment_count: number;
  voted: boolean;
  author: {
    id: string | null;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  created_at: string;
  updated_at: string;
}

interface RoadmapData {
  data: {
    under_review: FeedbackPost[];
    planned: FeedbackPost[];
    in_progress: FeedbackPost[];
  };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const categories = [
  { value: "", label: "All" },
  { value: "bug", label: "Bugs" },
  { value: "feature", label: "Features" },
  { value: "idea", label: "Ideas" },
  { value: "question", label: "Questions" },
];

const sortOptions = [
  { value: "most_voted", label: "Most Voted" },
  { value: "newest", label: "Newest" },
  { value: "recently_updated", label: "Recently Updated" },
];

const statusFilters = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

const columnConfig = [
  {
    key: "under_review" as const,
    label: "Under Review",
    headerBg: "#DBEAFE",
    headerBorder: "#93C5FD",
    headerText: "#1D4ED8",
  },
  {
    key: "planned" as const,
    label: "Planned",
    headerBg: "#EDE9FE",
    headerBorder: "#C4B5FD",
    headerText: "#6D28D9",
  },
  {
    key: "in_progress" as const,
    label: "In Progress",
    headerBg: "#FEF3C7",
    headerBorder: "#FCD34D",
    headerText: "#B45309",
  },
];

interface PageProps {
  searchParams: Promise<{
    page?: string;
    category?: string;
    sort?: string;
    status?: string;
  }>;
}

export default async function RoadmapPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const category = params.category ?? "";
  const sort = params.sort ?? "most_voted";
  const status = params.status ?? "";

  const session = await getSession();
  const isLoggedIn = !!session;

  // Fetch all three data sources in parallel
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("sort", sort);
  if (category) qs.set("category", category);
  if (status) qs.set("status", status);

  const [postsResult, roadmapResult, releasesResult] = await Promise.allSettled([
    apiFetch<{ data: FeedbackPost[] }>(`/api/feedback?${qs}`, {}, session?.token),
    apiFetch<RoadmapData>("/api/feedback/roadmap", {}, session?.token),
    apiFetch<{ data: FeedbackPost[] }>("/api/feedback/releases?per_page=5", {}, session?.token),
  ]);

  const posts = postsResult.status === "fulfilled" ? postsResult.value.data ?? [] : [];
  const roadmap = roadmapResult.status === "fulfilled"
    ? roadmapResult.value.data
    : { under_review: [], planned: [], in_progress: [] };
  const releases = releasesResult.status === "fulfilled" ? releasesResult.value.data ?? [] : [];

  const hasRoadmapItems =
    roadmap.under_review.length > 0 ||
    roadmap.planned.length > 0 ||
    roadmap.in_progress.length > 0;

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const merged = { page: "1", category, sort, status, ...overrides };
    if (merged.category) p.set("category", merged.category);
    if (merged.sort && merged.sort !== "most_voted") p.set("sort", merged.sort);
    if (merged.status) p.set("status", merged.status);
    if (merged.page !== "1") p.set("page", merged.page);
    const s = p.toString();
    return `/roadmap${s ? `?${s}` : ""}`;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Roadmap
          </h1>
          <Link
            href="/roadmap/new"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Submit Feedback
          </Link>
        </div>

        {/* ── Roadmap Panel (Kanban) ─────────────────────────────────── */}
        {hasRoadmapItems && (
          <div className="mb-8">
            <div
              className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {columnConfig.map((col) => {
                const items = roadmap[col.key];
                return (
                  <div key={col.key}>
                    {/* Column header */}
                    <div
                      className="rounded-lg px-3 py-1.5 mb-3 text-xs font-semibold border"
                      style={{
                        background: col.headerBg,
                        borderColor: col.headerBorder,
                        color: col.headerText,
                      }}
                    >
                      {col.label} ({items.length})
                    </div>

                    {/* Column items */}
                    <div className="flex flex-col gap-2">
                      {items.length === 0 ? (
                        <p className="text-xs px-1 py-2" style={{ color: "var(--muted)" }}>
                          No items
                        </p>
                      ) : (
                        items.map((item) => (
                          <Link
                            key={item.id}
                            href={`/roadmap/${item.id}`}
                            className="block rounded-lg border p-3 transition-shadow hover:shadow-sm"
                            style={{ borderColor: "var(--border)", background: "var(--background)" }}
                          >
                            <p className="text-xs font-medium leading-snug mb-2 line-clamp-2">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                              <span className="flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                  strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                  <path d="M12 19V5M5 12l7-7 7 7"/>
                                </svg>
                                {item.vote_count}
                              </span>
                              <span className="flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                  strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                                {item.comment_count}
                              </span>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recently Shipped ───────────────────────────────────────── */}
        {releases.length > 0 && (
          <div className="mb-8">
            <h2
              className="text-sm font-semibold mb-3 flex items-center gap-1.5"
              style={{ color: "#047857" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              Recently Shipped
            </h2>

            <div className="flex flex-col gap-3">
              {releases.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border-l-4 border p-4"
                  style={{
                    borderColor: "var(--border)",
                    borderLeftColor: "#6EE7B7",
                    background: "var(--surface)",
                  }}
                >
                  <Link
                    href={`/roadmap/${item.id}`}
                    className="text-sm font-semibold hover:underline leading-snug flex items-center gap-1.5"
                    style={{ color: "var(--foreground)" }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#047857"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5"/>
                    </svg>
                    {item.title}
                  </Link>

                  {item.release_note && (
                    <p className="text-xs leading-relaxed mt-1.5 ml-5" style={{ color: "var(--muted)" }}>
                      {item.release_note}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2 ml-5 text-xs" style={{ color: "var(--muted)" }}>
                    <span className="flex items-center gap-1" style={{ color: "#047857" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                      </svg>
                      Suggested by
                    </span>
                    {item.author.avatar_url || item.author.display_name ? (
                      <Avatar
                        url={item.author.avatar_url}
                        name={item.author.display_name}
                        size={16}
                      />
                    ) : null}
                    {item.author.username !== "[deleted]" ? (
                      <Link href={`/${item.author.username}`} className="hover:underline font-medium">
                        @{item.author.username}
                      </Link>
                    ) : (
                      <span>@{item.author.username}</span>
                    )}
                    <span>·</span>
                    <span>{item.completed_at ? formatDate(item.completed_at) : formatDate(item.updated_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Link
                href={buildUrl({ status: "done" })}
                className="text-xs font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                View all release notes →
              </Link>
            </div>
          </div>
        )}

        {/* ── Category tabs ──────────────────────────────────────────── */}
        <div className="flex gap-1 mb-4 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          {categories.map((c) => {
            const active = category === c.value;
            return (
              <Link
                key={c.value}
                href={buildUrl({ category: c.value })}
                className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors whitespace-nowrap"
                style={{
                  borderColor: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}
              >
                {c.label}
              </Link>
            );
          })}
        </div>

        {/* Sort + Status filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex gap-1.5">
            {sortOptions.map((s) => {
              const active = sort === s.value;
              return (
                <Link
                  key={s.value}
                  href={buildUrl({ sort: s.value })}
                  className="px-3 py-1 text-xs font-medium rounded-full border transition-colors"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    background: active ? "var(--accent-light)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>

          <span className="text-xs" style={{ color: "var(--border)" }}>|</span>

          <div className="flex gap-1.5 overflow-x-auto">
            {statusFilters.map((sf) => {
              const active = status === sf.value;
              return (
                <Link
                  key={sf.value}
                  href={buildUrl({ status: sf.value })}
                  className="px-2.5 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap"
                  style={{
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    background: active ? "var(--accent-light)" : "transparent",
                    color: active ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {sf.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Posts list */}
        {posts.length === 0 ? (
          <div
            className="rounded-2xl border p-12 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p
              className="text-lg font-semibold mb-2"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              No posts yet
            </p>
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              Be the first to share an idea, report a bug, or request a feature.
            </p>
            <Link
              href="/roadmap/new"
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Submit Feedback
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="flex gap-3 rounded-xl border p-4 transition-shadow hover:shadow-sm"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {/* Upvote */}
                  <UpvoteButton
                    postId={post.id}
                    initialVoted={post.voted}
                    initialCount={post.vote_count}
                    isLoggedIn={isLoggedIn}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <Link
                        href={`/roadmap/${post.id}`}
                        className="text-sm font-semibold hover:underline leading-snug"
                        style={{ color: "var(--foreground)" }}
                      >
                        {post.title}
                      </Link>
                    </div>

                    <p
                      className="text-xs leading-relaxed mb-2 line-clamp-2"
                      style={{ color: "var(--muted)" }}
                    >
                      {post.body}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryBadge category={post.category} />
                      <StatusBadge status={post.status} />

                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        by{" "}
                        {post.author.username !== "[deleted]" ? (
                          <Link
                            href={`/${post.author.username}`}
                            className="hover:underline"
                          >
                            @{post.author.username}
                          </Link>
                        ) : (
                          <span>@{post.author.username}</span>
                        )}
                        {" · "}
                        {timeAgo(post.created_at)}
                      </span>

                      {/* Comment count */}
                      <Link
                        href={`/roadmap/${post.id}#comments`}
                        className="flex items-center gap-1 text-xs ml-auto"
                        style={{ color: "var(--muted)" }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        {post.comment_count}
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex justify-between mt-8 text-sm">
              {page > 1 ? (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              {posts.length === 20 && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="font-medium hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Older →
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
