"use client";

import { useState } from "react";

export function ReindexButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReindex() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reindex-search", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage("Reindex enqueued successfully");
      } else {
        setMessage(data.error || "Failed to enqueue reindex");
      }
    } catch {
      setMessage("Failed to enqueue reindex");
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleReindex}
        disabled={loading}
        className="admin-btn admin-btn--outline admin-btn--sm"
      >
        {loading ? "Enqueuing..." : "Reindex Search"}
      </button>
      {message && (
        <span className="text-xs" style={{ color: "var(--muted)" }}>{message}</span>
      )}
    </div>
  );
}
