import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSession, getToken } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";
import { SourceTabs, type FeedSource } from "@/components/source-tabs";

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string; source?: string }>;
}

/**
 * Next.js hands dynamic segments over still percent-encoded, so every use of
 * the raw param has to decode first. The old code encoded it again on the way
 * to the API, producing `tag=Music%2520Education` — which is why a tag with a
 * space, an accent or any reserved character had never once worked: /tag/
 * Music%20Education, /tag/Interf%C3%A9rences and /tag/simon%20reynolds all
 * had entries and all rendered "No entries yet".
 */
function decodeTag(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // malformed escape — use it as typed rather than throwing
  }
}

function tagHref(tagName: string, source: FeedSource): string {
  const base = `/tag/${encodeURIComponent(tagName)}`;
  return source === "fediverse" ? `${base}?source=fediverse` : base;
}

/**
 * One page of the tag from one source. Shared by generateMetadata and the
 * page below, so it is fetched once.
 *
 * A failed fetch is rethrown rather than swallowed: an API restart used to
 * render this as "No entries yet", which is why these pages looked empty
 * even when the tag had content.
 */
const getTagEntries = cache(async (tagName: string, source: FeedSource, page: number, token: string | null): Promise<JournalEntry[]> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tagName)}&source=${source}&page=${page}`,
      {},
      token
    );
    return data.data ?? [];
  } catch (err) {
    notFoundOrRethrow(err);
  }
});

/** Does the tag have anything from this source? Only decides tabs and fallbacks. */
const tagHasEntries = cache(async (tagName: string, source: FeedSource, token: string | null): Promise<boolean> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tagName)}&source=${source}&per_page=1`,
      {},
      token
    );
    return (data.data ?? []).length > 0;
  } catch {
    // A blip mustn't hide Inkwell writing behind the fediverse tab; the
    // entries fetch below reports a real outage.
    return source === "inkwell";
  }
});

/**
 * Which view to show, and whether search engines may index it.
 *
 * Tag pages list Inkwell entries; posts from other servers are on their own
 * tab. Until 2026-09-26 the two were mixed, so /tag/technology showed 19
 * fediverse posts and one Inkwell entry, all of it indexable — including
 * posts by people who haven't opted in to search (Mastodon's "indexable" is
 * false for about 1 in 5 of the fediverse posts Inkwell stores). The fediverse tab is noindex, and
 * a tag no Inkwell writer has used opens straight on it.
 *
 * Search Console Jun–Sep 2026 for the pages this replaced: 822 tag pages
 * indexed, 4,682 impressions, 15 clicks; /tag/birthday drew 2,033 of those
 * for someone else's posts. The value was never in the federated half.
 */
const resolveTagView = cache(async (tagName: string, sourceParam: string | undefined, page: number, token: string | null) => {
  const requested: FeedSource = sourceParam === "fediverse" ? "fediverse" : "inkwell";
  const hasInkwell = await tagHasEntries(tagName, "inkwell", token);
  const source: FeedSource = requested === "inkwell" && !hasInkwell ? "fediverse" : requested;

  const entries = await getTagEntries(tagName, source, page, token);
  // Nothing here: 404 rather than a 200 that says "No entries yet".
  if (entries.length === 0) notFound();

  const hasFediverse = source === "fediverse" || (await tagHasEntries(tagName, "fediverse", token));

  return {
    source,
    entries,
    showTabs: hasInkwell && hasFediverse,
    // Paginated views duplicate page 1.
    indexable: source === "inkwell" && page === 1,
  };
});

export async function generateMetadata({ params, searchParams }: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const { page: pageParam, source: sourceParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const tagName = decodeTag(tag);
  const view = await resolveTagView(tagName, sourceParam, page, await getToken());

  const canonical = `https://inkwell.social/tag/${encodeURIComponent(tagName)}`;

  return {
    ...(view.indexable ? {} : { robots: { index: false, follow: true } }),
    title: `#${tagName}`,
    description: `Public journal entries tagged #${tagName} on Inkwell.`,
    openGraph: {
      title: `#${tagName} — Inkwell`,
      description: `Browse journal entries tagged #${tagName} on Inkwell.`,
      url: canonical,
    },
    alternates: { canonical },
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const session = await getSession();
  const { tag } = await params;
  const { page: pageParam, source: sourceParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const tagName = decodeTag(tag);

  const { source, entries, showTabs } = await resolveTagView(tagName, sourceParam, page, await getToken());

  const emptyState = (
    <div
      className="rounded-2xl border p-8 sm:p-12 text-center mx-auto max-w-sm sm:max-w-md"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
      }}
    >
      <p
        className="text-lg font-semibold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        No entries yet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        No public entries have been tagged with #{tagName} yet.
      </p>
      <Link
        href="/explore"
        className="rounded-full px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Explore all entries
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
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="text-sm hover:underline"
              style={{ color: "var(--muted)" }}
            >
              ← Explore
            </Link>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              &middot;
            </span>
            <h1
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              #{tagName}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/feed"
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Pen Pals
            </Link>
            <Link
              href="/explore"
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Explore
            </Link>
          </div>
        </div>
        {showTabs ? (
          <div className="mt-3">
            <SourceTabs active={source} hrefFor={(s) => tagHref(tagName, s)} label="Whose posts" />
          </div>
        ) : null}
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          {source === "inkwell"
            ? `Public entries tagged #${tagName}`
            : showTabs
              ? `Posts tagged #${tagName} from across the fediverse`
              : `No one on Inkwell has used #${tagName} yet. These are posts from across the fediverse.`}
        </p>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath={tagHref(tagName, source)}
        loadMorePath={`/api/explore?tag=${encodeURIComponent(tagName)}&source=${source}`}
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

      {/* RSS link */}
      <div className="mx-auto max-w-md px-4 pb-8">
        <div
          className="rounded-xl border p-4 text-center"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Subscribe to #{tagName} entries via{" "}
            <a
              href={`/api/tags/${encodeURIComponent(tagName)}/feed.xml`}
              className="underline"
              style={{ color: "var(--accent)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              RSS feed
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
