"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface SeriesItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_id: string | null;
  status: "ongoing" | "completed";
  entry_count: number;
  created_at: string;
  updated_at: string;
}

interface SeriesMeta {
  count: number;
  limit: number | null;
}

// ─── Series form (create/edit) ────────────────────────────────────────────────

function SeriesForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: { title: string; description: string; status: "ongoing" | "completed" };
  onSave: (title: string, description: string, status: "ongoing" | "completed") => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<"ongoing" | "completed">(initial?.status ?? "ongoing");

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div>
        <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: "var(--muted)" }}>
          Series title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. My Italy Trip, Weekly Reflections"
          maxLength={200}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: "var(--muted)" }}>
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this series about?"
          maxLength={2000}
          rows={3}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        />
      </div>

      <div>
        <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: "var(--muted)" }}>
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "ongoing" | "completed")}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{
            borderColor: "var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        >
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(title.trim(), description.trim(), status)}
          disabled={saving || !title.trim()}
          className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving..." : initial ? "Save changes" : "Create series"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:border-[var(--border-strong)]"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Entry reorder within a series ────────────────────────────────────────────

function SeriesEntryList({
  seriesId,
  onClose,
}: {
  seriesId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<{ id: string; title: string | null; series_order: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/series/${seriesId}`)
      .then((r) => r.json())
      .then((d) => {
        // list_own returns series without entries, we need to fetch entries separately
        // Use the public endpoint via the series detail
        // Actually we just need the entries — let's get from the own endpoint
        // We'll load via PATCH to get current entries
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Fetch series entries via a workaround: fetch all user entries and filter
    // Better approach: the list_own response already includes entries.
    // Let's just reload the series list and find entries
  }, [seriesId]);

  // Simpler approach: fetch all entries from the series
  useEffect(() => {
    setLoading(true);
    // We need to get the series owner's username to call the public endpoint
    // For now, use the management endpoint which has entries
    fetch("/api/series")
      .then((r) => r.json())
      .then(async (d) => {
        const series = (d.data as SeriesItem[]).find((s: SeriesItem) => s.id === seriesId);
        if (!series) return;
        // Need a different approach — let's fetch via drafts and entries
        // Actually the simplest: GET the series detail via the public route
        // We need the username for that. For now, use session info.
        const meRes = await fetch("/api/auth/me");
        const me = await meRes.json();
        const username = me.data?.username;
        if (!username) return;

        const seriesRes = await fetch(`/api/users/${username}/series/${series.slug}`);
        const seriesData = await seriesRes.json();
        const seriesEntries = (seriesData.data?.entries || []).map((e: { id: string; title: string | null; series_order: number }) => ({
          id: e.id,
          title: e.title,
          series_order: e.series_order,
        }));
        setEntries(seriesEntries);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [seriesId]);

  const moveEntry = (index: number, direction: -1 | 1) => {
    const newEntries = [...entries];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newEntries.length) return;
    [newEntries[index], newEntries[targetIndex]] = [newEntries[targetIndex], newEntries[index]];
    setEntries(newEntries);
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: entries.map((e) => e.id) }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reorder entries");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--muted)" }}>
        Loading entries...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No entries in this series yet. Add entries from the editor.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-sm mt-3 px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h4 className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Entry order (drag to reorder)
      </h4>
      <div className="space-y-1">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          >
            <span className="text-xs font-medium w-6 text-center" style={{ color: "var(--muted)" }}>
              {index + 1}
            </span>
            <span className="flex-1 truncate">{entry.title || "Untitled"}</span>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={() => moveEntry(index, -1)}
                disabled={index === 0}
                className="text-xs px-1.5 py-0.5 rounded border disabled:opacity-20 hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveEntry(index, 1)}
                disabled={index === entries.length - 1}
                className="text-xs px-1.5 py-0.5 rounded border disabled:opacity-20 hover:border-[var(--accent)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                aria-label="Move down"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSaveOrder}
          disabled={saving}
          className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving..." : "Save order"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main manager ─────────────────────────────────────────────────────────────

export function SeriesManager({ isPlus }: { isPlus: boolean }) {
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [meta, setMeta] = useState<SeriesMeta>({ count: 0, limit: 5 });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/series");
      const data = await res.json();
      setSeriesList(data.data ?? []);
      setMeta(data.meta ?? { count: 0, limit: isPlus ? null : 5 });
    } catch (err) {
      console.error("Failed to load series:", err);
    } finally {
      setLoading(false);
    }
  }, [isPlus]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (title: string, description: string, status: "ongoing" | "completed") => {
    setSaving(true);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if ((body as { error?: string }).error === "series_limit_reached") {
          throw new Error("You've reached the 5 series limit on the free plan. Upgrade to Inkwell Plus for unlimited series.");
        }
        throw new Error("Failed to create series");
      }
      await load();
      setCreating(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create series");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, title: string, description: string, status: "ongoing" | "completed") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || null, status }),
      });
      if (!res.ok) throw new Error("Failed to update series");
      await load();
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update series");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete series");
      setSeriesList((prev) => prev.filter((s) => s.id !== id));
      setDeletingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete series");
    }
  };

  if (loading) {
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        Loading series...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Series
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Group related entries into ordered collections.
            {meta.limit && (
              <span> {meta.count} of {meta.limit} used.</span>
            )}
          </p>
        </div>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-sm px-4 py-1.5 rounded-full font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            New series
          </button>
        )}
      </div>

      {creating && (
        <SeriesForm
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      )}

      {seriesList.length === 0 && !creating ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
            No series yet
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Create a series to group related journal entries together, like a travel diary or story chapters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {seriesList.map((series) => (
            <div key={series.id}>
              {editingId === series.id ? (
                <SeriesForm
                  initial={{
                    title: series.title,
                    description: series.description || "",
                    status: series.status,
                  }}
                  onSave={(title, desc, status) => handleUpdate(series.id, title, desc, status)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : reorderingId === series.id ? (
                <SeriesEntryList
                  seriesId={series.id}
                  onClose={() => { setReorderingId(null); load(); }}
                />
              ) : deletingId === series.id ? (
                <div
                  className="rounded-xl border p-4 space-y-3"
                  style={{ borderColor: "var(--danger, #e53e3e)", background: "var(--surface)" }}
                >
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>
                    Delete <strong>{series.title}</strong>?
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    The series will be deleted, but its {series.entry_count} {series.entry_count === 1 ? "entry" : "entries"} will remain as standalone posts.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(series.id)}
                      className="text-sm px-4 py-1.5 rounded-full font-medium"
                      style={{ background: "var(--danger, #e53e3e)", color: "#fff" }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(null)}
                      className="text-sm px-3 py-1.5 rounded-lg border"
                      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                        {series.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {series.entry_count} {series.entry_count === 1 ? "entry" : "entries"}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background: series.status === "completed" ? "var(--accent-light)" : "var(--surface-hover, var(--border))",
                            color: series.status === "completed" ? "var(--accent)" : "var(--muted)",
                          }}
                        >
                          {series.status === "completed" ? "Completed" : "Ongoing"}
                        </span>
                      </div>
                      {series.description && (
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--muted)" }}>
                          {series.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {series.entry_count > 1 && (
                        <button
                          type="button"
                          onClick={() => { setReorderingId(series.id); setCreating(false); setEditingId(null); setDeletingId(null); }}
                          className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent)]"
                          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                        >
                          Reorder
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditingId(series.id); setCreating(false); setReorderingId(null); setDeletingId(null); }}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent)]"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeletingId(series.id); setCreating(false); setEditingId(null); setReorderingId(null); }}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--danger,#e53e3e)]"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isPlus && meta.limit && (
        <div className="text-center pt-2">
          <Link
            href="/settings/billing"
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Upgrade to Plus for unlimited series
          </Link>
        </div>
      )}
    </div>
  );
}
