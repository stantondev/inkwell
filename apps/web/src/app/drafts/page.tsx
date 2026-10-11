import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { apiFetch } from "@/lib/api";
import { DraftsList } from "./drafts-list";
import { DRAFTS_PER_PAGE, type DraftsResponse } from "./draft-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drafts" };

export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ scheduled?: string }> }) {
  const { scheduled } = await searchParams;
  const session = await requireSession("/drafts");

  // No catch on purpose: a failed load used to render "No drafts yet", which
  // told a writer with 200 drafts they had none. An outage now throws and
  // shows the self-recovering "Reconnecting" screen instead.
  const res = await apiFetch<Partial<DraftsResponse>>(
    `/api/drafts?page=1&per_page=${DRAFTS_PER_PAGE}&sort=updated`,
    {},
    session.token
  );
  const drafts = res.data ?? [];
  const pagination = res.pagination ?? {
    page: 1,
    per_page: DRAFTS_PER_PAGE,
    total: drafts.length,
    total_pages: 1,
  };
  const meta = res.meta ?? { draft_limit: null, counted: drafts.length, scheduled: 0 };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Drafts
          </h1>
          <Link
            href="/editor"
            className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 flex-shrink-0"
            style={{ background: "var(--accent)", color: "var(--background)" }}
          >
            + New entry
          </Link>
        </div>

        <DraftsList
          initialDrafts={drafts}
          initialPagination={pagination}
          initialMeta={meta}
          showScheduledNotice={!!scheduled}
        />
      </div>
    </div>
  );
}
