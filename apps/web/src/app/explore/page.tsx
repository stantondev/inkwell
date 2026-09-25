import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { siteLookOf } from "@/lib/site-look";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import { EducationCard } from "@/components/education-card";
import { ResubscribeBanner } from "@/components/resubscribe-banner";
import { FilterLink } from "@/components/filter-link";
import { FetchError } from "@/components/fetch-error";
import { ExploreSearchWrapper } from "@/components/explore-search-wrapper";
import { TopicMenu } from "@/components/topic-menu";
import { WritersToMeetPage, MostInkedPage } from "@/components/explore-front-pages";
import type { SuggestedWriter } from "@/components/suggested-writers";
import type { JournalEntry } from "@/components/journal-entry-card";
import { CATEGORIES, getCategoryLabel } from "@/lib/categories";
import { isSupporter } from "@/lib/supporter";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Discover journal entries from the Inkwell community and writers across the fediverse. Browse by topic, find the most-inked writing, and meet new writers.",
  openGraph: {
    title: "Explore — Inkwell",
    description:
      "Discover journal entries from writers across the open web.",
    url: "https://inkwell.social/explore",
  },
  alternates: { canonical: "https://inkwell.social/explore" },
};

interface PageProps {
  searchParams: Promise<{ page?: string; category?: string; sort?: string; source?: string; q?: string }>;
}

type Source = "inkwell" | "fediverse";
type Sort = "newest" | "most_inked";

// Explore = the bookstore: everyone's public writing, with search, topics and
// "Most inked". Two tabs: Inkwell writers (default) and the fediverse. The
// mixed "All" view is gone (2026-09-25): fediverse posts outnumbered Inkwell
// writing so heavily that some topics showed no Inkwell entries at all. Old
// ?source=all links open the Inkwell tab.
function exploreHref({ source, category, sort }: { source: Source; category?: string | null; sort?: Sort }) {
  const p = new URLSearchParams();
  if (source === "fediverse") p.set("source", "fediverse");
  if (category) p.set("category", category);
  if (sort === "most_inked" && source === "inkwell") p.set("sort", "most_inked");
  const qs = p.toString();
  return `/explore${qs ? `?${qs}` : ""}`;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const session = await getSession();
  const { page: pageParam, category, sort, source } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const activeSource: Source = source === "fediverse" ? "fediverse" : "inkwell";
  const activeSort: Sort = sort === "most_inked" && activeSource === "inkwell" ? "most_inked" : "newest";

  const params = new URLSearchParams({ source: activeSource });
  if (category) params.set("category", category);
  if (activeSort !== "newest") params.set("sort", activeSort);
  const listQuery = params.toString();

  // The default view opens on two front pages: "Writers to meet" and "Most
  // inked this month". Any topic, sort, the fediverse tab or a later page goes
  // straight to the entries.
  const showFront = page === 1 && !category && activeSort === "newest" && activeSource === "inkwell";

  const [entriesRes, writersRes, inkedRes] = await Promise.allSettled([
    apiFetch<{ data: JournalEntry[] }>(`/api/explore?page=${page}&${listQuery}`, {}, session?.token),
    showFront ? apiFetch<{ data: SuggestedWriter[] }>("/api/explore/writers?limit=8", {}, session?.token) : Promise.resolve({ data: [] }),
    showFront ? apiFetch<{ data: JournalEntry[] }>("/api/explore/trending", {}, session?.token) : Promise.resolve({ data: [] }),
  ]);
  const fetchFailed = entriesRes.status === "rejected";
  const entries = entriesRes.status === "fulfilled" ? entriesRes.value.data ?? [] : [];
  const writers = writersRes.status === "fulfilled" ? writersRes.value.data ?? [] : [];
  const mostInked = inkedRes.status === "fulfilled" ? inkedRes.value.data ?? [] : [];

  const frontPages = [
    ...(writers.length > 0 ? [<WritersToMeetPage key="writers" writers={writers} signedIn={!!session} />] : []),
    ...(mostInked.length > 0 ? [<MostInkedPage key="inked" entries={mostInked} />] : []),
  ];

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
        href={category ? exploreHref({ source: activeSource }) : "/editor"}
        className="rounded-full px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        {category ? "Show every topic" : "Start writing"}
      </Link>
    </div>
  );

  const controls = (
    <>
      <nav className="explore-controls-source explore-tabs" aria-label="Whose writing">
        {([
          { label: "Inkwell", value: "inkwell" },
          { label: "Fediverse", value: "fediverse" },
        ] as const).map((s) => (
          <FilterLink
            key={s.value}
            href={exploreHref({ source: s.value, category, sort: activeSort })}
            className={`explore-controls-source-segment${activeSource === s.value ? " active" : ""}`}
            aria-current={activeSource === s.value ? "page" : undefined}
          >
            {s.value === "inkwell" ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            <span>{s.label}</span>
          </FilterLink>
        ))}
      </nav>

      <TopicMenu
        items={[
          { label: "All topics", href: exploreHref({ source: activeSource, sort: activeSort }), active: !category },
          ...CATEGORIES.map((c) => ({
            label: c.label,
            href: exploreHref({ source: activeSource, category: c.value, sort: activeSort }),
            active: category === c.value,
          })),
        ]}
      />

      {activeSource === "inkwell" && (
        <div className="explore-controls-sort" role="group" aria-label="Order">
          {([
            { label: "Newest", value: "newest" },
            { label: "Most inked", value: "most_inked" },
          ] as const).map((s) => (
            <FilterLink
              key={s.value}
              href={exploreHref({ source: activeSource, category, sort: s.value })}
              className={`explore-controls-sort-toggle${activeSort === s.value ? " active" : ""}`}
              aria-current={activeSort === s.value ? "page" : undefined}
              title={s.label}
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
              <span className="explore-sort-label">{s.label}</span>
            </FilterLink>
          ))}
        </div>
      )}
    </>
  );

  // At most one notice line, as on the Feed.
  const needsResubscribe = !!session?.user.needs_resubscribe && !session.user.settings?.resubscribe_banner_dismissed;
  const notice = !session ? (
    <div className="notice-strip" role="note">
      <span className="notice-strip-label">New here?</span>
      <span className="notice-strip-text">
        Inkwell is a quiet place to keep a journal and read other people&rsquo;s. No ads, no algorithm.
      </span>
      <a href="/get-started" className="notice-strip-link">Start your journal →</a>
    </div>
  ) : needsResubscribe ? (
    <ResubscribeBanner needsResubscribe serverDismissed={false} />
  ) : (
    <EducationCard
      variant="strip"
      storageKey="inkwell-edu-explore-card-v2"
      heading="How it works"
      learnMoreHref="/guide#feed-explore"
      serverDismissed={((session.user.settings?.dismissed_education_cards as string[] | undefined) ?? []).includes("inkwell-edu-explore-card-v2")}
    >
      Public writing from everyone on Inkwell, not just people you follow. The
      Fediverse tab shows posts from Mastodon and other servers.
    </EducationCard>
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <ExploreSearchWrapper controls={controls} notice={notice}>
        <JournalFeed
          entries={entries}
          page={page}
          basePath="/explore"
          look={siteLookOf(session?.user.settings)}
          frontPages={frontPages}
          loadMorePath={`/api/explore?${listQuery}`}
          extraParams={`&${listQuery}`}
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
        {session && !isSupporter(session.user) && (
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
