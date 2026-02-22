import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag } = await params;
  return { title: `#${tag} · Inkwell` };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const session = await getSession();
  const { tag } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: JournalEntry[] = [];
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?tag=${encodeURIComponent(tag)}&page=${page}`
    );
    entries = data.data ?? [];
  } catch {
    // show empty state
  }

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
        No entries yet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        No public entries have been tagged with #{tag} yet.
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
              #{tag}
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
          Public entries tagged #{tag}
        </p>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath={`/tag/${encodeURIComponent(tag)}`}
        emptyState={emptyState}
        session={session ? {
          userId: session.user.id,
          isLoggedIn: true,
          isPlus: session.user.subscription_tier === "plus",
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
            Subscribe to #{tag} entries via{" "}
            <a
              href={`${process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://inkwell-api.fly.dev"}/tags/${encodeURIComponent(tag)}/feed.xml`}
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
