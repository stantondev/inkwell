import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import { EducationCard } from "@/components/education-card";
import { SignupCta } from "@/components/signup-cta";
import { FilterLink } from "@/components/filter-link";
import { FetchError } from "@/components/fetch-error";
import { ExploreSearchWrapper } from "@/components/explore-search-wrapper";
import type { JournalEntry } from "@/components/journal-entry-card";
import { CATEGORIES, getCategoryLabel, getCategorySlug } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Discover journal entries from the Inkwell community and writers across the fediverse. Browse by category, find trending writing, and connect with new writers.",
  openGraph: {
    title: "Explore — Inkwell",
    description:
      "Discover journal entries from writers across the open web.",
    url: "https://inkwell.social/explore",
  },
  alternates: { canonical: "https://inkwell.social/explore" },
};

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
  searchParams: Promise<{ page?: string; category?: string; sort?: string; source?: string; q?: string }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const session = await getSession();
  const { page: pageParam, category, sort, source } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const activeSort = sort === "most_inked" ? "most_inked" : "newest";
  // Default to Inkwell-only — users opt into fediverse content via "All" or "Fediverse" pills
  const activeSource: string | null =
    source === "all" ? null :
    source === "fediverse" ? "fediverse" :
    "inkwell";  // default when no source param or source=inkwell

  const categoryParam = category ? `&category=${encodeURIComponent(category)}` : "";
  const sortParam = activeSort !== "newest" ? `&sort=${activeSort}` : "";
  const sourceParam = activeSource ? `&source=${activeSource}` : "";

  let entries: JournalEntry[] = [];
  let fetchFailed = false;
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?page=${page}${categoryParam}${sortParam}${sourceParam}`,
      {},
      session?.token
    );
    entries = data.data ?? [];
  } catch {
    fetchFailed = true;
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

  const emptyState = fetchFailed ? (
    <FetchError message="We couldn't load entries right now." />
  ) : (
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
      <ExploreSearchWrapper>
        {/* Row 2: Source segmented control (left) + Sort toggles (right) */}
        <div className="mx-auto max-w-7xl px-4 pb-1">
          <div className="explore-controls-row">
            {/* Source segmented control */}
            <div className="explore-controls-source">
              {([
                { label: "Inkwell", value: "inkwell" },
                { label: "All", value: "all" },
                { label: "Fediverse", value: "fediverse" },
              ] as const).map((s) => {
                const p = new URLSearchParams();
                if (category) p.set("category", category);
                if (activeSort !== "newest") p.set("sort", activeSort);
                if (s.value !== "inkwell") p.set("source", s.value);
                const qs = p.toString();
                const isActive =
                  (s.value === "inkwell" && activeSource === "inkwell") ||
                  (s.value === "all" && activeSource === null) ||
                  (s.value === "fediverse" && activeSource === "fediverse");
                return (
                  <FilterLink
                    key={s.label}
                    href={`/explore${qs ? `?${qs}` : ""}`}
                    className={`explore-controls-source-segment${isActive ? " active" : ""}`}
                  >
                    {s.value === "inkwell" && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                        <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
                      </svg>
                    )}
                    {s.value === "fediverse" && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                    )}
                    <span>{s.label}</span>
                  </FilterLink>
                );
              })}
            </div>

            {/* Sort icon toggles */}
            <div className="explore-controls-sort">
              {([
                { label: "Newest", value: "newest" },
                { label: "Most Inked", value: "most_inked" },
              ] as const).map((s) => {
                const p = new URLSearchParams();
                if (category) p.set("category", category);
                if (s.value !== "newest") p.set("sort", s.value);
                if (activeSource) p.set("source", activeSource);
                const qs = p.toString();
                const isActive = activeSort === s.value;
                return (
                  <FilterLink
                    key={s.label}
                    href={`/explore${qs ? `?${qs}` : ""}`}
                    className={`explore-controls-sort-toggle${isActive ? " active" : ""}`}
                  >
                    {s.value === "newest" ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                    ) : (
                      <svg width="13" height="15" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true">
                        <path d="M8 1C8 1 1 8.5 1 12.5a7 7 0 0 0 14 0C15 8.5 8 1 8 1Z" />
                      </svg>
                    )}
                    <span>{s.label}</span>
                  </FilterLink>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 3: Category bookstore shelf */}
        <div className="mx-auto max-w-7xl px-4 pb-2 overflow-x-auto">
          <div className="explore-controls-categories" style={{ minWidth: "max-content" }}>
            <FilterLink
              href={(() => {
                const p = new URLSearchParams();
                if (activeSort !== "newest") p.set("sort", activeSort);
                if (activeSource) p.set("source", activeSource);
                const qs = p.toString();
                return `/explore${qs ? `?${qs}` : ""}`;
              })()}
              className={`explore-controls-category${!category ? " active" : ""}`}
            >
              All
            </FilterLink>
            {CATEGORIES.map((cat) => {
              const p = new URLSearchParams();
              p.set("category", cat.value);
              if (activeSort !== "newest") p.set("sort", activeSort);
              if (activeSource) p.set("source", activeSource);
              return (
                <FilterLink
                  key={cat.value}
                  href={`/explore?${p.toString()}`}
                  className={`explore-controls-category${category === cat.value ? " active" : ""}`}
                >
                  {cat.label}
                </FilterLink>
              );
            })}
          </div>
        </div>

        {/* Signup banner for logged-out visitors */}
        {!session && (
          <div className="mx-auto max-w-7xl px-4 mb-2">
            <SignupCta
              variant="banner"
              heading="Discover writers. Start your journal."
              subheading="No algorithms, no ads — just writing, community, and the open social web."
            />
          </div>
        )}

        {/* Education card — shown once, dismissible */}
        <div className="mx-auto max-w-7xl px-4">
          <EducationCard
            storageKey="inkwell-edu-explore-card-v2"
            heading="Discover the community"
            learnMoreHref="/guide#interaction"
          >
            <p>
              Explore shows all public entries from Inkwell writers and the
              fediverse (Mastodon and other connected platforms). Click the <strong>ink drop</strong> icon on entries you
              think deserve more readers — the most-inked entries appear in{" "}
              <strong>Trending This Week</strong> above, and you can sort
              by &ldquo;Most Inked&rdquo; to find community favorites.
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
            if (activeSource) p.set("source", activeSource);
            const qs = p.toString();
            return `/api/explore${qs ? `?${qs}` : ""}`;
          })()}
          extraParams={`${category ? `&category=${encodeURIComponent(category)}` : ""}${activeSort !== "newest" ? `&sort=${activeSort}` : ""}${activeSource ? `&source=${activeSource}` : ""}`}
          emptyState={emptyState}
          session={session ? {
            userId: session.user.id,
            username: session.user.username,
            isLoggedIn: true,
            isPlus: session.user.subscription_tier === "plus",
            isAdmin: !!session.user.is_admin,
            preferredLanguage: session.user.preferred_language,
          } : null}
        />

        {/* Ink Donor CTA — show to logged-in non-donor users */}
        {session && session.user.ink_donor_status !== "active" && (
          <div className="mx-auto max-w-md px-4 pb-8 lg:hidden">
            <div
              className="rounded-xl border p-4 text-center"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              <p
                className="text-sm font-medium mb-1"
                style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}
              >
                Keep the ink flowing.
              </p>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                Inkwell runs on readers and writers, not ads or algorithms.
                Ink Donors help keep this space independent. From $1/month.
              </p>
              <Link
                href="/settings/billing"
                className="inline-block rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Become an Ink Donor
              </Link>
            </div>
          </div>
        )}

      </ExploreSearchWrapper>
    </div>
  );
}
