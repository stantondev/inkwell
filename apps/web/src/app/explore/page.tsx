import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { JournalFeed } from "@/components/journal-feed";
import type { JournalEntry } from "@/components/journal-entry-card";

export const metadata: Metadata = { title: "Explore · Inkwell" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const session = await getSession();
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: JournalEntry[] = [];
  try {
    const data = await apiFetch<{ data: JournalEntry[] }>(
      `/api/explore?page=${page}`
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
        Nothing here yet
      </p>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Be the first to write a public journal entry.
      </p>
      <Link
        href="/editor"
        className="rounded-full px-4 py-2 text-sm font-medium"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Start writing
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
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Explore
          </h1>

          <div className="flex items-center gap-2">
            <Link
              href="/feed"
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Pen Pals
            </Link>
            <span
              className="text-xs px-3 py-1 rounded-full border font-medium"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent-light)",
                color: "var(--accent)",
              }}
            >
              Explore
            </span>
          </div>
        </div>
      </div>

      {/* Journal area */}
      <JournalFeed
        entries={entries}
        page={page}
        basePath="/explore"
        emptyState={emptyState}
        session={session ? {
          userId: session.user.id,
          isLoggedIn: true,
          isPlus: session.user.subscription_tier === "plus",
        } : null}
      />

      {/* About Inkwell footer */}
      <div className="mx-auto max-w-md px-4 pb-8">
        <div
          className="rounded-xl border p-4 text-center"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            A federated journaling platform. No algorithms, no ads — just
            writing and pen pals.
          </p>
        </div>
      </div>
    </div>
  );
}
