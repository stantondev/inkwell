"use client";

import { useCallback, useEffect, useState } from "react";

interface PenPal {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FriendFilter {
  id: string;
  name: string;
  member_ids: string[];
  created_at: string;
}

// ─── Avatar chip ──────────────────────────────────────────────────────────────

function AvatarChip({
  user,
  onRemove,
}: {
  user: PenPal;
  onRemove?: () => void;
}) {
  const initials = (user.display_name || user.username)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border text-xs"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt=""
          className="w-5 h-5 rounded-full object-cover"
        />
      ) : (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium"
          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
        >
          {initials}
        </span>
      )}
      <span style={{ color: "var(--foreground)" }}>{user.display_name || user.username}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 opacity-40 hover:opacity-80 transition"
          aria-label={`Remove ${user.display_name || user.username}`}
        >
          x
        </button>
      )}
    </span>
  );
}

// ─── Pen Pal picker (multi-select) ───────────────────────────────────────────

function PenPalPicker({
  penPals,
  selectedIds,
  onChange,
}: {
  penPals: PenPal[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = penPals.filter(
    (p) =>
      !selectedIds.includes(p.id) &&
      (p.username.toLowerCase().includes(search.toLowerCase()) ||
        (p.display_name || "").toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedPals = penPals.filter((p) => selectedIds.includes(p.id));

  return (
    <div>
      {selectedPals.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedPals.map((p) => (
            <AvatarChip key={p.id} user={p} onRemove={() => toggle(p.id)} />
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search pen pals to add..."
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
            color: "var(--foreground)",
          }}
        />
        {open && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => { setOpen(false); setSearch(""); }} />
            <div
              className="absolute top-full left-0 right-0 mt-1 z-[50] rounded-xl border shadow-xl max-h-48 overflow-y-auto"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  {penPals.length === 0
                    ? "You don't have any pen pals yet"
                    : "No matching pen pals"}
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      toggle(p.id);
                      setSearch("");
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--accent-light)] transition-colors"
                    style={{ color: "var(--foreground)" }}
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        {(p.display_name || p.username).charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>{p.display_name || p.username}</span>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      @{p.username}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Filter form (create/edit) ───────────────────────────────────────────────

function FilterForm({
  penPals,
  initial,
  onSave,
  onCancel,
  saving,
}: {
  penPals: PenPal[];
  initial?: { name: string; member_ids: string[] };
  onSave: (name: string, memberIds: string[]) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(initial?.member_ids ?? []);

  return (
    <div
      className="rounded-xl border p-4 space-y-4"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div>
        <label className="text-xs font-medium uppercase tracking-wide block mb-1.5" style={{ color: "var(--muted)" }}>
          Filter name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Close Friends, College Crew"
          maxLength={100}
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
          Members
        </label>
        <PenPalPicker penPals={penPals} selectedIds={memberIds} onChange={setMemberIds} />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSave(name.trim(), memberIds)}
          disabled={saving || !name.trim()}
          className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity disabled:opacity-40"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving ? "Saving..." : initial ? "Save changes" : "Create filter"}
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

// ─── Delete confirmation ─────────────────────────────────────────────────────

function DeleteConfirm({
  filterName,
  entryCount,
  onConfirm,
  onCancel,
}: {
  filterName: string;
  entryCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--danger, #e53e3e)", background: "var(--surface)" }}
    >
      <p className="text-sm" style={{ color: "var(--foreground)" }}>
        Delete <strong>{filterName}</strong>?
      </p>
      {entryCount > 0 && (
        <p className="text-xs" style={{ color: "var(--danger, #e53e3e)" }}>
          Warning: {entryCount} {entryCount === 1 ? "entry uses" : "entries use"} this filter.
          Those entries will revert to friends-only visibility.
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="text-sm px-4 py-1.5 rounded-full font-medium"
          style={{ background: "var(--danger, #e53e3e)", color: "#fff" }}
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main manager component ──────────────────────────────────────────────────

export function FiltersManager() {
  const [filters, setFilters] = useState<FriendFilter[]>([]);
  const [penPals, setPenPals] = useState<PenPal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [filtersRes, palsRes] = await Promise.all([
        fetch("/api/filters"),
        fetch("/api/pen-pals"),
      ]);
      const filtersData = await filtersRes.json();
      const palsData = await palsRes.json();
      setFilters(filtersData.data ?? []);
      setPenPals(palsData.data ?? []);
    } catch (err) {
      console.error("Failed to load filters:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (name: string, memberIds: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, member_ids: memberIds }),
      });
      if (!res.ok) throw new Error("Failed to create filter");
      const { data } = await res.json();
      setFilters((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setCreating(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create filter");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string, name: string, memberIds: string[]) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/filters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, member_ids: memberIds }),
      });
      if (!res.ok) throw new Error("Failed to update filter");
      const { data } = await res.json();
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? data : f)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update filter");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/filters/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed to delete filter");
      setFilters((prev) => prev.filter((f) => f.id !== id));
      setDeletingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete filter");
    }
  };

  const palMap = new Map(penPals.map((p) => [p.id, p]));

  if (loading) {
    return (
      <div className="text-sm" style={{ color: "var(--muted)" }}>
        Loading filters...
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
            Friend Filters
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Create named groups of pen pals for custom entry privacy.
          </p>
        </div>
        {!creating && !editingId && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="text-sm px-4 py-1.5 rounded-full font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            New filter
          </button>
        )}
      </div>

      {creating && (
        <FilterForm
          penPals={penPals}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      )}

      {filters.length === 0 && !creating ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
            No filters yet
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Create a filter to share entries with specific groups of pen pals.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filters.map((filter) => (
            <div key={filter.id}>
              {editingId === filter.id ? (
                <FilterForm
                  penPals={penPals}
                  initial={{ name: filter.name, member_ids: filter.member_ids }}
                  onSave={(name, ids) => handleUpdate(filter.id, name, ids)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : deletingId === filter.id ? (
                <DeleteConfirm
                  filterName={filter.name}
                  entryCount={0}
                  onConfirm={() => handleDelete(filter.id)}
                  onCancel={() => setDeletingId(null)}
                />
              ) : (
                <div
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                        {filter.name}
                      </h3>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {filter.member_ids.length}{" "}
                        {filter.member_ids.length === 1 ? "member" : "members"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setEditingId(filter.id); setCreating(false); setDeletingId(null); }}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--accent)]"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeletingId(filter.id); setCreating(false); setEditingId(null); }}
                        className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:border-[var(--danger,#e53e3e)]"
                        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {filter.member_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {filter.member_ids.map((id) => {
                        const pal = palMap.get(id);
                        if (!pal) {
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs"
                              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                            >
                              Unknown user
                            </span>
                          );
                        }
                        return <AvatarChip key={id} user={pal} />;
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
