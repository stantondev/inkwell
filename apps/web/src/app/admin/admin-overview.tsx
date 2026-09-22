"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ADMIN_SECTIONS } from "./admin-sections";
import { ReindexButton } from "./reindex-button";

export interface UserBrief {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier: string;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
  created_at: string;
}

export interface BillingSummary {
  status: "ok" | "attention";
  problems: { kind: string; message: string }[];
  counts: { plus: number; paying: number; founding: number; trial: number };
}

export interface AdminStats {
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
  } | null;
  recent_plus: UserBrief[];
  recent_donors: UserBrief[];
  recent_signups: UserBrief[];
  billing: BillingSummary | null;
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

export function AdminOverview({
  stats,
  pendingReports,
  onGo,
}: {
  stats: AdminStats | null;
  pendingReports: number;
  onGo: (id: string) => void;
}) {
  const s = stats?.stats;
  const billing = stats?.billing ?? null;

  // Only the things that actually want a decision today.
  const attention: { text: string; go: string }[] = [];
  if (pendingReports > 0) {
    attention.push({
      text: `${pendingReports} report${pendingReports === 1 ? "" : "s"} waiting`,
      go: "reports",
    });
  }
  if (billing && billing.status !== "ok" && billing.problems[0]) {
    attention.push({ text: billing.problems[0].message, go: "billing" });
  }

  // Live numbers for the section cards, where one exists.
  const counts: Record<string, string | null> = {
    users: s ? `${s.total_users.toLocaleString()} accounts${s.blocked_users ? ` · ${s.blocked_users} blocked` : ""}` : null,
    reports: pendingReports > 0 ? `${pendingReports} pending` : "Nothing waiting",
    moderation: null,
    warnings: null,
    entries: s ? `${s.total_entries.toLocaleString()} published` : null,
    polls: null,
    billing: billing
      ? billing.status === "ok"
        ? `${billing.counts.plus} with Plus · ${billing.counts.paying} paying`
        : "Needs a look"
      : null,
    growth: s ? `${s.signups_this_week} new this week` : null,
    email: null,
    federation: null,
    relays: null,
    domains: null,
  };

  return (
    <div className="adm-overview">
      {attention.length > 0 && (
        <div className="adm-attention">
          {attention.map((a) => (
            <button key={a.go} type="button" className="adm-attention-row" onClick={() => onGo(a.go)}>
              <span className="adm-attention-dot" aria-hidden="true" />
              <span className="adm-attention-text">{a.text}</span>
              <span className="adm-attention-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}

      {s ? (
        <div className="adm-stats">
          <Stat label="Users" value={s.total_users} />
          <Stat label="Plus" value={s.plus_subscribers} accent />
          <Stat label="Ink Donors" value={s.ink_donors} accent />
          <Stat label="New this week" value={s.signups_this_week} />
          <Stat label="Entries" value={s.total_entries} />
          <Stat label="Comments" value={s.total_comments} />
          <Stat label="Inactive" value={s.inactive_users} />
          <Stat label="Blocked" value={s.blocked_users} danger={s.blocked_users > 0} />
        </div>
      ) : (
        <p className="adm-notice">
          Couldn&apos;t load the platform numbers just now. Every section below still works.
        </p>
      )}

      {/* ── Section cards ───────────────────────────────────────── */}
      <h3 className="adm-overview-heading">Everything you can do here</h3>
      <div className="adm-section-grid">
        {ADMIN_SECTIONS.filter((x) => x.id !== "overview").map((item) => (
          <button
            key={item.id}
            type="button"
            className="adm-section-card"
            onClick={() => onGo(item.id)}
          >
            <span className="adm-section-top">
              <span className="adm-section-icon">{item.icon}</span>
              <span className="adm-section-title">{item.label}</span>
              {item.id === "reports" && pendingReports > 0 && (
                <span className="adm-rail-badge">{pendingReports > 9 ? "9+" : pendingReports}</span>
              )}
            </span>
            <span className="adm-section-blurb">{item.blurb}</span>
            {counts[item.id] && <span className="adm-section-count">{counts[item.id]}</span>}
          </button>
        ))}
      </div>

      {/* ── Recent people ───────────────────────────────────────── */}
      <div className="adm-recent-grid">
        <RecentCard title="Recent signups" users={stats?.recent_signups} />
        <RecentCard title="Recent Plus" users={stats?.recent_plus} />
        <RecentCard title="Recent Ink Donors" users={stats?.recent_donors} showDonorAmount />
      </div>

      <div className="adm-overview-actions">
        <ReindexButton />
      </div>
    </div>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="adm-stat">
      <div
        className={`adm-stat-value${danger ? " adm-stat-value--danger" : accent ? " adm-stat-value--accent" : ""}`}
      >
        {value.toLocaleString()}
      </div>
      <div className="adm-stat-label">{label}</div>
    </div>
  );
}

function RecentCard({
  title,
  users,
  showDonorAmount,
}: {
  title: string;
  users?: UserBrief[];
  showDonorAmount?: boolean;
}) {
  return (
    <div className="adm-card">
      <h3 className="adm-card-title">{title}</h3>
      {users && users.length > 0 ? (
        <div className="adm-user-list">
          {users.map((u) => (
            <UserRow key={u.id} user={u} showDonorAmount={showDonorAmount} />
          ))}
        </div>
      ) : (
        <p className="adm-card-empty">Nobody yet.</p>
      )}
    </div>
  );
}

function StatusBadge({ status, expiresAt }: { status: string | null; expiresAt: string | null }) {
  if (!status || status === "none") return null;

  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: "var(--success, #16a34a)", fg: "white" },
    canceled: { bg: "var(--danger, #dc2626)", fg: "white" },
    past_due: { bg: "#f59e0b", fg: "white" },
  };
  const style = colors[status] || { bg: "var(--muted)", fg: "white" };
  const label =
    status === "active" ? "Active" : status === "canceled" ? "Canceled" : status === "past_due" ? "Past due" : status;

  return (
    <span
      className="adm-status-badge"
      style={{ background: style.bg, color: style.fg }}
      title={expiresAt && status === "canceled" ? `Expires ${new Date(expiresAt).toLocaleDateString()}` : undefined}
    >
      {label}
    </span>
  );
}

function UserRow({ user, showDonorAmount }: { user: UserBrief; showDonorAmount?: boolean }) {
  const statusToShow = showDonorAmount ? user.ink_donor_status : user.subscription_status;

  return (
    <Link href={`/${user.username}`} className="adm-user-row">
      <Avatar url={user.avatar_url} name={user.display_name || user.username} size={32} />
      <div className="adm-user-id">
        <div className="adm-user-name">{user.display_name || user.username}</div>
        <div className="adm-user-handle">@{user.username}</div>
      </div>
      <div className="adm-user-meta">
        {showDonorAmount && user.ink_donor_amount_cents ? (
          <span className="adm-user-amount">${user.ink_donor_amount_cents / 100}/mo</span>
        ) : (
          <span className="adm-user-time">{timeAgo(user.created_at)}</span>
        )}
        <StatusBadge status={statusToShow} expiresAt={user.subscription_expires_at} />
      </div>
    </Link>
  );
}
