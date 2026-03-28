import type { Metadata } from "next";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { Avatar } from "@/components/avatar";
import { ReindexButton } from "./reindex-button";

export const metadata: Metadata = { title: "Admin Dashboard · Inkwell" };

interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier: string;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
  created_at: string;
}

interface StatsData {
  stats: {
    total_users: number;
    plus_subscribers: number;
    ink_donors: number;
    signups_this_week: number;
    total_entries: number;
    total_comments: number;
    blocked_users: number;
    inactive_users: number;
    pending_reports: number;
  };
  recent_plus: UserBrief[];
  recent_donors: UserBrief[];
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
    <div>
      {/* Stat Cards */}
      {stats && (
        <div className="admin-stat-grid admin-section">
          <StatCard label="Total Users" value={stats.total_users} />
          <StatCard label="Plus Subscribers" value={stats.plus_subscribers} accent />
          <StatCard label="Ink Donors" value={stats.ink_donors} accent />
          <StatCard label="New This Week" value={stats.signups_this_week} />
          <StatCard label="Total Entries" value={stats.total_entries} />
          <StatCard label="Total Comments" value={stats.total_comments} />
          <StatCard label="Inactive" value={stats.inactive_users} />
          <StatCard label="Blocked" value={stats.blocked_users} danger={stats.blocked_users > 0} />
          <StatCard label="Pending Reports" value={stats.pending_reports} danger={stats.pending_reports > 0} />
        </div>
      )}

      {/* Admin Actions */}
      <div className="admin-section" style={{ marginBottom: "1rem" }}>
        <ReindexButton />
      </div>

      {/* Recent sections */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        <div className="admin-card">
          <h2 className="admin-card-header">Recent Plus Subscribers</h2>
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

        <div className="admin-card">
          <h2 className="admin-card-header">Recent Ink Donors</h2>
          {data?.recent_donors && data.recent_donors.length > 0 ? (
            <div className="space-y-3">
              {data.recent_donors.map((user) => (
                <UserRow key={user.id} user={user} showDonorAmount />
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>No Ink Donors yet.</p>
          )}
        </div>

        <div className="admin-card">
          <h2 className="admin-card-header">Recent Signups</h2>
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
  );
}

function StatCard({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  const cls = danger ? "admin-stat-value admin-stat-value--danger" : accent ? "admin-stat-value admin-stat-value--accent" : "admin-stat-value";
  return (
    <div className="admin-stat-card">
      <div className={cls}>{value.toLocaleString()}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

function UserRow({ user, showDonorAmount }: { user: UserBrief; showDonorAmount?: boolean }) {
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
      {showDonorAmount && user.ink_donor_amount_cents ? (
        <span className="text-xs font-medium shrink-0" style={{ color: "var(--accent)" }}>
          ${user.ink_donor_amount_cents / 100}/mo
        </span>
      ) : (
        <div className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
          {timeAgo(user.created_at)}
        </div>
      )}
    </Link>
  );
}
