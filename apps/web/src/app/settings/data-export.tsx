"use client";

import { useState, useEffect, useCallback } from "react";

interface ExportStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  file_size: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

export function DataExport() {
  const [exportData, setExportData] = useState<ExportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/me/export");
      if (res.ok) {
        const json = await res.json();
        setExportData(json.data);
      }
    } catch {
      // silent fail on status check
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll while pending/processing
  useEffect(() => {
    if (
      exportData?.status === "pending" ||
      exportData?.status === "processing"
    ) {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [exportData?.status, fetchStatus]);

  async function handleRequestExport() {
    setRequesting(true);
    setError("");
    try {
      const res = await fetch("/api/me/export", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to request export.");
      } else {
        setExportData(json.data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRequesting(false);
    }
  }

  function handleDownload() {
    window.location.href = "/api/me/export/download";
  }

  const isActive =
    exportData?.status === "pending" || exportData?.status === "processing";
  const isCompleted = exportData?.status === "completed";
  const isFailed = exportData?.status === "failed";
  const isExpired =
    isCompleted &&
    exportData?.expires_at &&
    new Date(exportData.expires_at).getTime() < Date.now();

  if (loading) {
    return (
      <div
        className="mt-8 rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="h-5 w-24 rounded animate-pulse" style={{ background: "var(--border)" }} />
      </div>
    );
  }

  return (
    <div
      className="mt-8 rounded-xl border p-6"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h2
        className="text-base font-semibold mb-2"
        style={{ color: "var(--foreground)" }}
      >
        Your Data
      </h2>
      <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
        Download a copy of all your Inkwell data including your profile, journal
        entries, images, comments, stamps, relationships, and more. The export
        is a compressed JSON file.
      </p>

      {error && (
        <p
          className="text-sm mb-3 rounded-lg px-3 py-2"
          style={{
            color: "var(--danger, #dc2626)",
            background: "var(--background)",
          }}
        >
          {error}
        </p>
      )}

      {/* No export or expired — show request button */}
      {(!exportData || isExpired) && (
        <button
          type="button"
          onClick={handleRequestExport}
          disabled={requesting}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            background: "var(--accent)",
            color: "#fff",
          }}
        >
          {requesting ? "Requesting..." : "Request Data Export"}
        </button>
      )}

      {/* Pending / Processing */}
      {isActive && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: "var(--background)" }}
        >
          <div
            className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <span className="text-sm" style={{ color: "var(--foreground)" }}>
            Preparing your export&hellip; This may take a minute.
          </span>
        </div>
      )}

      {/* Completed and not expired — show download */}
      {isCompleted && !isExpired && (
        <div className="flex flex-col gap-3">
          <div
            className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ background: "var(--background)" }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                Export ready
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {exportData.file_size
                  ? formatFileSize(exportData.file_size)
                  : ""}
                {exportData.expires_at && (
                  <> &middot; {formatTimeRemaining(exportData.expires_at)}</>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              Download
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            You&apos;ll also receive an email when your export is ready. The
            download expires in 48 hours.
          </p>
        </div>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
            Export failed
            {exportData.error_message && `: ${exportData.error_message}`}
          </p>
          <button
            type="button"
            onClick={handleRequestExport}
            disabled={requesting}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 self-start"
            style={{
              background: "var(--accent)",
              color: "#fff",
            }}
          >
            {requesting ? "Requesting..." : "Try Again"}
          </button>
        </div>
      )}
    </div>
  );
}
