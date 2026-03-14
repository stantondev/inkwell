import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { SavedList } from "./saved-list";
import type { SavedEntry } from "./saved-list";
import { FetchError } from "@/components/fetch-error";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reading List" };

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function SavedPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));

  let entries: SavedEntry[] = [];
  let pagination = { page, per_page: 20 };
  let fetchFailed = false;

  try {
    const data = await apiFetch<{ data: SavedEntry[]; pagination: typeof pagination }>(
      `/api/bookmarks?page=${page}`,
      {},
      session.token
    );
    entries = data.data ?? [];
    pagination = data.pagination ?? pagination;
  } catch {
    fetchFailed = true;
  }

  const hasMore = !fetchFailed && entries.length === pagination.per_page;

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="var(--accent)"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <h1
            className="text-xl font-bold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Reading List
          </h1>
        </div>

        {fetchFailed ? (
          <FetchError message="We couldn't load your reading list." />
        ) : (
          <SavedList initialEntries={entries} />
        )}

        {/* Pagination */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-between mt-8 pt-6 border-t" style={{ borderColor: "var(--border)" }}>
            {page > 1 ? (
              <Link
                href={`/saved?page=${page - 1}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                &larr; Newer saves
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link
                href={`/saved?page=${page + 1}`}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Older saves &rarr;
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
