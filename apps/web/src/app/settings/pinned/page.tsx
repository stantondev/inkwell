"use client";

import { useState, useEffect, useCallback } from "react";

interface PinnedEntry {
  id: string;
  title: string | null;
  slug: string;
}

export default function PinnedEntriesPage() {
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinnedEntries, setPinnedEntries] = useState<PinnedEntry[]>([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PinnedEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);

  // Load current pinned entries
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = await res.json();
        const ids: string[] = data.pinned_entry_ids ?? [];
        setPinnedIds(ids);

        // Fetch entry titles for pinned IDs
        if (ids.length > 0) {
          const entries = await Promise.all(
            ids.map(async (id) => {
              try {
                const r = await fetch(`/api/entries/${id}`);
                if (!r.ok) return { id, title: null, slug: "" };
                const e = await r.json();
                return { id, title: e.title, slug: e.slug };
              } catch {
                return { id, title: null, slug: "" };
              }
            })
          );
          setPinnedEntries(entries);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const [username, setUsername] = useState<string | null>(null);

  // Load username from session
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/session");
        if (res.ok) {
          const data = await res.json();
          setUsername(data.user?.username ?? null);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const searchEntries = useCallback(async (query: string) => {
    setSearch(query);
    if (query.length < 2 || !username) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `/api/users/${username}/entries?q=${encodeURIComponent(query)}&per_page=10`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(
          (data.data ?? []).map(
            (e: { id: string; title: string | null; slug: string }) => ({
              id: e.id,
              title: e.title || "Untitled",
              slug: e.slug,
            })
          )
        );
      }
    } finally {
      setSearching(false);
    }
  }, [username]);

  function addEntry(entry: PinnedEntry) {
    if (pinnedIds.length >= 3 || pinnedIds.includes(entry.id)) return;
    setPinnedIds((prev) => [...prev, entry.id]);
    setPinnedEntries((prev) => [...prev, entry]);
    setSearch("");
    setSearchResults([]);
  }

  function removeEntry(entryId: string) {
    setPinnedIds((prev) => prev.filter((id) => id !== entryId));
    setPinnedEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  async function handleSave() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned_entry_ids: pinnedIds }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h1
          className="text-xl font-semibold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Pinned Entries
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1
        className="text-xl font-semibold mb-1"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Pinned Entries
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Pin up to 3 entries to the top of your profile. Pinned entries also
        appear as featured posts when someone views your profile from the
        fediverse.
      </p>

      {/* Current pinned entries */}
      <div className="flex flex-col gap-3 mb-6">
        {pinnedEntries.length === 0 && (
          <div
            className="rounded-xl border p-6 text-center"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <p
              className="text-sm italic"
              style={{ color: "var(--muted)" }}
            >
              No pinned entries yet. Search below to pin your first entry.
            </p>
          </div>
        )}

        {pinnedEntries.map((entry, i) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
            }}
          >
            <span
              className="text-xs font-mono w-5 text-center flex-shrink-0"
              style={{ color: "var(--muted)" }}
            >
              {i + 1}
            </span>
            {/* Pin icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              style={{ color: "var(--accent)", flexShrink: 0 }}
            >
              <path d="M16 2l5 5-5.59 5.59 1.3 4.71L12 22l-1.41-1.41L7 17l-5.59 5.59L0 21.17 5.59 15.59 2.88 11.88l4.71 1.3L13 7.59 16 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {entry.title || "Untitled"}
              </p>
              {entry.slug && (
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--muted)" }}
                >
                  /{entry.slug}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeEntry(entry.id)}
              className="text-xs px-3 py-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors flex-shrink-0"
              style={{ color: "var(--muted)" }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Search to add */}
      {pinnedIds.length < 3 && (
        <div className="mb-6">
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--foreground)" }}
          >
            Add an entry
          </label>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => searchEntries(e.target.value)}
              placeholder="Search your entries by title..."
              className="w-full rounded-xl border px-4 py-2.5 text-sm"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
            {searching && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--muted)" }}
              >
                Searching...
              </p>
            )}
            {searchResults.length > 0 && (
              <div
                className="absolute z-10 left-0 right-0 mt-1 rounded-xl border shadow-lg max-h-48 overflow-y-auto"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                }}
              >
                {searchResults
                  .filter((r) => !pinnedIds.includes(r.id))
                  .map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => addEntry(result)}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--surface-hover)] transition-colors truncate"
                    >
                      {result.title}
                    </button>
                  ))}
                {searchResults.filter((r) => !pinnedIds.includes(r.id))
                  .length === 0 && (
                  <p
                    className="px-4 py-2.5 text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    All results already pinned
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {pinnedIds.length >= 3 && (
        <p className="text-xs mb-6" style={{ color: "var(--muted)" }}>
          Maximum 3 pinned entries reached. Remove one to add another.
        </p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
        style={{
          background: "var(--accent)",
          color: "white",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving..." : "Save"}
      </button>

      {status === "saved" && (
        <p className="text-sm mt-2" style={{ color: "var(--accent)" }}>
          Pinned entries updated.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm mt-2" style={{ color: "var(--danger, #dc2626)" }}>
          Failed to save. Please try again.
        </p>
      )}
    </div>
  );
}
