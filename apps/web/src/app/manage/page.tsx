import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { PostManager } from "./post-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Posts — Inkwell" };

interface ManageEntry {
  id: string;
  title: string | null;
  slug: string | null;
  status: "draft" | "published";
  privacy: string;
  category: string | null;
  series_id: string | null;
  series_name: string | null;
  tags: string[];
  word_count: number;
  ink_count: number;
  comment_count: number;
  sensitive: boolean;
  cover_image_id: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

interface SeriesItem {
  id: string;
  name: string;
}

export default async function ManagePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let entries: ManageEntry[] = [];
  let total = 0;
  let series: SeriesItem[] = [];

  try {
    const [entriesData, seriesData] = await Promise.all([
      apiFetch<{ data: ManageEntry[]; pagination: { total: number } }>(
        "/api/me/entries?per_page=20",
        {},
        session.token
      ),
      apiFetch<{ data: SeriesItem[] }>("/api/series", {}, session.token),
    ]);
    entries = entriesData.data ?? [];
    total = entriesData.pagination?.total ?? 0;
    series = seriesData.data ?? [];
  } catch {
    // show empty state
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <PostManager
          initialEntries={entries}
          initialTotal={total}
          series={series}
          username={session.user.username}
        />
      </div>
    </div>
  );
}
