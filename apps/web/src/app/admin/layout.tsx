import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !session.user.is_admin) redirect("/feed");

  let pendingReports = 0;
  try {
    const token = await getToken();
    const res = await fetch(`${SERVER_API}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      pendingReports = data.stats?.pending_reports ?? 0;
    }
  } catch {
    // continue with 0
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="admin-page-title">Admin</h1>
            <p className="admin-page-subtitle">Platform management</p>
          </div>
          <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Back to feed
          </Link>
        </div>

        <div className="mb-6">
          <AdminNav pendingReports={pendingReports} />
        </div>

        {children}
      </div>
    </div>
  );
}
