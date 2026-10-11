"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DraftRow } from "./draft-row";
import { DeleteDialog, type PendingDelete } from "./delete-dialog";
import {
  DRAFTS_PER_PAGE,
  type DraftEntry,
  type DraftSort,
  type DraftsMeta,
  type DraftsPagination,
  type DraftsResponse,
} from "./draft-types";
import styles from "./drafts.module.css";

// The bulk endpoint takes up to 100 ids per request.
const DELETE_BATCH = 100;
// "Select all" loads ids 100 at a time and stops here.
const SELECT_ALL_MAX = 2000;
const SEARCH_MIN = 2;

const SORT_OPTIONS: { value: DraftSort; label: string }[] = [
  { value: "updated", label: "Last edited" },
  { value: "created", label: "Created" },
  { value: "title", label: "Title" },
];

const NUMBER = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many: string) => `${NUMBER.format(n)} ${n === 1 ? one : many}`;

/** Counts toward the free plan's draft allowance (scheduled and imported drafts don't). */
const countsTowardLimit = (d: DraftEntry) => !d.scheduled_at && d.entry_source !== "import";

async function fetchDrafts(page: number, perPage: number, q: string, sort: DraftSort): Promise<DraftsResponse> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort });
  if (q) params.set("q", q);
  const res = await fetch(`/api/drafts?${params}`, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(json.data)) {
    throw new Error(json.error || "Couldn't load your drafts.");
  }
  return {
    data: json.data,
    pagination: json.pagination ?? { page, per_page: perPage, total: json.data.length, total_pages: page },
    meta: json.meta,
  };
}

function sentence(text: string) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function DraftsList({
  initialDrafts,
  initialPagination,
  initialMeta,
  showScheduledNotice,
}: {
  initialDrafts: DraftEntry[];
  initialPagination: DraftsPagination;
  initialMeta: DraftsMeta;
  showScheduledNotice: boolean;
}) {
  const router = useRouter();

  const [drafts, setDrafts] = useState(initialDrafts);
  // pagination.total counts the drafts matching the search; overallTotal is
  // every draft, for the line under the heading.
  const [pagination, setPagination] = useState(initialPagination);
  const [overallTotal, setOverallTotal] = useState(initialPagination.total);
  const [meta, setMeta] = useState(initialMeta);

  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<DraftSort>("updated");
  const [listLoading, setListLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [scheduledNotice, setScheduledNotice] = useState(showScheduledNotice);
  // Relative times ("3 hours ago") only after mount, so hydration matches.
  const [now, setNow] = useState<number | null>(null);

  // Responses to a search or sort that has since changed are ignored.
  const requestSeq = useRef(0);
  const loadedKey = useRef("|updated");

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // The "Scheduled." note shows once; take ?scheduled=1 off the URL so a
  // reload doesn't bring it back.
  useEffect(() => {
    if (showScheduledNotice) router.replace("/drafts", { scroll: false });
  }, [showScheduledNotice, router]);

  useEffect(() => {
    const t = setTimeout(() => {
      const term = query.trim();
      setSearchTerm(term.length >= SEARCH_MIN ? term : "");
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const reload = useCallback(async (q: string, sortBy: DraftSort) => {
    const seq = ++requestSeq.current;
    setListLoading(true);
    setError(null);
    try {
      const res = await fetchDrafts(1, DRAFTS_PER_PAGE, q, sortBy);
      if (seq !== requestSeq.current) return;
      setDrafts(res.data);
      setPagination(res.pagination);
      if (res.meta) setMeta(res.meta);
      if (!q) setOverallTotal(res.pagination.total);
      setSelected(new Set());
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError({
        message: err instanceof Error ? err.message : "Couldn't load your drafts.",
        retry: () => void reload(q, sortBy),
      });
    } finally {
      if (seq === requestSeq.current) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const key = `${searchTerm}|${sort}`;
    if (key === loadedKey.current) return;
    loadedKey.current = key;
    void reload(searchTerm, sort);
  }, [searchTerm, sort, reload]);

  // Pages are fixed blocks of 20, and deleting rows shifts everything after
  // them, so fetch the page(s) covering the next 20 positions and skip any
  // already on screen rather than assuming page N+1 starts where we stopped.
  async function loadMore() {
    const seq = requestSeq.current;
    setLoadingMore(true);
    setError(null);
    try {
      const start = drafts.length;
      const firstPage = Math.floor(start / DRAFTS_PER_PAGE) + 1;
      const lastPage = Math.floor((start + DRAFTS_PER_PAGE - 1) / DRAFTS_PER_PAGE) + 1;
      const responses: DraftsResponse[] = [];
      for (let p = firstPage; p <= lastPage; p++) {
        const res = await fetchDrafts(p, DRAFTS_PER_PAGE, searchTerm, sort);
        responses.push(res);
        if (p >= res.pagination.total_pages) break;
      }
      if (seq !== requestSeq.current) return;
      setDrafts((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        const added: DraftEntry[] = [];
        for (const d of responses.flatMap((r) => r.data)) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          added.push(d);
        }
        return [...prev, ...added];
      });
      const last = responses[responses.length - 1];
      setPagination(last.pagination);
      if (last.meta) setMeta(last.meta);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError({
        message: err instanceof Error ? err.message : "Couldn't load more drafts.",
        retry: () => void loadMore(),
      });
    } finally {
      setLoadingMore(false);
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allShownSelected = drafts.length > 0 && drafts.every((d) => selected.has(d.id));

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) drafts.forEach((d) => next.delete(d.id));
      else drafts.forEach((d) => next.add(d.id));
      return next;
    });
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (let page = 1; ids.length < SELECT_ALL_MAX; page++) {
        const res = await fetchDrafts(page, 100, searchTerm, sort);
        ids.push(...res.data.map((d) => d.id));
        if (page >= res.pagination.total_pages || res.data.length === 0) break;
      }
      setSelected(new Set(ids.slice(0, SELECT_ALL_MAX)));
    } catch {
      setError({ message: "Couldn't select all your drafts. Please try again." });
    } finally {
      setSelectingAll(false);
    }
  }

  // ── Deleting ───────────────────────────────────────────────────────────────

  function askDeleteOne(draft: DraftEntry) {
    setPendingDelete({
      ids: [draft.id],
      single: true,
      title: draft.title?.trim() || null,
      scheduledCount: draft.scheduled_at ? 1 : 0,
    });
  }

  function askDeleteSelected() {
    const ids = Array.from(selected);
    const loaded = drafts.filter((d) => selected.has(d.id));
    setPendingDelete({
      ids,
      single: false,
      title: null,
      scheduledCount: loaded.filter((d) => d.scheduled_at).length,
    });
  }

  // Re-read the numbers in the header after a delete. The local adjustment
  // can't know about drafts that were selected but never loaded.
  async function refreshCounts() {
    try {
      const res = await fetchDrafts(1, 1, searchTerm, sort);
      if (res.meta) setMeta(res.meta);
      setPagination((p) => ({ ...p, total: res.pagination.total }));
      if (!searchTerm) setOverallTotal(res.pagination.total);
    } catch {
      // Keep the locally adjusted numbers.
    }
  }

  function removeDeleted(ids: string[]) {
    const gone = new Set(ids);
    const removedLoaded = drafts.filter((d) => gone.has(d.id));
    const remaining = drafts.filter((d) => !gone.has(d.id));
    setDrafts(remaining);
    setPagination((p) => ({ ...p, total: Math.max(0, p.total - ids.length) }));
    setOverallTotal((t) => Math.max(0, t - ids.length));
    setMeta((m) => ({
      ...m,
      counted: Math.max(0, m.counted - removedLoaded.filter(countsTowardLimit).length),
      scheduled: Math.max(0, m.scheduled - removedLoaded.filter((d) => d.scheduled_at).length),
    }));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    // The sidebar's draft count updates now instead of on its next poll.
    window.dispatchEvent(new Event("inkwell-nav-refresh"));

    if (remaining.length === 0 && pagination.total - ids.length > 0) {
      void reload(searchTerm, sort);
    } else {
      void refreshCounts();
    }
  }

  async function performDelete(target: PendingDelete) {
    setDeleting(true);
    setError(null);
    const ids = target.ids;
    const done: string[] = [];
    try {
      if (target.single) {
        const res = await fetch(`/api/entries/${ids[0]}`, { method: "DELETE" });
        // 404: already gone, which is what was asked for.
        if (!res.ok && res.status !== 404) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Couldn't delete that draft");
        }
        done.push(ids[0]);
      } else {
        setProgress(ids.length > DELETE_BATCH ? { done: 0, total: ids.length } : null);
        for (let i = 0; i < ids.length; i += DELETE_BATCH) {
          const batch = ids.slice(i, i + DELETE_BATCH);
          const res = await fetch("/api/me/entries/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", entry_ids: batch }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.ok) throw new Error(json.error || "Couldn't delete those drafts");
          done.push(...batch);
          if (ids.length > DELETE_BATCH) setProgress({ done: done.length, total: ids.length });
        }
      }
      setPendingDelete(null);
    } catch (err) {
      const reason = sentence(err instanceof Error ? err.message : "Something went wrong");
      setError({
        message: done.length
          ? `${reason} ${NUMBER.format(done.length)} of ${NUMBER.format(ids.length)} drafts were deleted before it stopped.`
          : reason,
      });
      setPendingDelete(null);
    } finally {
      if (done.length) removeDeleted(done);
      setDeleting(false);
      setProgress(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const limit = meta.draft_limit;
  const atLimit = limit !== null && meta.counted >= limit;
  const someNotCounted = limit !== null && overallTotal > meta.counted;
  const hasMore = drafts.length < pagination.total;
  const nothingAtAll = overallTotal === 0 && !searchTerm && drafts.length === 0;
  const selectedCount = selected.size;

  return (
    <>
      <div className={styles.summary}>
        <span>{plural(overallTotal, "draft", "drafts")}</span>
        {limit !== null && (
          <span className={styles.meter}>
            <span
              className={styles.meterTrack}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={Math.min(meta.counted, limit)}
              aria-label="Draft allowance used"
            >
              <span
                className={`${styles.meterFill} ${atLimit ? styles.meterFull : ""}`}
                style={{ width: `${Math.min(100, (meta.counted / Math.max(1, limit)) * 100)}%` }}
              />
            </span>
            {NUMBER.format(meta.counted)} of {NUMBER.format(limit)} used
          </span>
        )}
        {meta.scheduled > 0 && <span>{NUMBER.format(meta.scheduled)} scheduled</span>}
        {someNotCounted && <span>Scheduled and imported drafts don&apos;t count.</span>}
      </div>

      {atLimit && (
        <div className={styles.limitWarning} role="status">
          All {NUMBER.format(limit)} draft pages are full — finish or delete one to start another.{" "}
          <Link href="/settings/billing">Plus has no limit</Link>.
        </div>
      )}

      {scheduledNotice && (
        <div className={styles.notice} role="status">
          <span>
            Scheduled. It will publish itself at the time you picked, and stays here until then so you can keep
            editing it.
          </span>
          <button type="button" className={styles.dismiss} onClick={() => setScheduledNotice(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <span>{error.message}</span>
          {error.retry && (
            <button type="button" className={styles.textButton} onClick={error.retry}>
              Try again
            </button>
          )}
          <button type="button" className={styles.dismiss} onClick={() => setError(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {nothingAtAll ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No drafts yet.</p>
          <p className={styles.emptyText}>
            Drafts save themselves while you write, so anything you start and don&apos;t publish waits here.
          </p>
          <Link href="/editor" className={`${styles.button} ${styles.buttonAccent} inline-flex items-center mt-5`}>
            Write an entry
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <input
              type="search"
              className={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search drafts"
              aria-label="Search drafts"
              enterKeyHint="search"
            />
            <select
              className={styles.sort}
              value={sort}
              onChange={(e) => setSort(e.target.value as DraftSort)}
              aria-label="Sort drafts"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Link href="/manage?status=draft" className={styles.toolbarLink}>
              More bulk tools
            </Link>
          </div>

          {drafts.length === 0 && searchTerm && !listLoading ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No drafts match “{searchTerm}”.</p>
              <button
                type="button"
                className={`${styles.button} mt-5`}
                onClick={() => {
                  setQuery("");
                  setSearchTerm("");
                }}
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {drafts.length > 0 && (
                <label className={styles.listHead}>
                  <span className={styles.check}>
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} />
                  </span>
                  <span>Select all shown</span>
                </label>
              )}

              <ul
                className={`${styles.list} ${listLoading ? styles.loading : ""}`}
                aria-busy={listLoading}
                aria-label="Drafts"
              >
                {drafts.map((draft) => (
                  <DraftRow
                    key={draft.id}
                    draft={draft}
                    selected={selected.has(draft.id)}
                    now={now}
                    onToggle={toggle}
                    onDelete={askDeleteOne}
                  />
                ))}
              </ul>

              {selectedCount > 0 && (
                <div className={styles.actionBar} role="region" aria-label="Selected drafts">
                  <span className={styles.actionBarCount}>
                    {NUMBER.format(selectedCount)} selected
                    {selectedCount === SELECT_ALL_MAX && pagination.total > SELECT_ALL_MAX ? " (the first 2,000)" : ""}
                  </span>
                  {selectedCount < Math.min(pagination.total, SELECT_ALL_MAX) && (
                    <button
                      type="button"
                      className={styles.textButton}
                      onClick={selectAllMatching}
                      disabled={selectingAll}
                    >
                      {selectingAll ? "Selecting…" : `Select all ${NUMBER.format(pagination.total)}`}
                    </button>
                  )}
                  <span className={styles.actionBarSpacer} />
                  <button type="button" className={styles.textButton} onClick={() => setSelected(new Set())}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonDanger}`}
                    onClick={askDeleteSelected}
                    disabled={deleting}
                  >
                    Delete
                  </button>
                </div>
              )}

              {drafts.length > 0 && (
                <div className={styles.footer}>
                  <span>
                    Showing {NUMBER.format(drafts.length)} of {NUMBER.format(pagination.total)}
                    {searchTerm ? ` matching “${searchTerm}”` : ""}
                  </span>
                  {hasMore && (
                    <button type="button" className={styles.button} onClick={loadMore} disabled={loadingMore}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {pendingDelete && (
        <DeleteDialog
          pending={pendingDelete}
          deleting={deleting}
          progress={progress}
          onCancel={() => !deleting && setPendingDelete(null)}
          onConfirm={() => performDelete(pendingDelete)}
        />
      )}
    </>
  );
}
