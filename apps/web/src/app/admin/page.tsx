import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { AdminNav } from "./admin-nav";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Admin Dashboard · Inkwell" };

interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier: string;
  created_at: string;
}

interface StatsData {
  stats: {
    total_users: number;
    plus_subscribers: number;
    signups_this_week: number;
    total_entries: number;
    total_comments: number;
    blocked_users: number;
    pending_reports: number;
  };
  recent_plus: UserBrief[];
  recent_signups: UserBrief[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session || !session.user.is_admin) redirect("/feed");

  let data: StatsData | null = null;

  try {
    const token = await getToken();
    const res = await fetch(`${SERVER_API}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) data = await res.json();
  } catch {
    // show empty
  }

  const stats = data?.stats;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Admin Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Platform overview and management
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Back to feed
          </Link>
        </div>

        <div className="mb-8">
          <AdminNav pendingReports={stats?.pending_reports} />
        </div>

        {/* Stat Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-10">
            <StatCard label="Total Users" value={stats.total_users} />
            <StatCard label="Plus Subscribers" value={stats.plus_subscribers} accent />
            <StatCard label="New This Week" value={stats.signups_this_week} />
            <StatCard label="Total Entries" value={stats.total_entries} />
            <StatCard label="Total Comments" value={stats.total_comments} />
            <StatCard label="Blocked" value={stats.blocked_users} danger={stats.blocked_users > 0} />
            <StatCard label="Pending Reports" value={stats.pending_reports} danger={stats.pending_reports > 0} />
          </div>
        )}

        {/* Recent sections side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Plus Subscribers */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Recent Plus Subscribers
            </h2>
            {data?.recent_plus && data.recent_plus.length > 0 ? (
              <div className="space-y-3">
                {data.recent_plus.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No Plus subscribers yet.</p>
            )}
          </div>

          {/* Recent Signups */}
          <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Recent Signups
            </h2>
            {data?.recent_signups && data.recent_signups.length > 0 ? (
              <div className="space-y-3">
                {data.recent_signups.map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No users yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div
        className="text-2xl font-bold"
        style={{
          color: danger ? "var(--danger, #ef4444)" : accent ? "var(--accent)" : "var(--foreground)",
        }}
      >
        {value.toLocaleString()}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function UserRow({ user }: { user: UserBrief }) {
  return (
    <Link
      href={`/${user.username}`}
      className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:opacity-80"
    >
      <Avatar url={user.avatar_url} name={user.display_name || user.username} size={32} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{user.display_name || user.username}</div>
        <div className="text-xs truncate" style={{ color: "var(--muted)" }}>@{user.username}</div>
      </div>
      <div className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
        {timeAgo(user.created_at)}
      </div>
    </Link>
  );
}
