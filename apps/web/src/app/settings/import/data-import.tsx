"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ImportStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  format: string;
  import_mode: string;
  default_privacy: string;
  file_name: string | null;
  file_size: number | null;
  total_entries: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ index: number; title: string; reason: string }>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

type Format =
  | "inkwell_json"
  | "generic_csv"
  | "generic_json"
  | "wordpress_wxr"
  | "medium_html"
  | "substack_csv";

const FORMAT_OPTIONS: {
  value: Format;
  label: string;
  help: string;
  accept: string;
}[] = [
  {
    value: "inkwell_json",
    label: "Inkwell Export",
    help: "Upload an Inkwell data export file (.json or .json.gz)",
    accept: ".json,.gz",
  },
  {
    value: "wordpress_wxr",
    label: "WordPress",
    help: "Export from WordPress: Admin \u2192 Tools \u2192 Export \u2192 All Content",
    accept: ".xml",
  },
  {
    value: "medium_html",
    label: "Medium",
    help: "Upload the ZIP from Medium, or an individual .html file from the posts/ folder",
    accept: ".zip,.html,.htm",
  },
  {
    value: "substack_csv",
    label: "Substack",
    help: "Export from Substack: Settings \u2192 Export \u2192 Download all posts",
    accept: ".csv",
  },
  {
    value: "generic_csv",
    label: "Generic CSV",
    help: "CSV with columns: title, body/content, date, tags (optional)",
    accept: ".csv",
  },
  {
    value: "generic_json",
    label: "Generic JSON",
    help: "JSON array of entries with title, body_html/content, date fields",
    accept: ".json",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DataImport() {
  const [importData, setImportData] = useState<ImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [format, setFormat] = useState<Format>("inkwell_json");
  const [importMode, setImportMode] = useState<"draft" | "published">("draft");
  const [privacy, setPrivacy] = useState<"private" | "friends_only" | "public">(
    "private"
  );
  const [file, setFile] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/me/import");
      if (res.ok) {
        const json = await res.json();
        setImportData(json.data);
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
      importData?.status === "pending" ||
      importData?.status === "processing"
    ) {
      const interval = setInterval(fetchStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [importData?.status, fetchStatus]);

  async function handleStartImport() {
    if (!file) {
      setError("Please select a file to import.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", format);
      formData.append("import_mode", importMode);
      formData.append("default_privacy", privacy);

      const res = await fetch("/api/me/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to start import.");
      } else {
        setImportData(json.data);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/me/import/cancel", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        setImportData(json.data);
      }
    } catch {
      // silent
    } finally {
      setCancelling(false);
    }
  }

  function handleReset() {
    setImportData(null);
    setFile(null);
    setError("");
    setShowErrors(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("ring-2");
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.add("ring-2");
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("ring-2");
  }

  const isActive =
    importData?.status === "pending" || importData?.status === "processing";
  const isCompleted = importData?.status === "completed";
  const isFailed = importData?.status === "failed";
  const isCancelled = importData?.status === "cancelled";
  const showForm = !importData || isFailed || isCancelled;

  const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === format);
  const progressPercent =
    importData && importData.total_entries > 0
      ? Math.round(
          (importData.imported_count / importData.total_entries) * 100
        )
      : 0;

  if (loading) {
    return (
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div
          className="h-5 w-32 rounded animate-pulse"
          style={{ background: "var(--border)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-base font-semibold mb-1"
          style={{ color: "var(--foreground)" }}
        >
          Import Data
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Import journal entries from another platform or a previous Inkwell
          export.
        </p>
      </div>

      {error && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          style={{
            color: "var(--danger, #dc2626)",
            background: "var(--surface)",
          }}
        >
          {error}
        </p>
      )}

      {/* Upload Form */}
      {showForm && (
        <div
          className="rounded-xl border p-6 space-y-5"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          {/* Format */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              Source format
            </label>
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as Format);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {selectedFormat && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--muted)" }}
              >
                {selectedFormat.help}
              </p>
            )}
          </div>

          {/* Import Mode */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              Import as
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="import_mode"
                  value="draft"
                  checked={importMode === "draft"}
                  onChange={() => setImportMode("draft")}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: "var(--foreground)" }}>Drafts</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  (review before publishing)
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="import_mode"
                  value="published"
                  checked={importMode === "published"}
                  onChange={() => setImportMode("published")}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: "var(--foreground)" }}>Published</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  (with original dates)
                </span>
              </label>
            </div>
          </div>

          {/* Privacy */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              Default privacy
            </label>
            <select
              value={privacy}
              onChange={(e) =>
                setPrivacy(
                  e.target.value as "private" | "friends_only" | "public"
                )
              }
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            >
              <option value="private">Private (only you)</option>
              <option value="friends_only">Friends only</option>
              <option value="public">Public</option>
            </select>
          </div>

          {/* File Upload */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              File
            </label>
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
              }}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {file.name}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    ({formatFileSize(file.size)})
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current)
                        fileInputRef.current.value = "";
                    }}
                    className="ml-1 text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Drop file here or click to browse
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--muted)" }}
                  >
                    Max 50MB
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={selectedFormat?.accept}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleStartImport}
            disabled={uploading || !file}
            className="rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {uploading ? "Uploading..." : "Start Import"}
          </button>
        </div>
      )}

      {/* Processing State */}
      {isActive && importData && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
              style={{
                borderColor: "var(--accent)",
                borderTopColor: "transparent",
              }}
            />
            <span className="text-sm" style={{ color: "var(--foreground)" }}>
              Importing&hellip;{" "}
              {importData.total_entries > 0
                ? `${importData.imported_count} of ${importData.total_entries} entries`
                : "Parsing file..."}
            </span>
          </div>

          {importData.total_entries > 0 && (
            <div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--border)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    background: "var(--accent)",
                    width: `${progressPercent}%`,
                  }}
                />
              </div>
              <p
                className="text-xs mt-1 text-right"
                style={{ color: "var(--muted)" }}
              >
                {progressPercent}%
              </p>
            </div>
          )}

          {importData.file_name && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              File: {importData.file_name}
            </p>
          )}

          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="rounded-lg px-4 py-1.5 text-sm font-medium border transition-colors disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted)",
              background: "transparent",
            }}
          >
            {cancelling ? "Cancelling..." : "Cancel Import"}
          </button>
        </div>
      )}

      {/* Completed State */}
      {isCompleted && importData && (
        <div
          className="rounded-xl border p-6 space-y-4"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--foreground)" }}
            >
              Import complete
            </span>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <span style={{ color: "var(--foreground)" }}>
              <strong>{importData.imported_count}</strong> imported
            </span>
            {importData.skipped_count > 0 && (
              <span style={{ color: "var(--muted)" }}>
                {importData.skipped_count} skipped
              </span>
            )}
            {importData.error_count > 0 && (
              <span style={{ color: "var(--danger, #dc2626)" }}>
                {importData.error_count}{" "}
                {importData.error_count === 1 ? "error" : "errors"}
              </span>
            )}
          </div>

          {importData.import_mode === "draft" &&
            importData.imported_count > 0 && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Entries were imported as drafts. Visit{" "}
                <a
                  href="/drafts"
                  className="underline"
                  style={{ color: "var(--accent)" }}
                >
                  Drafts
                </a>{" "}
                to review and publish them.
              </p>
            )}

          {/* Error details */}
          {importData.errors.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowErrors(!showErrors)}
                className="text-sm underline"
                style={{ color: "var(--muted)" }}
              >
                {showErrors ? "Hide" : "Show"} error details (
                {importData.errors.length})
              </button>

              {showErrors && (
                <div
                  className="mt-2 rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto text-xs"
                  style={{
                    background: "var(--background)",
                    color: "var(--muted)",
                  }}
                >
                  {importData.errors.map((err, i) => (
                    <div key={i}>
                      <span style={{ color: "var(--danger, #dc2626)" }}>
                        #{err.index}
                      </span>{" "}
                      &ldquo;{err.title}&rdquo;: {err.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Import Another File
          </button>
        </div>
      )}

      {/* Failed State */}
      {isFailed && importData && (
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--danger, #dc2626)" }}
          >
            Import failed
            {importData.error_message && `: ${importData.error_message}`}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Cancelled State */}
      {isCancelled && importData && (
        <div
          className="rounded-xl border p-6 space-y-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Import was cancelled.
            {importData.imported_count > 0 && (
              <>
                {" "}
                {importData.imported_count}{" "}
                {importData.imported_count === 1 ? "entry was" : "entries were"}{" "}
                already imported before cancellation.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Start New Import
          </button>
        </div>
      )}
    </div>
  );
}
