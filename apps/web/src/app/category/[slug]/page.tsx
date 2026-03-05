import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";
import { CATEGORIES, getCategoryFromSlug, getCategoryLabel } from "@/lib/categories";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const label = getCategoryLabel(getCategoryFromSlug(slug));
  return {
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
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  const categoryValue = getCategoryFromSlug(slug);
  const categoryLabel = getCategoryLabel(categoryValue);

  // Validate category exists
  const isValid = CATEGORIES.some((c) => c.value === categoryValue);
  if (!isValid) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <div className="text-center">
          <p className="text-lg font-semibold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Unknown category
          </p>
          <Link href="/explore" className="text-sm underline" style={{ color: "var(--accent)" }}>
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  let entries: JournalEntry[] = [];
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?category=${encodeURIComponent(categoryValue)}&page=${page}`,
      {},
      session?.token
    );
    entries = data.data ?? [];
  } catch {
    // show empty state
  }

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
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Public entries in {categoryLabel}
        </p>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath={`/category/${slug}`}
        loadMorePath={`/api/explore?category=${encodeURIComponent(categoryValue)}`}
        emptyState={emptyState}
        session={session ? {
          userId: session.user.id,
          isLoggedIn: true,
          isPlus: session.user.subscription_tier === "plus",
        } : null}
      />
    </div>
  );
}
