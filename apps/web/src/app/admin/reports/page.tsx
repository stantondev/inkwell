"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { AdminSkeletonCards } from "../admin-skeleton";

interface ReportAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface ReportEntry {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  sensitive: boolean;
  admin_sensitive: boolean;
  author: { id: string; username: string; display_name: string } | null;
}

interface Report {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter: ReportAuthor | null;
  entry: ReportEntry | null;
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  unlabeled_sensitive: "Unlabeled sensitive",
  csam_illegal: "CSAM / Illegal",
  other: "Other",
};

const STATUS_TABS = [
  { key: "pending", label: "Pending" },
  { key: "all", label: "All" },
  { key: "dismissed", label: "Dismissed" },
  { key: "actioned", label: "Actioned" },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function reasonBadgeClass(reason: string): string {
  if (reason === "csam_illegal") return "admin-badge admin-badge--danger";
  if (reason === "hate_speech") return "admin-badge admin-badge--warning";
  return "admin-badge admin-badge--accent-light";
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const res = await fetch(`/api/admin/reports${qs}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.data ?? []);
        setPendingCount(data.pending_count ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleAction = async (reportId: string, action: string, entryId?: string) => {
    await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    });

    if (action === "actioned" && entryId) {
      await fetch(`/api/admin/entries/${entryId}/mark-sensitive`, { method: "POST" });
    }

    fetchReports();
  };

  return (
    <div>
      {/* Status filter tabs */}
      <div className="admin-filter-bar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={`admin-filter-pill ${status === tab.key ? "admin-filter-pill--active" : ""}`}
          >
            {tab.label}
            {tab.key === "pending" && pendingCount > 0 && (
              <span className="ml-1.5">({pendingCount})</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <AdminSkeletonCards count={3} />
      ) : reports.length === 0 ? (
        <div className="admin-empty"><p>No reports found.</p></div>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="admin-card">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  {report.reporter && (
                    <>
                      <Avatar url={report.reporter.avatar_url} name={report.reporter.display_name} size={24} />
                      <Link href={`/${report.reporter.username}`} className="text-sm font-medium hover:underline">
                        @{report.reporter.username}
                      </Link>
                    </>
                  )}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {timeAgo(report.created_at)}
                  </span>
                </div>
                <span className={reasonBadgeClass(report.reason)}>
                  {REASON_LABELS[report.reason] || report.reason}
                </span>
              </div>

              {/* Entry preview */}
              {report.entry && (
                <div className="rounded-lg border p-3 mb-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="min-w-0">
                      <Link href={`/${report.entry.author?.username}/${report.entry.slug}`}
                        className="text-sm font-medium hover:underline">
                        {report.entry.title || report.entry.excerpt?.slice(0, 60) || "Untitled entry"}
                      </Link>
                      {report.entry.author && (
                        <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                          by @{report.entry.author.username}
                        </span>
                      )}
                    </div>
                    {(report.entry.sensitive || report.entry.admin_sensitive) && (
                      <span className="admin-badge admin-badge--accent-light">Sensitive</span>
                    )}
                  </div>
                  {report.entry.excerpt && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                      {report.entry.excerpt}
                    </p>
                  )}
                </div>
              )}

              {/* Details */}
              {report.details && (
                <p className="text-sm mb-3" style={{ color: "var(--foreground)", opacity: 0.8 }}>
                  {report.details}
                </p>
              )}

              {/* Actions */}
              {report.status === "pending" && (
                <div className="admin-action-row" style={{ marginTop: "12px" }}>
                  <button
                    onClick={() => handleAction(report.id, "dismissed")}
                    className="admin-btn admin-btn--outline admin-btn--sm"
                  >
                    Dismiss
                  </button>
                  {report.entry && !(report.entry.sensitive || report.entry.admin_sensitive) && (
                    <button
                      onClick={() => handleAction(report.id, "actioned", report.entry!.id)}
                      className="admin-btn admin-btn--outline admin-btn--sm"
                    >
                      Mark sensitive
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(report.id, "actioned")}
                    className="admin-btn admin-btn--danger admin-btn--sm"
                  >
                    Action taken
                  </button>
                </div>
              )}

              {/* Resolved info */}
              {report.status !== "pending" && (
                <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  Status: <span className="font-medium capitalize">{report.status}</span>
                  {report.resolved_at && <> &middot; {timeAgo(report.resolved_at)}</>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
