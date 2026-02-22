import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { AdminEntryList } from "./admin-entry-list";

export const metadata: Metadata = { title: "Admin · Inkwell" };

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();

  if (!session || !session.user.is_admin) {
    redirect("/feed");
  }

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
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              All entries across Inkwell
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Back to feed
          </Link>
        </div>

        <AdminEntryList entries={entries} />

        {/* Pagination */}
        <div className="flex items-center justify-between mt-8">
          {page > 1 ? (
            <Link href={`/admin?page=${page - 1}`}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              ← Newer
            </Link>
          ) : <div />}
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Page {page}
          </span>
          {entries.length >= pagination.per_page ? (
            <Link href={`/admin?page=${page + 1}`}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              Older →
            </Link>
          ) : <div />}
        </div>
      </div>
    </div>
  );
}
