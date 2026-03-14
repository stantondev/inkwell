import type { Metadata } from "next";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { AdminEntryList } from "../admin-entry-list";
import Link from "next/link";

export const metadata: Metadata = { title: "Entries · Admin · Inkwell" };

interface AdminEntry {
  id: string;
  title: string | null;
  body_html: string;
  privacy: string;
  slug: string;
  published_at: string | null;
  created_at: string;
  tags: string[];
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export default async function AdminEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = parseInt(pageParam ?? "1", 10);

  let entries: AdminEntry[] = [];
  let pagination = { page, per_page: 50 };

  try {
    const token = await getToken();
    const res = await fetch(
      `${SERVER_API}/api/admin/entries?page=${page}&per_page=50`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );
    if (res.ok) {
      const data = await res.json();
      entries = data.data ?? [];
      pagination = data.pagination ?? pagination;
    }
  } catch {
    // show empty
  }

  return (
    <div>
      <AdminEntryList entries={entries} />

      {/* Pagination */}
      {(page > 1 || entries.length >= pagination.per_page) && (
        <div className="admin-pagination">
          {page > 1 ? (
            <Link href={`/admin/entries?page=${page - 1}`} className="admin-btn admin-btn--outline">
              ← Newer
            </Link>
          ) : <div />}
          <span className="admin-pagination-info">Page {page}</span>
          {entries.length >= pagination.per_page ? (
            <Link href={`/admin/entries?page=${page + 1}`} className="admin-btn admin-btn--outline">
              Older →
            </Link>
          ) : <div />}
        </div>
      )}
    </div>
  );
}
