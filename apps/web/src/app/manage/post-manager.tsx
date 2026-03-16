"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Filters {
  status: string;
  privacy: string;
  category: string;
  series_id: string;
  search: string;
  sort: string;
}

interface Props {
  initialEntries: ManageEntry[];
  initialTotal: number;
  series: SeriesItem[];
  username: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PRIVACY_LABELS: Record<string, string> = {
  public: "Public",
  friends_only: "Friends",
  private: "Private",
  custom: "Custom",
  paid: "Paid",
};

const PRIVACY_COLORS: Record<string, string> = {
  public: "var(--accent)",
  friends_only: "#6366f1",
  private: "var(--muted)",
  custom: "#8b5cf6",
  paid: "#d97706",
};

// ── Component ────────────────────────────────────────────────────────────────

export function PostManager({ initialEntries, initialTotal, series, username }: Props) {
  const [entries, setEntries] = useState<ManageEntry[]>(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({
    status: "",
    privacy: "",
    category: "",
    series_id: "",
    search: "",
    sort: "newest",
  });
  const [confirmAction, setConfirmAction] = useState<{
    action: string;
    label: string;
    description: string;
    params?: Record<string, unknown>;
  } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkPrivacy, setShowBulkPrivacy] = useState(false);
  const [showBulkSeries, setShowBulkSeries] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTags, setShowBulkTags] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const perPage = 20;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchEntries = useCallback(
    async (p: number, f: Filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("per_page", String(perPage));
        if (f.status) params.set("status", f.status);
        if (f.privacy) params.set("privacy", f.privacy);
        if (f.category) params.set("category", f.category);
        if (f.series_id) params.set("series_id", f.series_id);
        if (f.search) params.set("q", f.search);
        if (f.sort) params.set("sort", f.sort);

        const res = await fetch(`/api/me/entries?${params}`);
        const json = await res.json();
        if (json.data) {
          setEntries(json.data);
          setTotal(json.pagination?.total ?? 0);
        }
      } catch {
        // keep current
      } finally {
        setLoading(false);
      }
    },
    [perPage]
  );

  const updateFilter = useCallback(
    (key: keyof Filters, value: string) => {
      const next = { ...filters, [key]: value };
      setFilters(next);
      setPage(1);
      setSelectedIds(new Set());

      if (key === "search") {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchEntries(1, next), 350);
      } else {
        fetchEntries(1, next);
      }
    },
    [filters, fetchEntries]
  );

  const goToPage = useCallback(
    (p: number) => {
      setPage(p);
      setSelectedIds(new Set());
      fetchEntries(p, filters);
    },
    [filters, fetchEntries]
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────

  const executeBulk = async (action: string, params?: Record<string, unknown>) => {
    setBulkLoading(true);
    try {
      const res = await fetch("/api/me/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entry_ids: Array.from(selectedIds), ...params }),
      });
      const json = await res.json();
      if (json.ok) {
        setSelectedIds(new Set());
        setConfirmAction(null);
        fetchEntries(page, filters);
      }
    } catch {
      // stay
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = () => {
    setConfirmAction({
      action: "delete",
      label: "Delete entries",
      description: `This will permanently delete ${selectedIds.size} ${selectedIds.size === 1 ? "entry" : "entries"}. This cannot be undone.`,
    });
  };

  const handleBulkPrivacy = (privacy: string) => {
    setShowBulkPrivacy(false);
    setConfirmAction({
      action: "update_privacy",
      label: `Change privacy to ${PRIVACY_LABELS[privacy] || privacy}`,
      description: `${selectedIds.size} ${selectedIds.size === 1 ? "entry" : "entries"} will be set to ${PRIVACY_LABELS[privacy] || privacy}.`,
      params: { privacy },
    });
  };

  const handleBulkSeries = (seriesId: string | null) => {
    setShowBulkSeries(false);
    if (seriesId) {
      const s = series.find((s) => s.id === seriesId);
      executeBulk("set_series", { series_id: seriesId });
      void s;
    } else {
      executeBulk("remove_series");
    }
  };

  const handleBulkAddTags = () => {
    const tags = bulkTagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length) {
      executeBulk("add_tags", { tags });
      setBulkTagInput("");
      setShowBulkTags(false);
    }
  };

  const handleBulkPublish = () => {
    const draftIds = entries.filter((e) => selectedIds.has(e.id) && e.status === "draft").map((e) => e.id);
    if (draftIds.length === 0) return;
    setConfirmAction({
      action: "publish",
      label: "Publish drafts",
      description: `${draftIds.length} ${draftIds.length === 1 ? "draft" : "drafts"} will be published.`,
      params: { entry_ids: draftIds },
    });
  };

  const confirmExec = () => {
    if (!confirmAction) return;
    const ids = confirmAction.params?.entry_ids;
    if (ids) {
      // Use overridden entry_ids (for publish)
      setBulkLoading(true);
      fetch("/api/me/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: confirmAction.action, entry_ids: ids }),
      })
        .then((r) => r.json())
        .then((json) => {
          if (json.ok) {
            setSelectedIds(new Set());
            setConfirmAction(null);
            fetchEntries(page, filters);
          }
        })
        .finally(() => setBulkLoading(false));
    } else {
      executeBulk(confirmAction.action, confirmAction.params);
    }
  };

  // Single delete
  const handleDelete = (id: string) => {
    setSelectedIds(new Set([id]));
    setConfirmAction({
      action: "delete",
      label: "Delete entry",
      description: "This will permanently delete this entry. This cannot be undone.",
    });
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => {
      setShowBulkPrivacy(false);
      setShowBulkSeries(false);
      setShowBulkTags(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const hasSelectedDrafts = entries.some((e) => selectedIds.has(e.id) && e.status === "draft");
  const totalPages = Math.ceil(total / perPage);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Posts
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {total} {total === 1 ? "entry" : "entries"} total
          </p>
        </div>
        <Link
          href="/editor"
          className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          + New entry
        </Link>
      </div>

      {/* Filter bar */}
      <div className="manage-filter-bar">
        {/* Status pills */}
        <div className="flex gap-1">
          {[
            { value: "", label: "All" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Drafts" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateFilter("status", opt.value)}
              className={`manage-filter-pill ${filters.status === opt.value ? "manage-filter-pill--active" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Dropdowns */}
        <select
          value={filters.privacy}
          onChange={(e) => updateFilter("privacy", e.target.value)}
          className="manage-select"
        >
          <option value="">All privacy</option>
          {Object.entries(PRIVACY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={(e) => updateFilter("category", e.target.value)}
          className="manage-select"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <select
          value={filters.series_id}
          onChange={(e) => updateFilter("series_id", e.target.value)}
          className="manage-select"
        >
          <option value="">All series</option>
          <option value="none">No series</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filters.sort}
          onChange={(e) => updateFilter("sort", e.target.value)}
          className="manage-select"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_inked">Most inked</option>
          <option value="alphabetical">A–Z</option>
        </select>

        {/* Search */}
        <input
          type="text"
          placeholder="Search titles..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="manage-search"
        />
      </div>

      {/* Table */}
      <div className="manage-table-wrap" style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
        {entries.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: "var(--muted)", fontFamily: "var(--font-lora, Georgia, serif)", fontStyle: "italic" }}>
              {total === 0 && !filters.search && !filters.status && !filters.privacy
                ? "No entries yet. Start writing!"
                : "No entries match your filters."}
            </p>
            {total === 0 && !filters.search && (
              <Link
                href="/editor"
                className="inline-block mt-4 rounded-full px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Write your first entry
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="manage-table hidden sm:table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === entries.length && entries.length > 0}
                      onChange={toggleSelectAll}
                      className="manage-checkbox"
                    />
                  </th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 80 }}>Privacy</th>
                  <th className="hidden lg:table-cell" style={{ width: 110 }}>Category</th>
                  <th className="hidden md:table-cell" style={{ width: 100 }}>Date</th>
                  <th className="hidden lg:table-cell" style={{ width: 80 }}>Stats</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedIds.has(entry.id) ? "manage-row--selected" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        className="manage-checkbox"
                      />
                    </td>
                    <td>
                      <Link
                        href={`/editor?edit=${entry.id}`}
                        className="manage-title-link"
                      >
                        {entry.title || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Untitled</span>}
                      </Link>
                      {entry.series_name && (
                        <span className="manage-series-badge">{entry.series_name}</span>
                      )}
                      {entry.tags.length > 0 && (
                        <span className="manage-tag-count" title={entry.tags.join(", ")}>
                          {entry.tags.length} tag{entry.tags.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className="manage-badge"
                        style={{
                          background: entry.status === "published"
                            ? "rgba(34, 197, 94, 0.1)"
                            : "rgba(156, 163, 175, 0.15)",
                          color: entry.status === "published" ? "#16a34a" : "var(--muted)",
                        }}
                      >
                        {entry.status === "published" ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td>
                      <span
                        className="manage-badge"
                        style={{
                          background: `color-mix(in srgb, ${PRIVACY_COLORS[entry.privacy] || "var(--muted)"} 12%, transparent)`,
                          color: PRIVACY_COLORS[entry.privacy] || "var(--muted)",
                        }}
                      >
                        {PRIVACY_LABELS[entry.privacy] || entry.privacy}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>
                        {CATEGORIES.find((c) => c.value === entry.category)?.label || "—"}
                      </span>
                    </td>
                    <td className="hidden md:table-cell">
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>
                        {timeAgo(entry.published_at || entry.updated_at)}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>
                        {entry.ink_count > 0 && <span title="Inks">💧{entry.ink_count}</span>}
                        {entry.ink_count > 0 && entry.comment_count > 0 && " "}
                        {entry.comment_count > 0 && <span title="Comments">💬{entry.comment_count}</span>}
                        {entry.ink_count === 0 && entry.comment_count === 0 && "—"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link
                          href={`/editor?edit=${entry.id}`}
                          className="manage-action-btn"
                          title="Edit"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </Link>
                        {entry.status === "published" && entry.slug && (
                          <Link
                            href={`/${username}/${entry.slug}`}
                            className="manage-action-btn"
                            title="View"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                          </Link>
                        )}
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="manage-action-btn manage-action-btn--danger"
                          title="Delete"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden flex flex-col gap-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`manage-mobile-card ${selectedIds.has(entry.id) ? "manage-mobile-card--selected" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleSelect(entry.id)}
                      className="manage-checkbox mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <Link href={`/editor?edit=${entry.id}`} className="manage-title-link block truncate">
                        {entry.title || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Untitled</span>}
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="manage-badge"
                          style={{
                            background: entry.status === "published" ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.15)",
                            color: entry.status === "published" ? "#16a34a" : "var(--muted)",
                          }}
                        >
                          {entry.status === "published" ? "Published" : "Draft"}
                        </span>
                        <span
                          className="manage-badge"
                          style={{
                            background: `color-mix(in srgb, ${PRIVACY_COLORS[entry.privacy] || "var(--muted)"} 12%, transparent)`,
                            color: PRIVACY_COLORS[entry.privacy] || "var(--muted)",
                          }}
                        >
                          {PRIVACY_LABELS[entry.privacy] || entry.privacy}
                        </span>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>
                          {timeAgo(entry.published_at || entry.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Link href={`/editor?edit=${entry.id}`} className="manage-action-btn" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </Link>
                      <button onClick={() => handleDelete(entry.id)} className="manage-action-btn manage-action-btn--danger" title="Delete">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="manage-page-btn"
          >
            ←
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .reduce<(number | "...")[]>((acc, p, i, arr) => {
              if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} style={{ color: "var(--muted)" }}>...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p as number)}
                  className={`manage-page-btn ${p === page ? "manage-page-btn--active" : ""}`}
                >
                  {p}
                </button>
              )
            )}
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="manage-page-btn"
          >
            →
          </button>
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="manage-bulk-toolbar">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs underline"
              style={{ color: "var(--muted)" }}
            >
              Clear
            </button>

            <div className="manage-bulk-divider" />

            {/* Delete */}
            <button onClick={handleBulkDelete} className="manage-bulk-btn manage-bulk-btn--danger">
              Delete
            </button>

            {/* Privacy dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setShowBulkPrivacy(!showBulkPrivacy); setShowBulkSeries(false); setShowBulkTags(false); }}
                className="manage-bulk-btn"
              >
                Privacy ▾
              </button>
              {showBulkPrivacy && (
                <div className="manage-bulk-dropdown">
                  {["public", "friends_only", "private"].map((p) => (
                    <button key={p} onClick={() => handleBulkPrivacy(p)} className="manage-bulk-dropdown-item">
                      {PRIVACY_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Series dropdown */}
            {series.length > 0 && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowBulkSeries(!showBulkSeries); setShowBulkPrivacy(false); setShowBulkTags(false); }}
                  className="manage-bulk-btn"
                >
                  Series ▾
                </button>
                {showBulkSeries && (
                  <div className="manage-bulk-dropdown">
                    <button onClick={() => handleBulkSeries(null)} className="manage-bulk-dropdown-item" style={{ color: "var(--muted)" }}>
                      Remove from series
                    </button>
                    {series.map((s) => (
                      <button key={s.id} onClick={() => handleBulkSeries(s.id)} className="manage-bulk-dropdown-item">
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { setShowBulkTags(!showBulkTags); setShowBulkPrivacy(false); setShowBulkSeries(false); }}
                className="manage-bulk-btn"
              >
                + Tags
              </button>
              {showBulkTags && (
                <div className="manage-bulk-dropdown" style={{ padding: "8px", minWidth: 220 }}>
                  <input
                    type="text"
                    placeholder="tag1, tag2..."
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBulkAddTags(); }}
                    className="manage-search"
                    style={{ width: "100%", marginBottom: 6 }}
                    autoFocus
                  />
                  <button onClick={handleBulkAddTags} className="manage-bulk-btn" style={{ width: "100%" }}>
                    Add tags
                  </button>
                </div>
              )}
            </div>

            {/* Publish drafts */}
            {hasSelectedDrafts && (
              <button onClick={handleBulkPublish} className="manage-bulk-btn manage-bulk-btn--accent">
                Publish
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="manage-modal-overlay" onClick={() => !bulkLoading && setConfirmAction(null)}>
          <div className="manage-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 18, fontWeight: 600 }}>
              {confirmAction.label}
            </h3>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              {confirmAction.description}
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={bulkLoading}
                className="manage-bulk-btn"
              >
                Cancel
              </button>
              <button
                onClick={confirmExec}
                disabled={bulkLoading}
                className={`manage-bulk-btn ${confirmAction.action === "delete" ? "manage-bulk-btn--danger" : "manage-bulk-btn--accent"}`}
              >
                {bulkLoading ? "Working..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
