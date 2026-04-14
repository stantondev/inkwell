"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AdminSkeletonCards } from "../admin-skeleton";

interface WarningUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  strike_count: number;
  blocked_at: string | null;
}

interface WarningIssuer {
  username: string;
  display_name: string;
}

interface Warning {
  id: string;
  reason: string;
  details: string | null;
  strike_number: number;
  escalated_to_block: boolean;
  report_id: string | null;
  entry_id: string | null;
  issued_by: WarningIssuer | null;
  user: WarningUser | null;
  inserted_at: string;
}

interface Pagination {
  page: number;
  per_page: number;
  total: number;
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  unlabeled_sensitive: "Unlabeled sensitive",
  csam_illegal: "CSAM / Illegal",
  other: "Other",
};

function reasonBadgeClass(reason: string): string {
  if (reason === "csam_illegal") return "admin-badge admin-badge--danger";
  if (reason === "hate_speech") return "admin-badge admin-badge--warning";
  return "admin-badge admin-badge--accent-light";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminWarningsPage() {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 50, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchWarnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/warnings?page=${page}&per_page=50`);
      if (res.ok) {
        const data = await res.json();
        setWarnings(data.data ?? []);
        setPagination(data.pagination ?? { page: 1, per_page: 50, total: 0 });
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchWarnings();
  }, [fetchWarnings]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.per_page));

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Every warning issued, newest first. This is the durable audit log — warnings stay
          here even if the reported entry was later deleted. Read-only.
        </p>
        {pagination.total > 0 && (
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {pagination.total} total warning{pagination.total === 1 ? "" : "s"} issued
          </p>
        )}
      </div>

      {loading ? (
        <AdminSkeletonCards count={4} />
      ) : warnings.length === 0 ? (
        <div className="admin-empty">
          <p>No warnings have been issued yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {warnings.map((w) => (
            <div key={w.id} className="admin-card">
              {/* Header row: recipient + strike/reason/escalation */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  {w.user ? (
                    <>
                      <Avatar
                        url={w.user.avatar_url}
                        name={w.user.display_name || w.user.username}
                        size={32}
                      />
                      <div className="min-w-0">
                        <Link
                          href={`/${w.user.username}`}
                          className="text-sm font-medium hover:underline"
                          style={{ color: "var(--foreground)" }}
                        >
                          @{w.user.username}
                        </Link>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {w.user.strike_count} total strike{w.user.strike_count === 1 ? "" : "s"}
                          {w.user.blocked_at && (
                            <>
                              {" · "}
                              <span style={{ color: "var(--danger)", fontWeight: 500 }}>
                                account suspended
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm italic" style={{ color: "var(--muted)" }}>
                      deleted user
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="admin-badge"
                    style={{
                      background: w.escalated_to_block ? "var(--danger, #dc2626)" : "var(--surface-hover)",
                      color: w.escalated_to_block ? "white" : "var(--foreground)",
                      fontWeight: 600,
                    }}
                  >
                    Strike {w.strike_number}
                  </span>
                  <span className={reasonBadgeClass(w.reason)}>
                    {REASON_LABELS[w.reason] || w.reason}
                  </span>
                  {w.escalated_to_block && (
                    <span className="admin-badge admin-badge--danger">Auto-suspended</span>
                  )}
                </div>
              </div>

              {/* Warning details */}
              {w.details && (
                <div
                  className="rounded-lg border p-3 mb-3"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                >
                  <p
                    className="text-sm"
                    style={{ color: "var(--foreground)", opacity: 0.85, whiteSpace: "pre-wrap", lineHeight: 1.6 }}
                  >
                    {w.details}
                  </p>
                </div>
              )}

              {/* Footer meta */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
                <span>{formatDate(w.inserted_at)}</span>
                <span>&middot;</span>
                <span>{timeAgo(w.inserted_at)}</span>
                {w.issued_by && (
                  <>
                    <span>&middot;</span>
                    <span>
                      issued by{" "}
                      <Link
                        href={`/${w.issued_by.username}`}
                        className="hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        @{w.issued_by.username}
                      </Link>
                    </span>
                  </>
                )}
                {!w.entry_id && !w.report_id && (
                  <>
                    <span>&middot;</span>
                    <span className="italic">entry &amp; report cleaned up</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="admin-btn admin-btn--outline admin-btn--sm"
          >
            ← Previous
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="admin-btn admin-btn--outline admin-btn--sm"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
