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
  comments_imported?: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ index: number; title: string; reason: string }>;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

type Format =
  | "auto"
  | "inkwell_json"
  | "generic_csv"
  | "generic_json"
  | "wordpress_wxr"
  | "medium_html"
  | "substack"
  | "livejournal"
  | "livejournal_public";

interface FormatOption {
  value: Format;
  label: string;
  help: string;
  accept: string;
  exportGuide?: string;
  multiFile?: boolean;
  /** Read from the web by username instead of an uploaded file. */
  byUsername?: boolean;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: "auto",
    label: "Auto-detect",
    help: "We'll detect the format from your file automatically — just upload and go.",
    accept: ".zip,.html,.htm,.csv,.json,.xml,.gz",
    multiFile: true,
  },
  {
    value: "livejournal",
    label: "LiveJournal or Dreamwidth (export files)",
    help: "Upload the XML files from Export Journal. There's one per month, and you can select them all at once. ljdump backups work too. Friends-only and private entries stay friends-only and private; moods, music, tags and comments come along.",
    // ljdump's L-/C- files have no extension, so don't filter the picker.
    accept: "",
    exportGuide:
      "LiveJournal: livejournal.com/export.bml → choose XML → download each month. For comments, also save livejournal.com/export_comments.bml?get=comment_meta&startid=0 and ?get=comment_body&startid=0. Dreamwidth: dreamwidth.org/export",
    multiFile: true,
  },
  {
    value: "livejournal_public",
    label: "LiveJournal (can't sign in? public entries)",
    help: "Lost your LiveJournal login? Enter your username and we'll copy the entries anyone can see on your journal. Friends-only and private entries can't be reached this way.",
    accept: "",
    byUsername: true,
  },
  {
    value: "substack",
    label: "Substack",
    help: "Upload the ZIP export from Substack, or individual post HTML files.",
    accept: ".zip,.html,.htm,.csv",
    exportGuide:
      "In Substack: Settings → Exports → Create new export → Download",
    multiFile: true,
  },
  {
    value: "medium_html",
    label: "Medium",
    help: "Upload the ZIP from Medium. Only files in the posts/ folder will be imported.",
    accept: ".zip,.html,.htm",
    exportGuide:
      "In Medium: Settings → Account → Download your information → Download ZIP",
    multiFile: true,
  },
  {
    value: "wordpress_wxr",
    label: "WordPress",
    help: "Upload your WordPress WXR export file. Only posts are imported (pages and attachments are skipped).",
    accept: ".xml,.zip",
    exportGuide:
      "In WordPress: Admin → Tools → Export → All Content → Download Export File",
  },
  {
    value: "inkwell_json",
    label: "Inkwell Export",
    help: "Upload an Inkwell data export file (.json or .json.gz).",
    accept: ".json,.gz",
  },
  {
    value: "generic_csv",
    label: "Generic CSV",
    help: "CSV with columns like: title, body/content, date, tags.",
    accept: ".csv,.txt",
  },
  {
    value: "generic_json",
    label: "Generic JSON",
    help: "JSON array of entries with title, body_html/content, date fields.",
    accept: ".json",
  },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FORMAT_LABELS: Record<string, string> = {
  auto: "Auto-detect",
  inkwell_json: "Inkwell Export",
  wordpress_wxr: "WordPress",
  medium_html: "Medium",
  substack: "Substack",
  substack_csv: "Substack (CSV)",
  generic_csv: "Generic CSV",
  generic_json: "Generic JSON",
  livejournal: "LiveJournal / Dreamwidth",
  livejournal_public: "LiveJournal (public entries)",
};

// A public LiveJournal import has no file; show the journal it came from.
function sourceLabel(fileName: string): string {
  if (fileName.startsWith("livejournal:")) {
    return `Journal: ${fileName.slice("livejournal:".length).replace(/_/g, "-")}.livejournal.com`;
  }
  return fileName === "_multifile.json" ? "Several files" : `File: ${fileName}`;
}

export function DataImport() {
  const [importData, setImportData] = useState<ImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [format, setFormat] = useState<Format>("auto");
  const [importMode, setImportMode] = useState<"draft" | "published">("draft");
  const [privacy, setPrivacy] = useState<"private" | "friends_only" | "public">(
    "private"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [ljUsername, setLjUsername] = useState("");
  const [ljOwnName, setLjOwnName] = useState("");
  const [confirmOwner, setConfirmOwner] = useState(false);

  // /settings/import?from=livejournal (or ?from=livejournal_public) opens
  // with that source chosen; the Switch pages link here.
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from && FORMAT_OPTIONS.some((f) => f.value === from)) setFormat(from as Format);
  }, []);
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
    const byUsername = !!selectedFormat?.byUsername;
    if (byUsername) {
      if (!ljUsername.trim()) {
        setError("Enter your LiveJournal username.");
        return;
      }
      if (!confirmOwner) {
        setError("Please confirm this is your own journal.");
        return;
      }
    } else if (files.length === 0) {
      setError("Please select a file to import.");
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("format", format);
      formData.append("import_mode", importMode);
      formData.append("default_privacy", privacy);

      if (format === "livejournal" && ljOwnName.trim()) {
        formData.append("lj_username", ljOwnName.trim());
      }

      if (byUsername) {
        formData.append("username", ljUsername.trim());
        formData.append("confirm_owner", "true");
      } else if (files.length === 1) {
        // Single file — send directly
        formData.append("file", files[0]);
      } else {
        // Multiple files — pack into a JSON container that the backend unpacks to ZIP
        const fileContents = await Promise.all(
          files.map(async (f) => {
            const text = await f.text();
            return { name: f.name, content: text };
          })
        );
        const containerJson = JSON.stringify({
          _multifile: true,
          files: fileContents,
        });
        const blob = new Blob([containerJson], { type: "application/json" });
        formData.append("file", blob, "_multifile.json");
      }

      const res = await fetch("/api/me/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to start import.");
      } else {
        setImportData(json.data);
        setFiles([]);
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
    setFiles([]);
    setError("");
    setShowErrors(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    if (arr.length === 0) return;

    // Check total size
    const totalSize =
      arr.reduce((sum, f) => sum + f.size, 0) +
      files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 50 * 1024 * 1024) {
      setError("Total file size exceeds 50MB limit.");
      return;
    }

    setError("");

    const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === format);
    if (selectedFormat?.multiFile) {
      // Append to existing files for multi-file formats
      setFiles((prev) => [...prev, ...arr]);
    } else {
      // Replace for single-file formats
      setFiles(arr.slice(0, 1));
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropRef.current?.classList.remove("ring-2");
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
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
          ((importData.imported_count +
            importData.skipped_count +
            importData.error_count) /
            importData.total_entries) *
            100
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
          Bring your writing from another platform. Upload a single export file
          or select multiple HTML files.
        </p>
      </div>

      {error && (
        <div
          className="text-sm rounded-lg px-3 py-2 flex items-start gap-2"
          style={{
            color: "var(--danger, #dc2626)",
            background: "color-mix(in srgb, var(--danger, #dc2626) 8%, var(--surface))",
            border: "1px solid color-mix(in srgb, var(--danger, #dc2626) 20%, transparent)",
          }}
        >
          <span className="flex-shrink-0 mt-0.5">!</span>
          <span>{error}</span>
        </div>
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
                setFiles([]);
                setError("");
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
                className="text-xs mt-1.5"
                style={{ color: "var(--muted)" }}
              >
                {selectedFormat.help}
              </p>
            )}
            {selectedFormat?.exportGuide && (
              <p
                className="text-xs mt-1 italic"
                style={{ color: "var(--muted)" }}
              >
                {selectedFormat.exportGuide}
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

          {/* LiveJournal by username */}
          {selectedFormat?.byUsername && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="lj-username"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: "var(--foreground)" }}
                >
                  LiveJournal username
                </label>
                <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                  <input
                    id="lj-username"
                    type="text"
                    value={ljUsername}
                    onChange={(e) => setLjUsername(e.target.value)}
                    placeholder="yourname"
                    autoComplete="off"
                    spellCheck={false}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent outline-none"
                    style={{ color: "var(--foreground)" }}
                  />
                  <span className="px-3 text-sm" style={{ color: "var(--muted)" }}>.livejournal.com</span>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmOwner}
                  onChange={(e) => setConfirmOwner(e.target.checked)}
                  className="mt-0.5"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ color: "var(--foreground)" }}>
                  This is my own journal. I wrote these entries and I&apos;m allowed to copy them here.
                </span>
              </label>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                We read one page at a time, about one a second, as LiveJournal asks. That&apos;s roughly
                ten to fifteen minutes for a couple of hundred entries. You can leave this page while it runs.
              </p>
            </div>
          )}

          {format === "livejournal" && (
            <div>
              <label
                htmlFor="lj-own-name"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--foreground)" }}
              >
                Your LiveJournal or Dreamwidth username <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="lj-own-name"
                type="text"
                value={ljOwnName}
                onChange={(e) => setLjOwnName(e.target.value)}
                placeholder="yourname"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                So your own replies in the comments show as you. To bring comments, add the two files
                from livejournal.com/export_comments.bml (comment_meta and comment_body) alongside your
                entries, or include ljdump&apos;s C- files.
              </p>
            </div>
          )}

          {/* File Upload */}
          {!selectedFormat?.byUsername && (
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--foreground)" }}
            >
              {files.length > 1
                ? `Files (${files.length} selected)`
                : "File"}
            </label>
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-all"
              style={{
                borderColor: files.length > 0 ? "var(--accent)" : "var(--border)",
                background: files.length > 0
                  ? "color-mix(in srgb, var(--accent) 4%, var(--background))"
                  : "var(--background)",
              }}
            >
              {files.length > 0 ? (
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center justify-center gap-2"
                    >
                      <span
                        className="text-sm font-medium truncate max-w-[200px]"
                        style={{ color: "var(--foreground)" }}
                      >
                        {f.name}
                      </span>
                      <span
                        className="text-xs flex-shrink-0"
                        style={{ color: "var(--muted)" }}
                      >
                        ({formatFileSize(f.size)})
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="ml-1 text-sm flex-shrink-0 hover:opacity-70"
                        style={{ color: "var(--muted)" }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  {selectedFormat?.multiFile && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--muted)" }}
                    >
                      Drop more files or click to add
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    Drop {selectedFormat?.multiFile ? "file(s)" : "a file"} here
                    or click to browse
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {selectedFormat?.accept
                      ? `Accepts: ${selectedFormat.accept
                          .split(",")
                          .map((ext) => ext.trim())
                          .join(", ")}`
                      : "Max 50MB"}
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={selectedFormat?.accept}
                multiple={selectedFormat?.multiFile}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    addFiles(e.target.files);
                  }
                }}
                className="hidden"
              />
            </div>
            {files.length > 0 && (
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Total:{" "}
                  {formatFileSize(
                    files.reduce((sum, f) => sum + f.size, 0)
                  )}
                </p>
                {files.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles([]);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs underline"
                    style={{ color: "var(--muted)" }}
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleStartImport}
            disabled={
              uploading ||
              (selectedFormat?.byUsername ? !ljUsername.trim() || !confirmOwner : files.length === 0)
            }
            className="rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {uploading
              ? "Starting..."
              : selectedFormat?.byUsername
                ? "Copy my journal"
              : files.length > 1
                ? `Import ${files.length} Files`
                : "Start Import"}
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
            <div>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                Importing&hellip;
              </span>
              <span className="text-sm ml-1" style={{ color: "var(--muted)" }}>
                {importData.total_entries > 0
                  ? `${importData.imported_count + importData.skipped_count + importData.error_count} of ${importData.total_entries} entries`
                  : importData.format === "livejournal_public"
                    ? "Reading your journal from LiveJournal… about 10–15 minutes for a couple of hundred entries"
                    : "Parsing file..."}
              </span>
            </div>
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
              <div className="flex justify-between mt-1">
                <p
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {importData.imported_count} imported
                  {importData.skipped_count > 0 &&
                    `, ${importData.skipped_count} skipped`}
                  {importData.error_count > 0 &&
                    `, ${importData.error_count} errors`}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {progressPercent}%
                </p>
              </div>
            </div>
          )}

          {importData.file_name && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {sourceLabel(importData.file_name)}
              {importData.format && (
                <>
                  {" "}
                  &middot; Format:{" "}
                  {FORMAT_LABELS[importData.format] || importData.format}
                </>
              )}
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
            <span className="text-lg">&#10003;</span>
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
            {(importData.comments_imported ?? 0) > 0 && (
              <span style={{ color: "var(--foreground)" }}>
                <strong>{importData.comments_imported}</strong>{" "}
                {importData.comments_imported === 1 ? "comment" : "comments"}
              </span>
            )}
            {importData.skipped_count > 0 && (
              <span style={{ color: "var(--muted)" }}>
                {importData.skipped_count} skipped (duplicates)
              </span>
            )}
            {importData.error_count > 0 && (
              <span style={{ color: "var(--danger, #dc2626)" }}>
                {importData.error_count}{" "}
                {importData.error_count === 1 ? "error" : "errors"}
              </span>
            )}
          </div>

          {importData.imported_count === 0 &&
            importData.error_count === 0 &&
            importData.skipped_count === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No entries were found in the file. Make sure you&apos;re
                uploading a supported export format. Try selecting a specific
                format from the dropdown instead of Auto-detect.
              </p>
            )}

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

          {importData.import_mode === "published" &&
            importData.imported_count > 0 && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Entries were published with their original dates. Visit{" "}
                <a
                  href="/feed"
                  className="underline"
                  style={{ color: "var(--accent)" }}
                >
                  your feed
                </a>{" "}
                to see them.
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
                {importData.errors.length}
                {importData.error_count > importData.errors.length
                  ? ` of ${importData.error_count}`
                  : ""}
                )
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
            className="text-sm font-medium"
            style={{ color: "var(--danger, #dc2626)" }}
          >
            Import failed
          </p>
          {importData.error_message && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {importData.error_message}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Try selecting a specific format instead of Auto-detect, or check
            that your export file is from a supported platform.
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
                {importData.imported_count === 1
                  ? "entry was"
                  : "entries were"}{" "}
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
