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

interface WarnResult {
  blocked: boolean;
  warning: { strike_number: number; escalated_to_block: boolean };
  user: { strike_count: number; username: string };
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
  const [warnModal, setWarnModal] = useState<Report | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

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

  // Warn: issues a graduated warning, optionally also deletes the entry,
  // and marks the report as actioned. Server also auto-blocks at strike threshold.
  const handleWarn = async (
    report: Report,
    opts: { details: string; deleteEntry: boolean }
  ) => {
    if (!report.entry?.author) return;

    const res = await fetch(`/api/admin/users/${report.entry.author.id}/warn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: report.reason,
        details: opts.details,
        report_id: report.id,
        entry_id: report.entry.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setLastAction(`Failed to warn user: ${err.error || res.statusText}`);
      return;
    }

    const json: { data: WarnResult } = await res.json();
    const { blocked, warning, user } = json.data;

    if (opts.deleteEntry) {
      await fetch(`/api/admin/entries/${report.entry.id}`, { method: "DELETE" });
    }

    const strikeText = `Strike ${warning.strike_number} issued to @${user.username}`;
    const extra = blocked ? " — account auto-blocked (threshold reached)" : "";
    const entryText = opts.deleteEntry ? " · entry deleted" : "";
    setLastAction(`${strikeText}${extra}${entryText}`);
    setWarnModal(null);
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
                  {report.entry?.author && (
                    <button
                      onClick={() => setWarnModal(report)}
                      className="admin-btn admin-btn--danger admin-btn--sm"
                      title="Issue a graduated warning to the author and auto-escalate on repeat offenses"
                    >
                      Warn user
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(report.id, "actioned")}
                    className="admin-btn admin-btn--outline admin-btn--sm"
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

      {/* Action toast */}
      {lastAction && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border px-4 py-3 shadow-lg"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        >
          <div className="flex items-start gap-2">
            <span className="text-sm flex-1">{lastAction}</span>
            <button
              onClick={() => setLastAction(null)}
              className="text-xs opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Warn modal */}
      {warnModal && (
        <WarnModal
          report={warnModal}
          onCancel={() => setWarnModal(null)}
          onConfirm={(details, deleteEntry) =>
            handleWarn(warnModal, { details, deleteEntry })
          }
        />
      )}
    </div>
  );
}

// ─── Warn modal component ──────────────────────────────────────────────────

function WarnModal({
  report,
  onCancel,
  onConfirm,
}: {
  report: Report;
  onCancel: () => void;
  onConfirm: (details: string, deleteEntry: boolean) => void;
}) {
  const [details, setDetails] = useState<string>(
    defaultWarningText(report.reason, report.entry?.title || null)
  );
  const [deleteEntry, setDeleteEntry] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(details, deleteEntry);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border p-6 shadow-2xl"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface)",
          color: "var(--foreground)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-xl font-semibold mb-2"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Warn @{report.entry?.author?.username}
        </h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          The user receives an in-app notification and an email with the
          message below. Their strike count goes up by one. At 3 strikes
          their account is automatically suspended.
        </p>

        <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
          Warning message to the user
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={6}
          maxLength={2000}
          className="w-full rounded-lg border p-3 text-sm mb-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontFamily: "Georgia, serif",
          }}
          placeholder="Explain what the user did wrong and what they should change."
        />

        <label className="flex items-center gap-2 mb-6 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={deleteEntry}
            onChange={(e) => setDeleteEntry(e.target.checked)}
          />
          <span>
            Also delete the reported entry
            {report.entry?.title && (
              <span className="ml-1 italic" style={{ color: "var(--muted)" }}>
                &ldquo;{report.entry.title.slice(0, 50)}
                {report.entry.title.length > 50 ? "…" : ""}&rdquo;
              </span>
            )}
          </span>
        </label>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="admin-btn admin-btn--outline admin-btn--sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || details.trim().length === 0}
            className="admin-btn admin-btn--danger admin-btn--sm"
          >
            {submitting ? "Sending…" : "Send warning"}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultWarningText(reason: string, entryTitle: string | null): string {
  const titleRef = entryTitle ? ` ("${entryTitle.slice(0, 80)}")` : "";
  switch (reason) {
    case "spam":
      return `Your recent entry${titleRef} was reported and reviewed as commercial spam. Per our Community Guidelines, Inkwell does not allow spam, scams, or commercial solicitation disguised as journal entries. Please only publish personal writing you created. Further violations will lead to account suspension.`;
    case "harassment":
      return `Your recent entry${titleRef} was reported and reviewed as harassment. Per our Community Guidelines, Inkwell is a space for kindness and good faith. Please remove or revise any content that targets another person. Further violations will lead to account suspension.`;
    case "hate_speech":
      return `Your recent entry${titleRef} was reported and reviewed as hate speech. Per our Community Guidelines, Inkwell does not permit content that targets people based on their identity. Further violations will lead to account suspension.`;
    case "unlabeled_sensitive":
      return `Your recent entry${titleRef} contains sensitive content without a content warning. Please add a content warning so readers can make an informed choice before reading.`;
    case "csam_illegal":
      return `Your recent entry${titleRef} was reported as prohibited content. This is a serious matter and further violations will lead to immediate and permanent suspension.`;
    default:
      return `Your recent entry${titleRef} was reported and reviewed for violating our Community Guidelines. Please review the guidelines and avoid further violations — repeated offenses lead to account suspension.`;
  }
}
