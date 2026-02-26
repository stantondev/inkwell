"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Subscriber {
  id: string;
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  source: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  inserted_at: string;
}

type StatusFilter = "all" | "confirmed" | "pending" | "unsubscribed";

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/newsletter/subscribers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSubscribers(data.data ?? []);
        setTotalPages(data.meta?.total_pages ?? 1);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this subscriber? They can re-subscribe later.")) return;
    setRemoving(id);
    try {
      const res = await fetch(`/api/newsletter/subscribers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSubscribers((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setRemoving(null);
    }
  };

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "confirmed", label: "Confirmed" },
    { value: "pending", label: "Pending" },
    { value: "unsubscribed", label: "Unsubscribed" },
  ];

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "var(--accent)";
      case "pending": return "var(--muted)";
      case "unsubscribed": return "var(--danger)";
      default: return "var(--muted)";
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/settings/newsletter" className="text-sm mb-2 inline-block" style={{ color: "var(--accent)" }}>
            ← Newsletter settings
          </Link>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Subscribers
          </h1>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--background)" }}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setFilter(tab.value); setPage(1); }}
            className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={{
              background: filter === tab.value ? "var(--surface)" : "transparent",
              color: filter === tab.value ? "var(--foreground)" : "var(--muted)",
              boxShadow: filter === tab.value ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subscriber list */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
        ) : subscribers.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            {filter === "all" ? "No subscribers yet." : `No ${filter} subscribers.`}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {subscribers.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{sub.email}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: `color-mix(in srgb, ${statusColor(sub.status)} 15%, transparent)`,
                        color: statusColor(sub.status),
                      }}>
                      {sub.status}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    <span>Subscribed {formatDate(sub.inserted_at)}</span>
                    {sub.source !== "subscribe_page" && <span>via {sub.source.replace("_", " ")}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(sub.id)}
                  disabled={removing === sub.id}
                  className="text-xs px-2 py-1 rounded-md transition-colors hover:bg-[var(--background)]"
                  style={{ color: "var(--danger)" }}
                >
                  {removing === sub.id ? "..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Previous
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
