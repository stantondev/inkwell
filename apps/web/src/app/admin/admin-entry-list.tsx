"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminSkeletonTable, AdminSkeletonCards } from "./admin-skeleton";

interface AdminEntry {
  id: string;
  title: string | null;
  privacy: string;
  slug: string;
  category: string | null;
  published_at: string | null;
  created_at: string;
  tags: string[];
  sensitive?: boolean;
  admin_sensitive?: boolean;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "public", label: "Public" },
  { key: "private", label: "Private" },
  { key: "friends_only", label: "Friends only" },
  { key: "sensitive", label: "Sensitive" },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AdminEntryList() {
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchEntries = useCallback(async (page: number, searchTerm: string, filterKey: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "50" });
      if (searchTerm) params.set("search", searchTerm);
      if (filterKey) params.set("filter", filterKey);
      const res = await fetch(`/api/admin/entries?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.data ?? []);
        setPagination(data.pagination ?? { page, per_page: 50, total: 0 });
      } else {
        console.error("Admin entries fetch failed:", res.status, data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(1, search, filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchEntries(1, search, filter);
  }

  async function handleToggleSensitive(entry: AdminEntry) {
    const isSensitive = entry.sensitive || entry.admin_sensitive;
    const endpoint = isSensitive ? "unmark-sensitive" : "mark-sensitive";
    setToggling(entry.id);
    try {
      const res = await fetch(`/api/admin/entries/${entry.id}/${endpoint}`, { method: "POST" });
      if (res.ok) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, admin_sensitive: !isSensitive } : e
          )
        );
      }
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: string, title: string | null) {
    const label = title ?? "this entry";
    if (!confirm(`Permanently delete "${label}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      }
    } finally {
      setDeleting(null);
    }
  }

  function renderEntryActions(entry: AdminEntry) {
    return (
      <div className="admin-action-row">
        <button
          onClick={() => handleToggleSensitive(entry)}
          disabled={toggling === entry.id}
          className="admin-btn admin-btn--outline admin-btn--sm"
          title={(entry.sensitive || entry.admin_sensitive) ? "Unmark sensitive" : "Mark sensitive"}
        >
          {toggling === entry.id ? "…" : (entry.sensitive || entry.admin_sensitive) ? "Unmark" : "Sensitive"}
        </button>
        <button
          onClick={() => handleDelete(entry.id, entry.title)}
          disabled={deleting === entry.id}
          className="admin-btn admin-btn--danger admin-btn--sm"
        >
          {deleting === entry.id ? "…" : "Delete"}
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(pagination.total / pagination.per_page);

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            type="text"
            placeholder="Search by title or author..."
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
        {pagination.total} entr{pagination.total !== 1 ? "ies" : "y"} found
      </div>

      {/* Loading */}
      {loading ? (
        <>
          <div className="hidden sm:block"><AdminSkeletonTable rows={5} /></div>
          <div className="sm:hidden"><AdminSkeletonCards count={3} /></div>
        </>
      ) : entries.length === 0 ? (
        <div className="admin-empty"><p>No entries found.</p></div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th className="hidden md:table-cell">Author</th>
                    <th>Privacy</th>
                    <th className="hidden lg:table-cell">Date</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="max-w-xs">
                        <div className="flex items-center gap-1.5">
                          {(entry.sensitive || entry.admin_sensitive) && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                              <title>Sensitive content</title>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                          <Link href={`/${entry.author.username}/${entry.slug}`}
                            className="font-medium hover:underline truncate block">
                            {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                          </Link>
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        <Link href={`/${entry.author.username}`} className="text-xs hover:underline" style={{ color: "var(--muted)" }}>
                          @{entry.author.username}
                        </Link>
                      </td>
                      <td>
                        {entry.privacy === "public" ? (
                          <span className="admin-badge admin-badge--success">public</span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>{entry.privacy}</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell">
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {timeAgo(entry.published_at ?? entry.created_at)}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {renderEntryActions(entry)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="admin-mobile-card">
                <div className="admin-mobile-card-header">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {(entry.sensitive || entry.admin_sensitive) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    )}
                    <Link href={`/${entry.author.username}/${entry.slug}`}
                      className="font-medium hover:underline truncate text-sm">
                      {entry.title ?? <em style={{ color: "var(--muted)" }}>Untitled</em>}
                    </Link>
                  </div>
                </div>
                <div className="admin-mobile-card-field">
                  by <Link href={`/${entry.author.username}`} className="hover:underline">@{entry.author.username}</Link>
                </div>
                <div className="admin-mobile-card-meta">
                  {entry.privacy === "public" ? (
                    <span className="admin-badge admin-badge--success">public</span>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{entry.privacy}</span>
                  )}
                  {(entry.sensitive || entry.admin_sensitive) && (
                    <span className="admin-badge admin-badge--accent-light">Sensitive</span>
                  )}
                  <span>{timeAgo(entry.published_at ?? entry.created_at)}</span>
                </div>
                <div className="admin-mobile-card-actions">
                  {renderEntryActions(entry)}
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
            <button className="admin-btn admin-btn--outline" onClick={() => fetchEntries(pagination.page - 1, search, filter)}>
              ← Newer
            </button>
          ) : <div />}
          <span className="admin-pagination-info">
            Page {pagination.page} of {totalPages}
          </span>
          {pagination.page < totalPages ? (
            <button className="admin-btn admin-btn--outline" onClick={() => fetchEntries(pagination.page + 1, search, filter)}>
              Older →
            </button>
          ) : <div />}
        </div>
      )}
    </div>
  );
}
