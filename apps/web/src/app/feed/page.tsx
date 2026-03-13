import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { JournalFeed } from "@/components/journal-feed";
import { EducationCard } from "@/components/education-card";
import { PushPrompt } from "@/components/push-prompt";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import type { JournalEntry } from "@/components/journal-entry-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Feed" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyFeed({
  username,
  featuredEntries,
}: {
  username: string;
  featuredEntries: JournalEntry[];
}) {
  return (
    <div className="mx-auto" style={{ maxWidth: "640px" }}>
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <p
          className="text-lg font-semibold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Your Feed is quiet
        </p>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          Your Feed fills up as you follow writers. When your pen pals publish
          new entries, they appear here — like letters arriving in your mailbox.
        </p>

        {/* Action cards */}
        <div className="flex flex-col gap-2.5 text-left">
          <Link
            href="/explore"
            className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Explore what others are writing</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Browse public entries from Inkwell writers and the fediverse
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--muted)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>

          <Link
            href="/search"
            className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Find writers to follow</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Search for writers by name and send a follow request
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--muted)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>

          <Link
            href="/editor"
            className="flex items-center gap-3 rounded-xl border p-3.5 transition-all hover:border-[var(--accent)]"
            style={{ borderColor: "var(--border)", background: "var(--background)" }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Write your first entry</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Open the editor and start journaling
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--muted)", flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>

        {/* Fediverse hint */}
        <div
          className="mt-5 rounded-lg p-3 flex items-start gap-2.5 text-left"
          style={{ background: "var(--background)", border: "1px dashed var(--border)" }}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className="flex-shrink-0 mt-0.5"
            style={{ color: "var(--accent)" }}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Inkwell connects to the{" "}
            <Link href="/guide#fediverse" className="underline hover:no-underline" style={{ color: "var(--accent)" }}>
              fediverse
            </Link>
            {" "}— follow anyone on Mastodon, Pixelfed, or other platforms and their posts appear in your feed.{" "}
            <Link href="/search" className="underline hover:no-underline" style={{ color: "var(--accent)" }}>
              Search for fediverse handles
            </Link>
          </p>
        </div>
      </div>

      {/* Featured on Inkwell */}
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
                entry.source === "remote" && entry.url
                  ? entry.url
                  : `/${entry.author.username}/${entry.slug}`;

              return (
                <Link
                  key={entry.id}
                  href={entryHref}
                  {...(entry.source === "remote" ? { target: "_blank", rel: "noopener" } : {})}
                  className="flex items-start gap-3 rounded-xl border p-3.5 transition-all hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {/* Cover image or avatar */}
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
                      {entry.title || "Untitled"}
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
                      {(entry.ink_count ?? 0) > 0 && (
                        <>
                          <span className="text-xs" style={{ color: "var(--border)" }}>·</span>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            <svg
                              width="10" height="10" viewBox="0 0 24 24"
                              fill="currentColor" className="inline-block mr-0.5 -mt-px"
                              style={{ color: "var(--accent)" }}
                            >
                              <path d="M12 2C12 2 4 12.5 4 16.5C4 20.09 7.58 22 12 22C16.42 22 20 20.09 20 16.5C20 12.5 12 2 12 2Z" />
                            </svg>
                            {entry.ink_count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="flex-shrink-0 mt-1"
                    style={{ color: "var(--muted)" }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              );
            })}
          </div>

          <div className="text-center mt-3">
            <Link
              href="/explore"
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--accent)" }}
            >
              See more on Explore →
            </Link>
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

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: JournalEntry[] = [];
  let feedError = false;
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/feed?page=${page}`,
      {},
      session.token
    );
    entries = data.data ?? [];
  } catch {
    feedError = true;
  }

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
      {/* Header bar */}
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Feed
          </h1>

          <div className="flex items-center gap-2">
            <span
              className="text-xs px-3 py-1 rounded-full border font-medium"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
              }}
            >
              Feed
            </span>
            <Link
              href="/explore"
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Explore
            </Link>
          </div>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Journal entries from your pen pals
        </p>
      </div>

      {/* Push notification prompt — shown once, dismissible */}
      <PushPrompt />

      {/* Education card — shown once, dismissible */}
      <div className="mx-auto max-w-7xl px-4">
        <EducationCard
          storageKey="inkwell-edu-feed-card"
          heading="Welcome to your Feed"
          learnMoreHref="/guide#feed-explore"
        >
          <p>
            Your Feed shows journal entries from writers you follow — your pen
            pals. Entries from writers on Mastodon and other fediverse platforms
            you follow also appear here. Looking to discover new voices?{" "}
            <Link href="/explore" className="underline" style={{ color: "var(--accent)" }}>
              Switch to Explore
            </Link>
            .
          </p>
        </EducationCard>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath="/feed"
        loadMorePath="/api/feed"
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
        ) : <EmptyFeed username={session.user.username} featuredEntries={featuredEntries} />}
        session={{
          userId: session.user.id,
          username: session.user.username,
          isLoggedIn: true,
          isPlus: session.user.subscription_tier === "plus",
          isAdmin: !!session.user.is_admin,
          preferredLanguage: session.user.preferred_language,
        }}
      />

      {/* Bottom upsell for non-Plus users */}
      {session.user.subscription_tier !== "plus" && (
        <div className="mx-auto max-w-md px-4 pb-8">
          <div
            className="rounded-xl border p-4 text-center"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
              Upgrade to Plus for $5/mo — unlock extra features and keep Inkwell
              ad-free.
            </p>
            <Link
              href="/settings/billing"
              className="inline-block rounded-full px-4 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Upgrade to Plus
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
