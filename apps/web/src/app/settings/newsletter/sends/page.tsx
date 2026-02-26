"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Send {
  id: string;
  subject: string;
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  inserted_at: string;
  error_message: string | null;
  entry_id: string | null;
}

export default function SendHistoryPage() {
  const [sends, setSends] = useState<Send[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/newsletter/sends");
      if (res.ok) {
        const data = await res.json();
        setSends(data.data ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCancel = async (id: string) => {
    if (!confirm("Cancel this queued send?")) return;
    setCancelling(id);
    try {
      const res = await fetch(`/api/newsletter/sends/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSends((prev) => prev.map((s) => s.id === id ? { ...s, status: "cancelled" as const } : s));
      }
    } catch {
      // ignore
    } finally {
      setCancelling(null);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      queued: { bg: "var(--accent-light)", fg: "var(--accent)" },
      sending: { bg: "var(--accent-light)", fg: "var(--accent)" },
      sent: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
      failed: { bg: "color-mix(in srgb, var(--danger) 15%, transparent)", fg: "var(--danger)" },
      cancelled: { bg: "var(--background)", fg: "var(--muted)" },
    };
    const c = colors[status] ?? colors.cancelled;
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: c.bg, color: c.fg }}>
        {status === "sending" ? "sending..." : status}
      </span>
    );
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/settings/newsletter" className="text-sm mb-2 inline-block" style={{ color: "var(--accent)" }}>
          ← Newsletter settings
        </Link>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Send History
        </h1>
      </div>

      {/* Send list */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
        ) : sends.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            No sends yet. Publish an entry and send it as a newsletter to see history here.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {sends.map((send) => (
              <div key={send.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium truncate">{send.subject || "Untitled"}</span>
                      {statusBadge(send.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {send.status === "sent" && (
                        <span>
                          {send.sent_count} delivered
                          {send.failed_count > 0 && `, ${send.failed_count} failed`}
                        </span>
                      )}
                      {send.status === "queued" && send.scheduled_at && (
                        <span>Scheduled for {formatDate(send.scheduled_at)}</span>
                      )}
                      {send.status === "queued" && !send.scheduled_at && (
                        <span>{send.recipient_count} recipients</span>
                      )}
                      {send.status === "sending" && (
                        <span>{send.sent_count} of {send.recipient_count} sent</span>
                      )}
                      <span>{formatDate(send.completed_at || send.started_at || send.inserted_at)}</span>
                    </div>
                    {send.error_message && (
                      <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{send.error_message}</p>
                    )}
                  </div>
                  {send.status === "queued" && (
                    <button
                      onClick={() => handleCancel(send.id)}
                      disabled={cancelling === send.id}
                      className="text-xs px-2 py-1 rounded-md transition-colors hover:bg-[var(--background)]"
                      style={{ color: "var(--danger)" }}
                    >
                      {cancelling === send.id ? "..." : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
