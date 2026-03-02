import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import { EducationCard } from "@/components/education-card";
import type { JournalEntry } from "@/components/journal-entry-card";
import { CATEGORIES, getCategoryLabel, getCategorySlug } from "@/lib/categories";

export const metadata: Metadata = { title: "Explore · Inkwell" };

interface TrendingEntry {
  id: string;
  title: string | null;
  slug: string;
  ink_count: number;
  published_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string; category?: string; sort?: string }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const session = await getSession();
  const { page: pageParam, category, sort } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const activeSort = sort === "most_inked" ? "most_inked" : "newest";

  const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
  const sortParam = activeSort !== "newest" ? `&sort=${activeSort}` : "";

  let entries: JournalEntry[] = [];
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?page=${page}${categoryParam}${sortParam}`,
      {},
      session?.token
    );
    entries = data.data ?? [];
  } catch {
    // show empty state
  }

  // Fetch trending entries (only on first page, no category filter, newest sort)
  let trending: TrendingEntry[] = [];
  if (page === 1 && !category && activeSort === "newest") {
    try {
      const data = await apiFetch<{ data: TrendingEntry[] }>(
        "/api/explore/trending",
        {},
        session?.token
      );
      trending = data.data ?? [];
    } catch {
      // silent
    }
  }

  const categoryLabel = category ? getCategoryLabel(category) : null;

  const emptyState = (
    <div
      className="rounded-2xl border p-12 text-center mx-auto"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        maxWidth: "480px",
      }}
    >
      <p
        className="text-lg font-semibold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Nothing here yet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        {category
          ? `No public entries in ${categoryLabel} yet.`
          : "Be the first to write a public journal entry."}
      </p>
      <Link
        href={category ? "/explore" : "/editor"}
        className="rounded-full px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {category ? "View all entries" : "Start writing"}
      </Link>
    </div>
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header bar */}
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Explore
          </h1>

          <div className="flex items-center gap-2">
            <Link
              href="/feed"
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Feed
            </Link>
            <span
              className="text-xs px-3 py-1 rounded-full border font-medium"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
              }}
            >
              Explore
            </span>

            <span aria-hidden="true" style={{ color: "var(--border)" }}>|</span>

            {/* Sort toggle */}
            <Link
              href={`/explore${category ? `?category=${encodeURIComponent(category)}` : ""}`}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={activeSort === "newest" ? {
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
                fontWeight: 500,
              } : {
                borderColor: "var(--border)",
                color: "var(--muted)",
              }}
            >
              Newest
            </Link>
            <Link
              href={`/explore?sort=most_inked${category ? `&category=${encodeURIComponent(category)}` : ""}`}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={activeSort === "most_inked" ? {
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
                fontWeight: 500,
              } : {
                borderColor: "var(--border)",
                color: "var(--muted)",
              }}
            >
              Most Inked
            </Link>
          </div>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Discover entries from the community
        </p>
      </div>

      {/* Category filter bar */}
      <div className="mx-auto max-w-7xl px-4 pb-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 py-2" style={{ minWidth: "max-content" }}>
          <Link
            href="/explore"
            className="text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors"
            style={!category ? {
              borderColor: "var(--accent)",
              background: "var(--accent-light)",
              color: "var(--accent)",
              fontWeight: 500,
            } : {
              borderColor: "var(--border)",
              color: "var(--muted)",
            }}
          >
            All
          </Link>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.value}
              href={`/explore?category=${cat.value}`}
              className="text-xs px-3 py-1 rounded-full border whitespace-nowrap transition-colors"
              style={category === cat.value ? {
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
                fontWeight: 500,
              } : {
                borderColor: "var(--border)",
                color: "var(--muted)",
              }}
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Education card — shown once, dismissible */}
      <div className="mx-auto max-w-7xl px-4">
        <EducationCard
          storageKey="inkwell-edu-explore-card"
          heading="Discover the community"
          learnMoreHref="/guide#feed-explore"
        >
          <p>
            Explore shows all public entries from Inkwell writers and the wider
            fediverse — a network of connected platforms including Mastodon and
            others. You might notice some entries show handles like{" "}
            <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
              @user@mastodon.social
            </span>
            {" "}— those are from writers on other fediverse platforms.
          </p>
        </EducationCard>
      </div>

      {/* Trending This Week */}
      {trending.length > 0 && (
        <div className="mx-auto max-w-7xl px-4 pb-4">
          <h2
            className="text-xs font-semibold uppercase tracking-widest mb-3"
            style={{
              color: "var(--muted)",
              fontFamily: "var(--font-lora, Georgia, serif)",
              letterSpacing: "0.1em",
            }}
          >
            Trending This Week
          </h2>
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "thin" }}
          >
            {trending.map((t) => (
              <Link
                key={t.id}
                href={`/${t.author.username}/${t.slug}`}
                className="flex-shrink-0 rounded-xl border p-3 transition-colors hover:border-[var(--accent)]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  width: 220,
                }}
              >
                <p
                  className="text-sm font-medium leading-snug line-clamp-2 mb-2"
                  style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                >
                  {t.title || "Untitled"}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {t.author.display_name}
                  </span>
                  <span
                    className="text-xs font-medium flex items-center gap-1"
                    style={{ color: "var(--accent)" }}
                  >
                    <svg width="10" height="12" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                      <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
                    </svg>
                    {t.ink_count}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath="/explore"
        loadMorePath={(() => {
          const p = new URLSearchParams();
          if (category) p.set("category", category);
          if (activeSort !== "newest") p.set("sort", activeSort);
          const qs = p.toString();
          return `/api/explore${qs ? `?${qs}` : ""}`;
        })()}
        extraParams={`${category ? `&category=${encodeURIComponent(category)}` : ""}${activeSort !== "newest" ? `&sort=${activeSort}` : ""}`}
        emptyState={emptyState}
        session={session ? {
          userId: session.user.id,
          isLoggedIn: true,
          isPlus: session.user.subscription_tier === "plus",
        } : null}
      />

      {/* About Inkwell footer */}
      <div className="mx-auto max-w-md px-4 pb-8">
        <div
          className="rounded-xl border p-4 text-center"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            A federated journaling platform. No algorithms, no ads — just
            writing and pen pals.
          </p>
        </div>
      </div>
    </div>
  );
}
