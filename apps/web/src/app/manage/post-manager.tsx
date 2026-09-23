"use client";

import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";
import { ArchivePostmark } from "@/components/archive-postmark";
import { archiveOriginName } from "@/lib/archive";

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
  read_count?: number;
  sensitive: boolean;
  cover_image_id: string | null;
  published_at: string | null;
  scheduled_at?: string | null;
  updated_at: string;
  created_at: string;
  kind?: "entry" | "sticky";
  excerpt?: string | null;
  imported_from?: string | null;
  archive_mark?: boolean;
}

/** Stickies have no title: show the start of the thought instead. */
function EntryLabel({ entry }: { entry: ManageEntry }) {
  if (entry.kind === "sticky") {
    const text = (entry.excerpt ?? "").trim();
    return (
      <>
        <span className="manage-sticky-badge">Sticky</span>
        <span style={{ fontStyle: "italic" }}>{text.length > 70 ? `${text.slice(0, 69)}…` : text}</span>
      </>
    );
  }
  return (
    <>
      {entry.archive_mark && entry.imported_from && (
        <span className="inline-block align-middle mr-1.5">
          <ArchivePostmark
            origin={entry.imported_from}
            publishedAt={entry.published_at}
            uid={`manage-${entry.id}`}
            width={20}
            waves={false}
            title={`Postmarked: from the ${archiveOriginName(entry.imported_from)} archive`}
          />
        </span>
      )}
      {entry.title || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Untitled</span>}
    </>
  );
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
  /** Opens the page already filtered, e.g. "draft" from the Drafts page. */
  initialStatus?: string;
}

interface SelectedMeta {
  status: "draft" | "published";
  published_at: string | null;
}

interface ConfirmAction {
  action: string;
  label: string;
  description: string;
  ids: string[];
  params?: Record<string, unknown>;
  /** Drafts in a publish that are dated more than a week ago. */
  olderCount?: number;
}

const BULK_BATCH = 100;
// Must match @quiet_publish_after_days in EntryController.
const QUIET_AFTER_DAYS = 7;

function filterParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.privacy) params.set("privacy", f.privacy);
  if (f.category) params.set("category", f.category);
  if (f.series_id) params.set("series_id", f.series_id);
  if (f.search) params.set("q", f.search);
  if (f.sort) params.set("sort", f.sort);
  return params;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

export function PostManager({ initialEntries, initialTotal, series, username, initialStatus = "" }: Props) {
  const [entries, setEntries] = useState<ManageEntry[]>(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // Selection survives paging, so it can span pages ("Select all" fills it with
  // every matching entry). Each entry keeps what the bulk actions need to know.
  const [selected, setSelected] = useState<Map<string, SelectedMeta>>(new Map());
  const [selectingAll, setSelectingAll] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    status: initialStatus,
    privacy: "",
    category: "",
    series_id: "",
    search: "",
    sort: "newest",
  });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [federateOlder, setFederateOlder] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [showBulkPrivacy, setShowBulkPrivacy] = useState(false);
  const [showBulkSeries, setShowBulkSeries] = useState(false);
  const [showBulkCategory, setShowBulkCategory] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkArchive, setShowBulkArchive] = useState(false);
  // Dates are formatted in the reader's time zone, which the server can't know,
  // so they're filled in after the first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const perPage = 20;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchEntries = useCallback(
    async (p: number, f: Filters) => {
      setLoading(true);
      try {
        const params = filterParams(f);
        params.set("page", String(p));
        params.set("per_page", String(perPage));

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
      setSelected(new Map());

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
      fetchEntries(p, filters);
    },
    [filters, fetchEntries]
  );

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (entry: ManageEntry) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.set(entry.id, { status: entry.status, published_at: entry.published_at });
      return next;
    });
  };

  const pageAllSelected = entries.length > 0 && entries.every((e) => selected.has(e.id));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (pageAllSelected) entries.forEach((e) => next.delete(e.id));
      else entries.forEach((e) => next.set(e.id, { status: e.status, published_at: e.published_at }));
      return next;
    });
  };

  const selectAllMatching = async () => {
    setSelectingAll(true);
    setBulkError("");
    try {
      const res = await fetch(`/api/me/entries/ids?${filterParams(filters)}`);
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data)) throw new Error();
      setSelected(new Map((json.data as (SelectedMeta & { id: string })[]).map((e) => [e.id, { status: e.status, published_at: e.published_at }])));
    } catch {
      setBulkError("Couldn't select everything. Please try again.");
    } finally {
      setSelectingAll(false);
    }
  };

  const clearSelection = () => setSelected(new Map());

  // ── Bulk actions ───────────────────────────────────────────────────────────

  // The API takes up to 100 entries per request, so larger selections are sent
  // in batches, one after another, with progress shown.
  const runBulk = async (action: string, ids: string[], params?: Record<string, unknown>) => {
    setBulkLoading(true);
    setBulkError("");
    setBulkProgress(ids.length > BULK_BATCH ? { done: 0, total: ids.length } : null);
    let done = 0;
    try {
      for (let i = 0; i < ids.length; i += BULK_BATCH) {
        const batch = ids.slice(i, i + BULK_BATCH);
        const res = await fetch("/api/me/entries/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, entry_ids: batch, ...params }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Something went wrong");
        }
        done += batch.length;
        if (ids.length > BULK_BATCH) setBulkProgress({ done, total: ids.length });
      }
      setSelected(new Map());
      setConfirmAction(null);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Something went wrong";
      setBulkError(done > 0 ? `${reason}. ${done} of ${ids.length} were done before it stopped.` : reason);
      setConfirmAction(null);
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
      fetchEntries(page, filters);
    }
  };

  const selectedIds = Array.from(selected.keys());
  const countLabel = (n: number, one = "entry", many = "entries") => `${n} ${n === 1 ? one : many}`;

  const handleBulkDelete = () => {
    setConfirmAction({
      action: "delete",
      label: "Delete entries",
      description: `This will permanently delete ${countLabel(selectedIds.length)}. This cannot be undone.`,
      ids: selectedIds,
    });
  };

  const handleBulkPrivacy = (privacy: string) => {
    setShowBulkPrivacy(false);
    setConfirmAction({
      action: "update_privacy",
      label: `Change privacy to ${PRIVACY_LABELS[privacy] || privacy}`,
      description: `${countLabel(selectedIds.length)} will be set to ${PRIVACY_LABELS[privacy] || privacy}.`,
      ids: selectedIds,
      params: { privacy },
    });
  };

  const handleBulkSeries = (seriesId: string | null) => {
    setShowBulkSeries(false);
    if (seriesId) runBulk("set_series", selectedIds, { series_id: seriesId });
    else runBulk("remove_series", selectedIds);
  };

  const handleBulkCategory = (category: string) => {
    setShowBulkCategory(false);
    runBulk("set_category", selectedIds, { category });
  };

  const handleBulkTags = (action: "add_tags" | "remove_tags") => {
    const tags = bulkTagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length) {
      runBulk(action, selectedIds, { tags });
      setBulkTagInput("");
      setShowBulkTags(false);
    }
  };

  const selectedDrafts = Array.from(selected.entries()).filter(([, m]) => m.status === "draft");

  const handleBulkPublish = () => {
    if (selectedDrafts.length === 0) return;
    const cutoff = Date.now() - QUIET_AFTER_DAYS * 86_400_000;
    const olderCount = selectedDrafts.filter(([, m]) => m.published_at && new Date(m.published_at).getTime() < cutoff).length;
    setFederateOlder(false);
    setConfirmAction({
      action: "publish",
      label: "Publish drafts",
      description: `${countLabel(selectedDrafts.length, "draft", "drafts")} will be published${selectedDrafts.length < selectedIds.length ? " (already published entries in your selection are left alone)" : ""}.`,
      ids: selectedDrafts.map(([id]) => id),
      olderCount,
    });
  };

  const confirmExec = () => {
    if (!confirmAction) return;
    const params =
      confirmAction.action === "publish"
        ? { ...confirmAction.params, federate_older: federateOlder }
        : confirmAction.params;
    runBulk(confirmAction.action, confirmAction.ids, params);
  };

  // Single delete, leaving any bulk selection alone
  const handleDelete = (id: string) => {
    setConfirmAction({
      action: "delete",
      label: "Delete entry",
      description: "This will permanently delete this entry. This cannot be undone.",
      ids: [id],
    });
  };

  // Close dropdowns on a click outside the toolbar. This used to close on every
  // click: React listens on the document here too, so the buttons'
  // stopPropagation never kept the click from reaching this listener, and the
  // menus closed the moment they opened.
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      setShowBulkPrivacy(false);
      setShowBulkSeries(false);
      setShowBulkCategory(false);
      setShowBulkTags(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const closeMenus = () => {
    setShowBulkPrivacy(false);
    setShowBulkSeries(false);
    setShowBulkCategory(false);
    setShowBulkTags(false);
    setShowBulkArchive(false);
  };

  const hasSelectedDrafts = selectedDrafts.length > 0;
  const hasImports = entries.some((e) => e.imported_from);
  const totalPages = Math.ceil(total / perPage);
  const entryDate = (entry: ManageEntry) =>
    !mounted
      ? ""
      : entry.scheduled_at
        ? formatDate(entry.scheduled_at)
        : entry.published_at
          ? formatDate(entry.published_at)
          : "No date";

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
          <option value="newest">Newest date</option>
          <option value="oldest">Oldest date</option>
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

      {/* Select across pages */}
      {pageAllSelected && total > entries.length && (
        <div className="text-sm text-center rounded-lg px-4 py-2 mb-3"
          style={{ background: "var(--surface-hover)", color: "var(--foreground)" }}>
          {selected.size >= total ? (
            <>
              All {total} {filters.status === "draft" ? "drafts" : "entries"} are selected.{" "}
              <button onClick={clearSelection} className="underline" style={{ color: "var(--accent)" }}>
                Clear selection
              </button>
            </>
          ) : (
            <>
              {selected.size} selected on this page.{" "}
              <button onClick={selectAllMatching} disabled={selectingAll} className="underline font-medium" style={{ color: "var(--accent)" }}>
                {selectingAll ? "Selecting…" : `Select all ${total} ${filters.status === "draft" ? "drafts" : "entries"}${filters.privacy || filters.category || filters.series_id || filters.search ? " that match" : ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {bulkError && (
        <div role="alert" className="text-sm rounded-lg px-4 py-2 mb-3 flex items-center gap-3"
          style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}>
          <span className="flex-1">{bulkError}</span>
          <button onClick={() => setBulkError("")} className="text-xs underline">Dismiss</button>
        </div>
      )}

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
                      checked={pageAllSelected}
                      aria-label="Select all on this page"
                      onChange={toggleSelectAll}
                      className="manage-checkbox"
                    />
                  </th>
                  <th>Title</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 80 }}>Privacy</th>
                  <th className="hidden lg:table-cell" style={{ width: 110 }}>Category</th>
                  <th className="hidden md:table-cell" style={{ width: 100 }}>Date</th>
                  <th className="hidden lg:table-cell" style={{ width: 130 }}>Stats</th>
                  <th style={{ width: 80 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selected.has(entry.id) ? "manage-row--selected" : ""}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.id)}
                        onChange={() => toggleSelect(entry)}
                        className="manage-checkbox"
                      />
                    </td>
                    <td>
                      <Link
                        href={`/editor?edit=${entry.id}`}
                        className="manage-title-link"
                      >
                        <EntryLabel entry={entry} />
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
                        {entry.status === "published" ? "Published" : entry.scheduled_at ? "Scheduled" : "Draft"}
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
                        {entryDate(entry)}
                      </span>
                    </td>
                    <td className="hidden lg:table-cell">
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>
                        {[
                          (entry.read_count ?? 0) > 0 && <span key="r" title="Reads">{entry.read_count} read{entry.read_count === 1 ? "" : "s"}</span>,
                          entry.ink_count > 0 && <span key="i" title="Inks">💧{entry.ink_count}</span>,
                          entry.comment_count > 0 && <span key="c" title="Comments">💬{entry.comment_count}</span>,
                        ].filter(Boolean).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, " · ", el] : [el]), [])}
                        {!entry.read_count && entry.ink_count === 0 && entry.comment_count === 0 && "—"}
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
                  className={`manage-mobile-card ${selected.has(entry.id) ? "manage-mobile-card--selected" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.id)}
                      onChange={() => toggleSelect(entry)}
                      className="manage-checkbox mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <Link href={`/editor?edit=${entry.id}`} className="manage-title-link block truncate">
                        <EntryLabel entry={entry} />
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="manage-badge"
                          style={{
                            background: entry.status === "published" ? "rgba(34, 197, 94, 0.1)" : "rgba(156, 163, 175, 0.15)",
                            color: entry.status === "published" ? "#16a34a" : "var(--muted)",
                          }}
                        >
                          {entry.status === "published" ? "Published" : entry.scheduled_at ? "Scheduled" : "Draft"}
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
                          {entryDate(entry)}
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
      {selected.size > 0 && (
        <div className="manage-bulk-toolbar" ref={toolbarRef}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              {bulkProgress ? `Working… ${bulkProgress.done} of ${bulkProgress.total}` : `${selected.size} selected`}
            </span>
            <button
              onClick={clearSelection}
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
                onClick={() => { const open = !showBulkPrivacy; closeMenus(); setShowBulkPrivacy(open); }}
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
                  onClick={() => { const open = !showBulkSeries; closeMenus(); setShowBulkSeries(open); }}
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

            {/* Category dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { const open = !showBulkCategory; closeMenus(); setShowBulkCategory(open); }}
                className="manage-bulk-btn"
                disabled={bulkLoading}
              >
                Category ▾
              </button>
              {showBulkCategory && (
                <div className="manage-bulk-dropdown" style={{ maxHeight: 280, overflowY: "auto" }}>
                  <button onClick={() => handleBulkCategory("")} className="manage-bulk-dropdown-item" style={{ color: "var(--muted)" }}>
                    No category
                  </button>
                  {CATEGORIES.map((c) => (
                    <button key={c.value} onClick={() => handleBulkCategory(c.value)} className="manage-bulk-dropdown-item">
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => { const open = !showBulkTags; closeMenus(); setShowBulkTags(open); }}
                className="manage-bulk-btn"
              >
                Tags ▾
              </button>
              {showBulkTags && (
                <div className="manage-bulk-dropdown" style={{ padding: "8px", minWidth: 220 }}>
                  <input
                    type="text"
                    placeholder="tag1, tag2..."
                    value={bulkTagInput}
                    onChange={(e) => setBulkTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleBulkTags("add_tags"); }}
                    className="manage-search"
                    style={{ width: "100%", marginBottom: 6 }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkTags("add_tags")} className="manage-bulk-btn" style={{ flex: 1 }}>
                      Add
                    </button>
                    <button onClick={() => handleBulkTags("remove_tags")} className="manage-bulk-btn" style={{ flex: 1 }}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Archive postmark (imported posts only) */}
            {hasImports && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { const open = !showBulkArchive; closeMenus(); setShowBulkArchive(open); }}
                  className="manage-bulk-btn"
                >
                  Postmark ▾
                </button>
                {showBulkArchive && (
                  <div className="manage-bulk-dropdown">
                    <button onClick={() => { setShowBulkArchive(false); runBulk("archive_mark_on", selectedIds); }} className="manage-bulk-dropdown-item">
                      Postmark as from my archive
                    </button>
                    <button onClick={() => { setShowBulkArchive(false); runBulk("archive_mark_off", selectedIds); }} className="manage-bulk-dropdown-item">
                      Remove the postmark
                    </button>
                    <p className="px-3 pb-2 pt-1 text-xs" style={{ color: "var(--muted)", maxWidth: 240 }}>
                      Only imported posts can be postmarked; others are left as they are.
                    </p>
                  </div>
                )}
              </div>
            )}

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
            {!!confirmAction.olderCount && (
              <div className="mt-4 text-sm rounded-lg p-3" style={{ background: "var(--surface-hover)" }}>
                <p style={{ color: "var(--foreground)" }}>
                  {confirmAction.olderCount === confirmAction.ids.length
                    ? confirmAction.ids.length === 1 ? "This one is" : `All ${confirmAction.ids.length} are`
                    : `${confirmAction.olderCount} of them are`}{" "}
                  dated more than a week ago. They&apos;ll appear on your profile at their original dates, without
                  being sent to your fediverse followers&apos; timelines as new posts.
                </p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer" style={{ color: "var(--foreground)" }}>
                  <input type="checkbox" checked={federateOlder} onChange={(e) => setFederateOlder(e.target.checked)} />
                  Send {confirmAction.olderCount === 1 ? "it" : "them"} to my fediverse followers anyway
                </label>
              </div>
            )}
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
                {bulkLoading ? (bulkProgress ? `Working… ${bulkProgress.done}/${bulkProgress.total}` : "Working…") : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
