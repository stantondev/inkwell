import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { siteLookOf } from "@/lib/site-look";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { JournalFeed } from "@/components/journal-feed";
import { EducationCard } from "@/components/education-card";
import { WhatsNewNotice } from "@/components/whats-new-state";
import { LATEST_WHATS_NEW_ID } from "@/lib/whats-new";
import { GettingStartedChecklist } from "@/components/getting-started-checklist";
import { PushPrompt } from "@/components/push-prompt";
import { ResubscribeBanner } from "@/components/resubscribe-banner";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import { FilterLink } from "@/components/filter-link";
import type { JournalEntry } from "@/components/journal-entry-card";
import { SuggestedWriters } from "@/components/suggested-writers";
import { FeedSeen } from "@/components/feed-seen";
import { LocalDate } from "@/components/local-date";
import { isSupporter } from "@/lib/supporter";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feed" };

interface PageProps {
  // Feed is only the people you follow, newest first. Old ?category= and
  // ?sort= links (from before 2026-09-25) are ignored; those live on Explore.
  searchParams: Promise<{ page?: string; source?: string }>;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyFeed({ featuredEntries }: { featuredEntries: JournalEntry[] }) {
  return (
    <div className="mx-auto px-4" style={{ maxWidth: "680px" }}>
      <div
        className="rounded-2xl border p-6 sm:p-8"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p
          className="text-lg font-semibold mb-2 text-center"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your Feed is quiet
        </p>
        <p className="text-sm mb-5 text-center" style={{ color: "var(--muted)" }}>
          Your Feed shows new entries from the people you follow, newest first,
          like letters arriving. Follow a few writers and their public entries
          start arriving right away; once they accept, you&apos;re pen pals and
          you&apos;ll see their pen-pals-only entries too.
        </p>

        <SuggestedWriters limit={6} />

        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link href="/explore" className="hover:underline" style={{ color: "var(--accent)" }}>
            Browse everyone on Explore →
          </Link>
          <Link href="/explore?focus=search" className="hover:underline" style={{ color: "var(--accent)" }}>
            Find someone on Mastodon →
          </Link>
          <Link href="/editor" className="hover:underline" style={{ color: "var(--accent)" }}>
            Write an entry →
          </Link>
        </div>
      </div>

      {/* Something to read while the Feed fills up */}
      {featuredEntries.length > 0 && (
        <div className="mt-6">
          <p
            className="text-sm font-semibold mb-3 text-center"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Featured on Inkwell
          </p>
          <div className="flex flex-col gap-2.5">
            {featuredEntries.map((entry) => {
              const readingTime = entry.word_count
                ? Math.max(1, Math.round(entry.word_count / 250))
                : null;
              const entryHref =
                entry.source === "remote"
                  ? `/fediverse/${entry.id}`
                  : `/${entry.author.username}/${entry.slug}`;

              return (
                <Link
                  key={entry.id}
                  href={entryHref}
                  className="flex items-start gap-3 rounded-xl border p-3.5 transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {entry.cover_image_id ? (
                    <div
                      className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden"
                      style={{ background: "var(--background)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/images/${entry.cover_image_id}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0">
                      <AvatarWithFrame
                        url={entry.author.avatar_url}
                        name={entry.author.display_name || entry.author.username}
                        size={40}
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-snug line-clamp-1">
                      {entry.title || (entry.kind === "sticky" ? "Sticky" : "Untitled")}
                    </p>
                    {entry.excerpt && (
                      <p
                        className="text-xs mt-0.5 line-clamp-2 leading-relaxed"
                        style={{ color: "var(--muted)" }}
                      >
                        {entry.excerpt}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs" style={{ color: "var(--accent)" }}>
                        {entry.author.display_name || entry.author.username}
                      </span>
                      {readingTime && (
                        <>
                          <span className="text-xs" style={{ color: "var(--border)" }}>·</span>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {readingTime} min read
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function FeedPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) notFound();

  const accountAgeDays = (Date.now() - new Date(session.user.created_at).getTime()) / 86_400_000;
  const showGettingStarted = accountAgeDays < 30 && !session.user.settings?.getting_started_dismissed;

  // One notice above the feed at a time. Up to five used to stack here
  // (resubscribe, checklist or What's new, push prompt, welcome card), which on
  // a phone pushed the first entry below the fold. The rest wait their turn:
  // dismissing one shows the next on a later visit.
  const settings = session.user.settings ?? {};
  const eduFeedDismissed = ((settings.dismissed_education_cards as string[] | undefined) ?? []).includes("inkwell-edu-feed-card");
  const feedNotice: "resubscribe" | "checklist" | "welcome" | "whats-new" | "push" =
    session.user.needs_resubscribe && !settings.resubscribe_banner_dismissed ? "resubscribe"
    : showGettingStarted ? "checklist"
    : !eduFeedDismissed ? "welcome"
    : settings.whats_new_seen !== LATEST_WHATS_NEW_ID ? "whats-new"
    : "push";

  const { page: pageParam, source } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  // Default to everyone you follow, on Inkwell and the fediverse
  const activeSource: "inkwell" | "fediverse" | null =
    source === "inkwell" ? "inkwell" :
    source === "fediverse" ? "fediverse" :
    null;
  const sourceParam = activeSource ? `&source=${activeSource}` : "";
  let entries: JournalEntry[] = [];
  let feedError = false;
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/feed?page=${page}${sourceParam}`,
      {},
      session.token
    );
    entries = data.data ?? [];
  } catch {
    feedError = true;
  }

  // "New since your last visit": entries after settings.feed_seen_at. The very
  // first visit has nothing to compare with, so nothing is marked.
  const seenAt = typeof settings.feed_seen_at === "string" ? settings.feed_seen_at : null;
  const arrivedAt = (e: JournalEntry) => e.reprinted_at ?? e.published_at;
  const newestIso = entries.reduce<string | null>(
    (max, e) => (!max || Date.parse(arrivedAt(e)) > Date.parse(max) ? arrivedAt(e) : max),
    null
  );
  const newCount = seenAt && page === 1
    ? entries.filter((e) => e.author.id !== session.user.id && Date.parse(arrivedAt(e)) > Date.parse(seenAt)).length
    : 0;
  const nowIso = new Date().toISOString();

  // Fetch featured entries for the empty feed state
  let featuredEntries: JournalEntry[] = [];
  if (!feedError && entries.length === 0) {
    try {
      // Try trending first (most-inked recent entries)
      const trendingData = await apiFetch<{ data: JournalEntry[] }>(
        "/api/explore/trending",
        {},
        session.token
      );
      featuredEntries = (trendingData.data ?? []).slice(0, 5);

      // Fall back to newest explore entries if no trending
      if (featuredEntries.length === 0) {
        const exploreData = await apiFetch<{ data: JournalEntry[] }>(
          "/api/explore?page=1",
          {},
          session.token
        );
        featuredEntries = (exploreData.data ?? []).slice(0, 5);
      }
    } catch {
      // Non-critical — empty feed still works without featured entries
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* The top of the Feed is one row (title, date, what's new, and the
          Everyone / Inkwell / Fediverse switch) plus at most one slim notice.
          It used to stack five bands (switch, "new" line, dispatch header, jot
          box, a notice card) above the book. */}
      <header className="feed-top mx-auto max-w-7xl px-4">
        <div className="feed-top-row">
          <div className="feed-top-title">
            <h1 className="feed-top-h1">Your Feed</h1>
            <span className="feed-top-date">
              <LocalDate iso={nowIso} options={{ weekday: "long", month: "long", day: "numeric" }} />
            </span>
          </div>
          {newCount > 0 && (
            <span className="feed-new-count">
              {newCount === entries.length && entries.length >= 20 ? "20+" : newCount} new
              <span className="feed-new-count-long">&nbsp;since your last visit</span>
            </span>
          )}
          <nav className="explore-controls-source feed-top-switch" aria-label="Show entries from">
            {([
              { label: "Everyone", value: null },
              { label: "Inkwell", value: "inkwell" },
              { label: "Fediverse", value: "fediverse" },
            ] as const).map((s) => (
              <FilterLink
                key={s.label}
                href={s.value ? `/feed?source=${s.value}` : "/feed"}
                className={`explore-controls-source-segment${activeSource === s.value ? " active" : ""}`}
                aria-current={activeSource === s.value ? "page" : undefined}
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
            ))}
          </nav>
        </div>

        {/* The one notice (see feedNotice above), as a single line */}
        {feedNotice === "resubscribe" && (
          <ResubscribeBanner needsResubscribe={session.user.needs_resubscribe} serverDismissed={false} />
        )}
        {feedNotice === "checklist" && <GettingStartedChecklist username={session.user.username} />}
        {feedNotice === "whats-new" && (
          <WhatsNewNotice serverSeen={settings.whats_new_seen as string | undefined} />
        )}
        {feedNotice === "push" && <PushPrompt serverDismissed={!!settings.push_prompt_dismissed} />}
        {feedNotice === "welcome" && (
          <EducationCard
            variant="strip"
            storageKey="inkwell-edu-feed-card"
            heading="How it works"
            learnMoreHref="/guide#feed-explore"
            serverDismissed={false}
          >
            Everyone you follow, newest first. Follow a writer and their public
            entries arrive here right away.
          </EducationCard>
        )}
      </header>
      {/* Only the full Feed moves the "last read" mark: a filtered view would
          mark the other source's unseen entries as read. */}
      <FeedSeen newest={page === 1 && !activeSource ? newestIso : null} seenAt={seenAt} />

        {/* Journal area */}
        <JournalFeed
          entries={entries}
          page={page}
          basePath="/feed"
          look={siteLookOf(session?.user.settings)}
          showNewStickies={activeSource !== "fediverse"}
          loadMorePath={`/api/feed${activeSource ? `?source=${activeSource}` : ""}`}
          extraParams={sourceParam}
          newSince={seenAt}
          endNote={
            <>
              <p className="feed-end-title">That&apos;s everything from the people you follow.</p>
              <Link href="/explore" className="feed-end-link">Find more writers on Explore →</Link>
            </>
          }
          emptyState={feedError ? (
            <div
              className="rounded-2xl border p-12 text-center"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <p className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                Couldn&apos;t load your feed
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
                Something went wrong. Please try refreshing the page.
              </p>
            </div>
          ) : activeSource ? (
            <div
              className="rounded-2xl border p-10 text-center mx-auto"
              style={{ borderColor: "var(--border)", background: "var(--surface)", maxWidth: "480px" }}
            >
              <p className="text-base font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
                {activeSource === "inkwell" ? "Nothing from Inkwell writers you follow yet" : "Nothing from fediverse accounts you follow yet"}
              </p>
              <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--accent)" }}>
                Show everyone you follow →
              </Link>
            </div>
          ) : <EmptyFeed featuredEntries={featuredEntries} />}
          session={{
            userId: session.user.id,
            username: session.user.username,
            isLoggedIn: true,
            isPlus: session.user.subscription_tier === "plus",
            isAdmin: !!session.user.is_admin,
            preferredLanguage: session.user.preferred_language,
          }}
        />

        {/* Bottom upsell — only show on mobile (desktop uses book layout) */}
        {session.user.subscription_tier !== "plus" ? (
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
                Enjoying your journal?
              </p>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                Plus members get custom themes, unlimited drafts, newsletter
                delivery, and a custom domain. $5/month, no ads, no algorithms.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link
                  href="/settings/billing"
                  className="inline-block rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  Upgrade to Plus
                </Link>
                <Link
                  href="/settings/billing"
                  className="text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  See what&apos;s included
                </Link>
              </div>
            </div>
          </div>
        ) : !isSupporter(session.user) ? (
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
        ) : null}
    </div>
  );
}
