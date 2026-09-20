import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
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

/**
 * Shared by generateMetadata and the page below, so the tag is fetched once.
 *
 * A failed fetch is rethrown rather than swallowed: an API restart used to
 * render this as "No entries yet", which is why these pages looked empty
 * even when the tag had content.
 */
const getTagEntries = cache(async (tagName: string, page: number): Promise<JournalEntry[]> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tagName)}&page=${page}`
    );
    return data.data ?? [];
  } catch (err) {
    notFoundOrRethrow(err);
  }
});

/**
 * Has any Inkwell writer used this tag?
 *
 * Asked of the API rather than inferred from the entries on screen: a tag
 * can have local posts that page 1 never shows, because the feed is ordered
 * by date and federated posts are far more numerous. /tag/tech has three
 * Inkwell entries and twenty fediverse ones ahead of them, so judging by
 * page 1 alone marked it noindex while the sitemap still listed it.
 */
const tagHasLocalEntries = cache(async (tagName: string): Promise<boolean> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tagName)}&source=inkwell&per_page=1`
    );
    return (data.data ?? []).length > 0;
  } catch {
    // Don't let a blip flip a good page to noindex.
    return true;
  }
});

/**
 * Whether this tag page is worth putting in Google's index.
 *
 * Tag pages are aggregations, and most of what carries a hashtag here comes
 * from the fediverse — posts whose canonical home is another server, and
 * which are deleted again when the relay copy expires. Search Console for
 * Jun–Sep 2026: 822 tag pages indexed against 46 in the sitemap, 4,682
 * impressions, 15 clicks. /tag/birthday alone drew 2,033 impressions at
 * position 2.8 with zero clicks, ranking for someone else's name while
 * showing an empty page, because the federated post behind it was long gone.
 *
 * So: a tag page earns indexing only when Inkwell's own writers have used
 * the tag. Pages of purely federated posts stay reachable and useful for
 * readers, but stop competing in search for content we did not write.
 */
async function tagIsIndexable(tagName: string, page: number): Promise<boolean> {
  if (page > 1) return false; // paginated views duplicate page 1
  return tagHasLocalEntries(tagName);
}

export async function generateMetadata({ params, searchParams }: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const tagName = decodeTag(tag);
  const entries = await getTagEntries(tagName, page);

  // Nothing here: 404 rather than a 200 that says "No entries yet".
  if (entries.length === 0) notFound();

  const canonical = `https://inkwell.social/tag/${encodeURIComponent(tagName)}`;

  return {
    ...((await tagIsIndexable(tagName, page)) ? {} : { robots: { index: false, follow: true } }),
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
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const tagName = decodeTag(tag);

  const entries = await getTagEntries(tagName, page);
  if (entries.length === 0) notFound();

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
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Public entries tagged #{tagName}
        </p>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath={`/tag/${encodeURIComponent(tagName)}`}
        loadMorePath={`/api/explore?tag=${encodeURIComponent(tagName)}`}
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
