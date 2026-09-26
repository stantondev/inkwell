import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getSession, getToken } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";
import { SourceTabs, type FeedSource } from "@/components/source-tabs";
import { notFoundOrRethrow } from "@/lib/page-errors";
import { CATEGORIES, getCategoryFromSlug, getCategoryLabel } from "@/lib/categories";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; source?: string }>;
}

function isKnownCategory(value: string): boolean {
  return CATEGORIES.some((c) => c.value === value);
}

function categoryHref(slug: string, source: FeedSource): string {
  return source === "fediverse" ? `/category/${slug}?source=fediverse` : `/category/${slug}`;
}

const getCategoryEntries = cache(async (category: string, source: FeedSource, page: number, token: string | null): Promise<JournalEntry[]> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?category=${encodeURIComponent(category)}&source=${source}&page=${page}`,
      {},
      token
    );
    return data.data ?? [];
  } catch (err) {
    notFoundOrRethrow(err);
  }
});

const categoryHasEntries = cache(async (category: string, source: FeedSource, token: string | null): Promise<boolean> => {
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?category=${encodeURIComponent(category)}&source=${source}&per_page=1`,
      {},
      token
    );
    return (data.data ?? []).length > 0;
  } catch {
    return source === "inkwell";
  }
});

/**
 * Topic pages work like tag pages: Inkwell entries first, fediverse posts
 * (matched by hashtag) on their own noindex tab, and a topic no Inkwell
 * writer has used yet opens on that tab. See the tag page for why.
 */
const resolveCategoryView = cache(async (category: string, sourceParam: string | undefined, page: number, token: string | null) => {
  const requested: FeedSource = sourceParam === "fediverse" ? "fediverse" : "inkwell";
  const hasInkwell = await categoryHasEntries(category, "inkwell", token);
  const source: FeedSource = requested === "inkwell" && !hasInkwell ? "fediverse" : requested;
  const entries = await getCategoryEntries(category, source, page, token);
  const hasFediverse = source === "fediverse" || (await categoryHasEntries(category, "fediverse", token));

  return {
    source,
    entries,
    showTabs: hasInkwell && hasFediverse,
    indexable: source === "inkwell" && page === 1 && entries.length > 0,
  };
});

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { page: pageParam, source: sourceParam } = await searchParams;
  const categoryValue = getCategoryFromSlug(slug);
  if (!isKnownCategory(categoryValue)) notFound();

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const label = getCategoryLabel(categoryValue);
  const view = await resolveCategoryView(categoryValue, sourceParam, page, await getToken());

  return {
    ...(view.indexable ? {} : { robots: { index: false, follow: true } }),
    title: label ?? slug,
    description: `Browse ${label ?? slug} journal entries on Inkwell.`,
    openGraph: {
      title: `${label ?? slug} — Inkwell`,
      description: `Browse ${label ?? slug} journal entries on Inkwell.`,
      url: `https://inkwell.social/category/${slug}`,
    },
    alternates: { canonical: `https://inkwell.social/category/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const session = await getSession();
  const { slug } = await params;
  const { page: pageParam, source: sourceParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const categoryValue = getCategoryFromSlug(slug);
  if (!isKnownCategory(categoryValue)) notFound();
  const categoryLabel = getCategoryLabel(categoryValue);

  const { source, entries, showTabs } = await resolveCategoryView(categoryValue, sourceParam, page, await getToken());

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
        No public entries have been categorized as {categoryLabel} yet.
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
              &larr; Explore
            </Link>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              &middot;
            </span>
            <h1
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              {categoryLabel}
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
            <SourceTabs active={source} hrefFor={(s) => categoryHref(slug, s)} label="Whose posts" />
          </div>
        ) : null}
        <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          {source === "inkwell"
            ? `Public entries in ${categoryLabel}`
            : showTabs
              ? `Posts about ${categoryLabel} from across the fediverse`
              : `No one on Inkwell has written in ${categoryLabel} yet. These are posts from across the fediverse.`}
        </p>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath={categoryHref(slug, source)}
        loadMorePath={`/api/explore?category=${encodeURIComponent(categoryValue)}&source=${source}`}
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
    </div>
  );
}
