"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search by username, email, or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-2 sm:px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: filter === f.key ? "var(--accent)" : "transparent",
                color: filter === f.key ? "white" : "var(--muted)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {pagination.total} user{pagination.total !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>No users found.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>User</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>Email</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>Role</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>Tier</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>Joined</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>Status</th>
                  <th className="px-4 py-3 font-medium text-right" style={{ color: "var(--muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    {/* User */}
                    <td className="px-4 py-3">
                      <Link href={`/${user.username}`} className="flex items-center gap-2 hover:opacity-80">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0" style={{ background: "var(--accent-light, var(--border))", color: "var(--accent)" }}>
                            {(user.display_name || user.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate text-sm">{user.display_name || user.username}</div>
                          <div className="text-xs truncate" style={{ color: "var(--muted)" }}>@{user.username}</div>
                        </div>
                      </Link>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs truncate block max-w-[200px]" style={{ color: "var(--muted)" }}>{user.email}</span>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {user.is_admin ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--accent)", color: "white" }}>
                          Admin{user.is_env_admin ? " *" : ""}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>User</span>
                      )}
                    </td>

                    {/* Tier */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {user.subscription_tier === "plus" ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#f0e6ff", color: "#7c3aed" }}>
                          Plus
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>Free</span>
                      )}
                    </td>

                    {/* Joined */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{timeAgo(user.created_at)}</span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {user.blocked_at ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fef2f2", color: "#dc2626" }}>
                          Blocked
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--success, #16a34a)" }}>Active</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {user.id !== currentUserId && (
                        <div className="flex flex-wrap items-center gap-1 justify-end">
                          {/* Admin toggle */}
                          {user.is_admin && !user.is_env_admin ? (
                            <ActionButton
                              label="Demote"
                              loading={actionLoading === user.id}
                              onClick={() => handleSetRole(user.id, "user")}
                            />
                          ) : !user.is_admin ? (
                            <ActionButton
                              label="Promote"
                              loading={actionLoading === user.id}
                              onClick={() => handleSetRole(user.id, "admin")}
                            />
                          ) : null}

                          {/* Block/Unblock */}
                          {user.blocked_at ? (
                            <ActionButton
                              label="Unblock"
                              loading={actionLoading === user.id}
                              onClick={() => handleUnblock(user.id)}
                            />
                          ) : (
                            <ActionButton
                              label="Block"
                              loading={actionLoading === user.id}
                              onClick={() => handleBlock(user.id)}
                              danger
                            />
                          )}

                          {/* Delete */}
                          <ActionButton
                            label="Delete"
                            loading={actionLoading === user.id}
                            onClick={() => handleDelete(user.id)}
                            danger
                          />
                        </div>
                      )}
                      {user.id === currentUserId && (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>You</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          {pagination.page > 1 ? (
            <button
              onClick={() => fetchUsers(pagination.page - 1, search, filter)}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              ← Previous
            </button>
          ) : <div />}
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Page {pagination.page} of {totalPages}
          </span>
          {pagination.page < totalPages ? (
            <button
              onClick={() => fetchUsers(pagination.page + 1, search, filter)}
              className="text-sm px-4 py-2 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Next →
            </button>
          ) : <div />}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  loading,
  onClick,
  danger,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="text-xs px-2.5 py-1 rounded-md border font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
      style={{
        borderColor: danger ? "var(--danger, #ef4444)" : "var(--border)",
        color: danger ? "var(--danger, #ef4444)" : "var(--muted)",
      }}
    >
      {loading ? "..." : label}
    </button>
  );
}
