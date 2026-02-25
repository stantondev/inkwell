"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface VersionSummary {
  id: string;
  entry_id: string;
  version_number: number;
  title: string | null;
  word_count: number;
  created_at: string;
}

interface VersionFull extends VersionSummary {
  body_html: string;
  body_raw: unknown;
  excerpt: string | null;
  mood: string | null;
  tags: string[];
  category: string | null;
  cover_image_id: string | null;
}

interface EntryData {
  id: string;
  title: string | null;
  body_html: string;
  body_raw: unknown;
  word_count: number;
  excerpt: string | null;
  mood: string | null;
  tags: string[];
  category: string | null;
  cover_image_id: string | null;
  slug: string;
  status: string;
  author: { username: string };
}

interface HistoryClientProps {
  entry: EntryData;
  versions: VersionSummary[];
  totalVersions: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/**
 * Simple paragraph-level diff: splits HTML by block elements, compares paragraphs.
 * Returns arrays of { text, status } where status is "same", "added", "removed".
 */
function diffParagraphs(oldHtml: string, newHtml: string) {
  const splitBlocks = (html: string) =>
    html.split(/<\/(?:p|h[1-6]|li|blockquote|div|pre|hr)>/i)
      .map(s => s.replace(/<(?:p|h[1-6]|li|blockquote|div|pre|hr)[^>]*>/gi, "").trim())
      .filter(Boolean);

  const oldBlocks = splitBlocks(oldHtml || "");
  const newBlocks = splitBlocks(newHtml || "");

  const result: { text: string; status: "same" | "added" | "removed" }[] = [];
  const newSet = new Set(newBlocks);
  const oldSet = new Set(oldBlocks);

  // Walk through new blocks — mark added if not in old
  let oi = 0;
  for (const block of newBlocks) {
    // Check if old has blocks not in new that come before this
    while (oi < oldBlocks.length && !newSet.has(oldBlocks[oi])) {
      result.push({ text: oldBlocks[oi], status: "removed" });
      oi++;
    }
    if (oldSet.has(block)) {
      result.push({ text: block, status: "same" });
      // Advance old pointer past this match
      while (oi < oldBlocks.length && oldBlocks[oi] !== block) oi++;
      oi++;
    } else {
      result.push({ text: block, status: "added" });
    }
  }
  // Remaining old blocks not in new
  while (oi < oldBlocks.length) {
    if (!newSet.has(oldBlocks[oi])) {
      result.push({ text: oldBlocks[oi], status: "removed" });
    }
    oi++;
  }

  return result;
}

export function HistoryClient({ entry, versions, totalVersions }: HistoryClientProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<VersionFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadVersion = useCallback(async (versionId: string) => {
    if (selectedId === versionId) return;
    setSelectedId(versionId);
    setLoading(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}/versions/${versionId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedVersion(data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [entry.id, selectedId]);

  const handleRestore = useCallback(async () => {
    if (!selectedVersion) return;
    if (!confirm(`Restore to version ${selectedVersion.version_number}? Your current content will be saved as a new version first.`)) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/entries/${entry.id}/versions/${selectedVersion.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        router.push(`/${entry.author.username}/${entry.slug}`);
        router.refresh();
      }
    } finally {
      setRestoring(false);
    }
  }, [entry, selectedVersion, router]);

  const diffResult = compareMode && selectedVersion
    ? diffParagraphs(selectedVersion.body_html || "", entry.body_html || "")
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link
            href={`/editor?edit=${entry.id}`}
            className="text-sm transition-colors hover:underline flex items-center gap-1.5"
            style={{ color: "var(--muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back to editor
          </Link>
        </div>
        <h1
          className="text-lg font-semibold"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Version History
        </h1>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {totalVersions} {totalVersions === 1 ? "version" : "versions"}
        </span>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className="mx-auto" style={{ color: "var(--muted)" }}>
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <p className="text-lg font-medium mb-2">No versions yet</p>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Versions are created automatically each time you save a published entry.
          </p>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Version list (sidebar) ── */}
          <div className="lg:w-72 flex-shrink-0">
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              {/* Current version header */}
              <button
                onClick={() => { setSelectedId(null); setSelectedVersion(null); }}
                className="w-full text-left px-4 py-3 border-b transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: selectedId === null ? "var(--accent-light)" : "transparent",
                }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                    Current
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {entry.word_count} words
                  </span>
                </div>
                <p className="text-sm font-medium truncate">
                  {entry.title || "Untitled"}
                </p>
              </button>

              {/* Past versions */}
              <div className="max-h-[60vh] overflow-y-auto">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => loadVersion(v.id)}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-[var(--surface-hover)]"
                    style={{
                      borderColor: "var(--border)",
                      background: selectedId === v.id ? "var(--accent-light)" : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium" style={{ color: selectedId === v.id ? "var(--accent)" : "var(--muted)" }}>
                        v{v.version_number}
                      </span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {v.word_count} words
                      </span>
                    </div>
                    <p className="text-sm truncate mb-0.5">
                      {v.title || "Untitled"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>
                      {timeAgo(v.created_at)}
                      <span className="hidden sm:inline"> · {formatDate(v.created_at)} {formatTime(v.created_at)}</span>
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Content area ── */}
          <div className="flex-1 min-w-0">
            {/* Controls bar */}
            {selectedVersion && (
              <div
                className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    Version {selectedVersion.version_number}
                  </span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {formatDate(selectedVersion.created_at)} at {formatTime(selectedVersion.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCompareMode(!compareMode)}
                    className="text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors"
                    style={{
                      borderColor: compareMode ? "var(--accent)" : "var(--border)",
                      color: compareMode ? "var(--accent)" : "var(--muted)",
                      background: compareMode ? "var(--accent-light)" : "transparent",
                    }}
                  >
                    {compareMode ? "Viewing diff" : "Compare"}
                  </button>
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {restoring ? "Restoring…" : "Restore this version"}
                  </button>
                </div>
              </div>
            )}

            {/* Content display */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-sm" style={{ color: "var(--muted)" }}>Loading version…</div>
              </div>
            ) : selectedVersion ? (
              compareMode && diffResult ? (
                /* ── Compare mode: side by side ── */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--muted)" }}>
                      Version {selectedVersion.version_number}
                    </div>
                    <div
                      className="rounded-xl border p-6"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                    >
                      {selectedVersion.title && (
                        <h2
                          className="text-xl font-bold mb-4"
                          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                        >
                          {selectedVersion.title}
                        </h2>
                      )}
                      <div
                        className="prose-entry"
                        dangerouslySetInnerHTML={{ __html: selectedVersion.body_html || "" }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--muted)" }}>
                      Current
                    </div>
                    <div
                      className="rounded-xl border p-6"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                    >
                      {entry.title && (
                        <h2
                          className="text-xl font-bold mb-4"
                          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                        >
                          {entry.title}
                        </h2>
                      )}
                      <div
                        className="prose-entry"
                        dangerouslySetInnerHTML={{ __html: entry.body_html || "" }}
                      />
                    </div>
                  </div>
                  {/* Inline diff summary */}
                  <div className="md:col-span-2">
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: "var(--muted)" }}>
                      Changes
                    </div>
                    <div
                      className="rounded-xl border p-4 space-y-1"
                      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                    >
                      {diffResult.length === 0 ? (
                        <p className="text-sm" style={{ color: "var(--muted)" }}>No differences found.</p>
                      ) : (
                        diffResult.map((block, i) => (
                          <div
                            key={i}
                            className="text-sm px-3 py-1.5 rounded"
                            style={{
                              background: block.status === "added"
                                ? "rgba(34, 197, 94, 0.1)"
                                : block.status === "removed"
                                  ? "rgba(239, 68, 68, 0.1)"
                                  : "transparent",
                              color: block.status === "added"
                                ? "rgb(22, 163, 74)"
                                : block.status === "removed"
                                  ? "rgb(220, 38, 38)"
                                  : "var(--muted)",
                              textDecoration: block.status === "removed" ? "line-through" : "none",
                            }}
                          >
                            <span className="font-mono text-xs mr-2">
                              {block.status === "added" ? "+" : block.status === "removed" ? "−" : " "}
                            </span>
                            {block.text.replace(/<[^>]+>/g, "").slice(0, 200)}
                            {block.text.replace(/<[^>]+>/g, "").length > 200 ? "…" : ""}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Single version view ── */
                <div
                  className="rounded-xl border p-6 lg:p-10"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  {selectedVersion.title && (
                    <h2
                      className="text-2xl font-bold mb-2"
                      style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                    >
                      {selectedVersion.title}
                    </h2>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-2 mb-6 text-xs" style={{ color: "var(--muted)" }}>
                    <span>{selectedVersion.word_count} words</span>
                    {selectedVersion.mood && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>feeling {selectedVersion.mood}</span>
                      </>
                    )}
                    {selectedVersion.tags && selectedVersion.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{selectedVersion.tags.map(t => `#${t}`).join(" ")}</span>
                      </>
                    )}
                  </div>

                  {/* Body */}
                  <div
                    className="prose-entry"
                    dangerouslySetInnerHTML={{ __html: selectedVersion.body_html || "<p><em>No content</em></p>" }}
                  />
                </div>
              )
            ) : (
              /* ── Current version (default) ── */
              <div
                className="rounded-xl border p-6 lg:p-10"
                style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              >
                {entry.title && (
                  <h2
                    className="text-2xl font-bold mb-2"
                    style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
                  >
                    {entry.title}
                  </h2>
                )}
                <div className="flex items-center gap-2 mb-6 text-xs" style={{ color: "var(--muted)" }}>
                  <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Current version</span>
                  <span aria-hidden="true">·</span>
                  <span>{entry.word_count} words</span>
                </div>
                <div
                  className="prose-entry"
                  dangerouslySetInnerHTML={{ __html: entry.body_html || "<p><em>No content</em></p>" }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
