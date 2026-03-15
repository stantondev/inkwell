"use client";

import { useState } from "react";

interface PinButtonProps {
  entryId: string;
  initialPinned: boolean;
  pinnedCount: number;
  size?: number;
}

export function PinButton({
  entryId,
  initialPinned,
  pinnedCount,
  size = 18,
}: PinButtonProps) {
  const [pinned, setPinned] = useState(initialPinned);
  const [saving, setSaving] = useState(false);

  async function togglePin() {
    if (saving) return;
    setSaving(true);

    try {
      // Fetch current pinned IDs
      const meRes = await fetch("/api/me");
      if (!meRes.ok) return;
      const me = await meRes.json();
      const currentIds: string[] = me.pinned_entry_ids ?? [];

      let newIds: string[];
      if (currentIds.includes(entryId)) {
        // Unpin
        newIds = currentIds.filter((id: string) => id !== entryId);
      } else {
        // Pin — check limit
        if (currentIds.length >= 3) {
          alert("You can pin up to 3 entries. Unpin one first.");
          return;
        }
        newIds = [...currentIds, entryId];
      }

      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned_entry_ids: newIds }),
      });

      if (res.ok) {
        setPinned(!pinned);
      }
    } finally {
      setSaving(false);
    }
  }

  const label = pinned ? "Unpin from profile" : pinnedCount >= 3 ? "Pin limit reached (3)" : "Pin to profile";

  return (
    <button
      onClick={togglePin}
      disabled={saving || (!pinned && pinnedCount >= 3)}
      title={label}
      aria-label={label}
      className="transition-colors"
      style={{
        color: pinned ? "var(--accent)" : "var(--muted)",
        opacity: saving ? 0.5 : 1,
        cursor: saving || (!pinned && pinnedCount >= 3) ? "not-allowed" : "pointer",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={pinned ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 17l0 5" />
        <path d="M5 17h14" />
        <path d="M15 3l-2 5h5l-4 7h-4l-4-7h5l-2-5z" />
      </svg>
    </button>
  );
}
