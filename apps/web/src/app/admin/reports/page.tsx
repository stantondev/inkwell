"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminNav } from "../admin-nav";
import { Avatar } from "@/components/avatar";

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

const STATUS_TABS = ["all", "pending", "dismissed", "actioned"] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
    // Resolve report
    await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    });

    // If marking sensitive, also mark the entry
    if (action === "actioned" && entryId) {
      await fetch(`/api/admin/entries/${entryId}/mark-sensitive`, {
        method: "POST",
      });
    }

    fetchReports();
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Content Reports
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              Review reported content
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            &larr; Back to feed
          </Link>
        </div>

        <div className="mb-8">
          <AdminNav pendingReports={pendingCount} />
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 mb-6">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatus(tab)}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors capitalize"
              style={{
                background: status === tab ? "var(--accent)" : "var(--surface)",
                color: status === tab ? "white" : "var(--muted)",
                border: `1px solid ${status === tab ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {tab}
              {tab === "pending" && pendingCount > 0 && (
                <span className="ml-1.5">({pendingCount})</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
        ) : reports.length === 0 ? (
          <div
            className="rounded-xl border p-10 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p className="text-sm" style={{ color: "var(--muted)" }}>No reports found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="rounded-xl border p-5"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    {report.reporter && (
                      <>
                        <Avatar
                          url={report.reporter.avatar_url}
                          name={report.reporter.display_name}
                          size={24}
                        />
                        <Link
                          href={`/${report.reporter.username}`}
                          className="text-sm font-medium hover:underline"
                        >
                          @{report.reporter.username}
                        </Link>
                      </>
                    )}
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(report.created_at)}
                    </span>
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      background: report.reason === "csam_illegal" ? "var(--danger, #dc2626)" :
                        report.reason === "hate_speech" ? "#ea580c" : "var(--accent-light)",
                      color: report.reason === "csam_illegal" ? "white" :
                        report.reason === "hate_speech" ? "white" : "var(--accent)",
                    }}
                  >
                    {REASON_LABELS[report.reason] || report.reason}
                  </span>
                </div>

                {/* Entry preview */}
                {report.entry && (
                  <div
                    className="rounded-lg border p-3 mb-3"
                    style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Link
                          href={`/${report.entry.author?.username}/${report.entry.slug}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {report.entry.title || "Untitled entry"}
                        </Link>
                        {report.entry.author && (
                          <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                            by @{report.entry.author.username}
                          </span>
                        )}
                      </div>
                      {(report.entry.sensitive || report.entry.admin_sensitive) && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                          Sensitive
                        </span>
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
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleAction(report.id, "dismissed")}
                      className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
                      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      Dismiss
                    </button>
                    {report.entry && !(report.entry.sensitive || report.entry.admin_sensitive) && (
                      <button
                        onClick={() => handleAction(report.id, "actioned", report.entry!.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        Mark entry sensitive
                      </button>
                    )}
                    <button
                      onClick={() => handleAction(report.id, "actioned")}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium text-white transition-colors"
                      style={{ background: "var(--danger, #dc2626)" }}
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
    </div>
  );
}
