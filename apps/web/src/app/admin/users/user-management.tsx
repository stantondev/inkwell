"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AdminSkeletonTable, AdminSkeletonCards } from "../admin-skeleton";

interface AdminUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  is_env_admin: boolean;
  is_admin: boolean;
  subscription_tier: string;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
  blocked_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "admin", label: "Admins" },
  { key: "plus", label: "Plus" },
  { key: "donor", label: "Donors" },
  { key: "blocked", label: "Blocked" },
] as const;

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

export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async (page: number, searchTerm: string, filterKey: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "50" });
      if (searchTerm) params.set("search", searchTerm);
      if (filterKey) params.set("filter", filterKey);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data ?? []);
        setPagination(data.pagination ?? { page, per_page: 50, total: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers(1, search, filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchUsers(1, search, filter);
  }

  async function handleSetRole(userId: string, role: string) {
    const action = role === "admin" ? "promote to admin" : "remove admin role from";
    const target = users.find((u) => u.id === userId);
    if (!target || !confirm(`Are you sure you want to ${action} @${target.username}?`)) return;
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.data : u)));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update role");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBlock(userId: string) {
    const target = users.find((u) => u.id === userId);
    if (!target || !confirm(`Block @${target.username}? They will be signed out and unable to access Inkwell.`)) return;
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/block`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.data : u)));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to block user");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnblock(userId: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/unblock`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.data : u)));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to unblock user");
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(userId: string) {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const username = prompt(`Type "${target.username}" to permanently delete this account:`);
    if (username !== target.username) {
      if (username !== null) alert("Username did not match. Account was not deleted.");
      return;
    }
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete user");
      }
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.ceil(pagination.total / pagination.per_page);

  function renderUserActions(user: AdminUser) {
    if (user.id === currentUserId) {
      return <span className="text-xs" style={{ color: "var(--muted)" }}>You</span>;
    }
    return (
      <div className="admin-action-row">
        {user.is_admin && !user.is_env_admin ? (
          <button className="admin-btn admin-btn--outline admin-btn--sm" disabled={actionLoading === user.id} onClick={() => handleSetRole(user.id, "user")}>
            {actionLoading === user.id ? "..." : "Demote"}
          </button>
        ) : !user.is_admin ? (
          <button className="admin-btn admin-btn--outline admin-btn--sm" disabled={actionLoading === user.id} onClick={() => handleSetRole(user.id, "admin")}>
            {actionLoading === user.id ? "..." : "Promote"}
          </button>
        ) : null}
        {user.blocked_at ? (
          <button className="admin-btn admin-btn--outline admin-btn--sm" disabled={actionLoading === user.id} onClick={() => handleUnblock(user.id)}>
            {actionLoading === user.id ? "..." : "Unblock"}
          </button>
        ) : (
          <button className="admin-btn admin-btn--danger admin-btn--sm" disabled={actionLoading === user.id} onClick={() => handleBlock(user.id)}>
            {actionLoading === user.id ? "..." : "Block"}
          </button>
        )}
        <button className="admin-btn admin-btn--danger admin-btn--sm" disabled={actionLoading === user.id} onClick={() => handleDelete(user.id)}>
          {actionLoading === user.id ? "..." : "Delete"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search by username, email, or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="admin-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="admin-btn admin-btn--primary" style={{ padding: "10px 20px" }}>
            Search
          </button>
        </form>
        <div className="admin-filter-bar" style={{ marginBottom: 0 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`admin-filter-pill ${filter === f.key ? "admin-filter-pill--active" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-results-count">
        {pagination.total} user{pagination.total !== 1 ? "s" : ""} found
      </div>

      {/* Loading */}
      {loading ? (
        <>
          <div className="hidden sm:block"><AdminSkeletonTable rows={5} /></div>
          <div className="sm:hidden"><AdminSkeletonCards count={3} /></div>
        </>
      ) : users.length === 0 ? (
        <div className="admin-empty"><p>No users found.</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th className="hidden md:table-cell">Email</th>
                    <th>Role</th>
                    <th>Tier</th>
                    <th className="hidden lg:table-cell">Joined</th>
                    <th className="hidden lg:table-cell">Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link href={`/${user.username}`} className="flex items-center gap-2 hover:opacity-80">
                          <Avatar url={user.avatar_url} name={user.display_name || user.username} size={28} />
                          <div className="min-w-0">
                            <div className="font-medium truncate text-sm">{user.display_name || user.username}</div>
                            <div className="text-xs truncate" style={{ color: "var(--muted)" }}>@{user.username}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="hidden md:table-cell">
                        <span className="text-xs truncate block max-w-[200px]" style={{ color: "var(--muted)" }}>{user.email}</span>
                      </td>
                      <td>
                        {user.is_admin ? (
                          <span className="admin-badge admin-badge--accent">Admin{user.is_env_admin ? " *" : ""}</span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>User</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {user.subscription_tier === "plus" ? (
                            <span className="admin-badge admin-badge--accent-light">Plus</span>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--muted)" }}>Free</span>
                          )}
                          {user.ink_donor_status === "active" && (
                            <span className="admin-badge admin-badge--accent" title={user.ink_donor_amount_cents ? `$${user.ink_donor_amount_cents / 100}/mo` : undefined}>
                              Donor{user.ink_donor_amount_cents ? ` $${user.ink_donor_amount_cents / 100}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{timeAgo(user.created_at)}</span>
                      </td>
                      <td className="hidden lg:table-cell">
                        {user.blocked_at ? (
                          <span className="admin-badge admin-badge--danger">Blocked</span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--success, #16a34a)" }}>Active</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {renderUserActions(user)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden">
            {users.map((user) => (
              <div key={user.id} className="admin-mobile-card">
                <div className="admin-mobile-card-header">
                  <Link href={`/${user.username}`} className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80">
                    <Avatar url={user.avatar_url} name={user.display_name || user.username} size={36} />
                    <div className="min-w-0">
                      <div className="font-medium truncate text-sm">{user.display_name || user.username}</div>
                      <div className="text-xs truncate" style={{ color: "var(--muted)" }}>@{user.username}</div>
                    </div>
                  </Link>
                </div>
                <div className="admin-mobile-card-field" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </div>
                <div className="admin-mobile-card-meta">
                  {user.is_admin && <span className="admin-badge admin-badge--accent">Admin{user.is_env_admin ? " *" : ""}</span>}
                  {user.subscription_tier === "plus" && <span className="admin-badge admin-badge--accent-light">Plus</span>}
                  {user.ink_donor_status === "active" && (
                    <span className="admin-badge admin-badge--accent">
                      Donor{user.ink_donor_amount_cents ? ` $${user.ink_donor_amount_cents / 100}` : ""}
                    </span>
                  )}
                  {user.blocked_at ? (
                    <span className="admin-badge admin-badge--danger">Blocked</span>
                  ) : (
                    <span style={{ color: "var(--success, #16a34a)", fontSize: "12px" }}>Active</span>
                  )}
                  <span>Joined {timeAgo(user.created_at)}</span>
                </div>
                <div className="admin-mobile-card-actions">
                  {renderUserActions(user)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="admin-pagination">
          {pagination.page > 1 ? (
            <button className="admin-btn admin-btn--outline" onClick={() => fetchUsers(pagination.page - 1, search, filter)}>
              ← Previous
            </button>
          ) : <div />}
          <span className="admin-pagination-info">
            Page {pagination.page} of {totalPages}
          </span>
          {pagination.page < totalPages ? (
            <button className="admin-btn admin-btn--outline" onClick={() => fetchUsers(pagination.page + 1, search, filter)}>
              Next →
            </button>
          ) : <div />}
        </div>
      )}
    </div>
  );
}
