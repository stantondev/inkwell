import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { notFound } from "next/navigation";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";

export const metadata: Metadata = { title: "Feed" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyFeed({ username }: { username: string }) {
  return (
    <div
      className="rounded-2xl border p-12 text-center"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <p
        className="text-lg font-semibold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Your feed is quiet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Follow some pen pals to see their journal entries here, or write your
        first entry.
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        <Link
          href="/editor"
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Write your first entry
        </Link>
        <Link
          href={`/${username}`}
          className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          View your profile
        </Link>
      </div>
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
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/feed?page=${page}`,
      {},
      session.token
    );
    entries = data.data ?? [];
  } catch {
    // If the feed fails (e.g. no friends yet), show empty state
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Header bar */}
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Profile quick-link */}
            <Link
              href={`/${session.user.username}`}
              className="flex items-center gap-2 text-sm hover:underline"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{
                  background: "var(--accent-light)",
                  color: "var(--accent)",
                }}
              >
                {session.user.display_name[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:inline font-medium">
                {session.user.display_name}
              </span>
            </Link>
            <span
              className="text-xs hidden sm:inline"
              style={{ color: "var(--muted)" }}
            >
              &middot;
            </span>
            <h1
              className="text-lg font-semibold"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
            >
              Journal
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="text-xs px-3 py-1 rounded-full border font-medium"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
              }}
            >
              Pen Pals
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
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath="/feed"
        emptyState={<EmptyFeed username={session.user.username} />}
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
