"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar } from "@/components/avatar";

interface TipSender {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface TipRecipient {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Tip {
  id: string;
  amount_cents: number;
  total_cents: number;
  anonymous: boolean;
  message: string | null;
  status: string;
  inserted_at: string;
  sender?: TipSender | null;
  recipient?: TipRecipient | null;
}

interface TipStats {
  all_time_total_cents: number;
  all_time_count: number;
  month_total_cents: number;
  month_count: number;
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TipHistoryPage() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [received, setReceived] = useState<Tip[]>([]);
  const [sent, setSent] = useState<Tip[]>([]);
  const [stats, setStats] = useState<TipStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, sentRes, statsRes] = await Promise.all([
        fetch("/api/tips/received"),
        fetch("/api/tips"),
        fetch("/api/tips/stats"),
      ]);

      if (recRes.ok) {
        const data = await recRes.json();
        setReceived(data.data || []);
      }
      if (sentRes.ok) {
        const data = await sentRes.json();
        setSent(data.data || []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-sm" style={{ color: "var(--muted)" }}>
          Loading postage history...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <a
        href="/settings/support"
        className="inline-flex items-center gap-1 text-sm transition-colors hover:underline"
        style={{ color: "var(--muted)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Back to Postage Settings
      </a>

      {/* Stats overview */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="All-time received" value={formatDollars(stats.all_time_total_cents)} />
          <StatCard label="Total postage" value={String(stats.all_time_count)} />
          <StatCard label="This month" value={formatDollars(stats.month_total_cents)} />
          <StatCard label="Postage this month" value={String(stats.month_count)} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => setTab("received")}
          className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
          style={{
            borderColor: tab === "received" ? "var(--accent)" : "transparent",
            color: tab === "received" ? "var(--accent)" : "var(--muted)",
          }}
        >
          Received ({received.length})
        </button>
        <button
          onClick={() => setTab("sent")}
          className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
          style={{
            borderColor: tab === "sent" ? "var(--accent)" : "transparent",
            color: tab === "sent" ? "var(--accent)" : "var(--muted)",
          }}
        >
          Sent ({sent.length})
        </button>
      </div>

      {/* Tip list */}
      {tab === "received" ? (
        received.length === 0 ? (
          <EmptyState message="No postage received yet. When readers send you postage, it will appear here." />
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {received.map((tip, i) => (
              <ReceivedTipRow key={tip.id} tip={tip} showBorder={i < received.length - 1} />
            ))}
          </div>
        )
      ) : (
        sent.length === 0 ? (
          <EmptyState message="You haven't sent any postage yet. Support a writer you love!" />
        ) : (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {sent.map((tip, i) => (
              <SentTipRow key={tip.id} tip={tip} showBorder={i < sent.length - 1} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border p-12 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        className="mx-auto mb-3" style={{ color: "var(--muted)", opacity: 0.4 }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
      <p className="text-sm" style={{ color: "var(--muted)" }}>{message}</p>
    </div>
  );
}

function ReceivedTipRow({ tip, showBorder }: { tip: Tip; showBorder: boolean }) {
  const senderName = tip.anonymous ? "Anonymous" : (tip.sender?.display_name || "Someone");
  const senderUsername = tip.anonymous ? null : tip.sender?.username;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 ${showBorder ? "border-b" : ""}`}
      style={{ borderColor: "var(--border)" }}
    >
      {/* Avatar */}
      {tip.anonymous || !tip.sender ? (
        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: "var(--surface-hover)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted)" }}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      ) : (
        <a href={`/${senderUsername}`} className="flex-shrink-0">
          <Avatar url={tip.sender.avatar_url} name={senderName} size={36} />
        </a>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {senderUsername ? (
              <a href={`/${senderUsername}`} className="hover:underline">{senderName}</a>
            ) : senderName}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {formatDollars(tip.amount_cents)}
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {timeAgo(tip.inserted_at)}
          </span>
        </div>
        {tip.message && (
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            &ldquo;{tip.message}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

function SentTipRow({ tip, showBorder }: { tip: Tip; showBorder: boolean }) {
  const recipientName = tip.recipient?.display_name || "Someone";
  const recipientUsername = tip.recipient?.username;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 ${showBorder ? "border-b" : ""}`}
      style={{ borderColor: "var(--border)" }}
    >
      {/* Avatar */}
      {tip.recipient ? (
        <a href={`/${recipientUsername}`} className="flex-shrink-0">
          <Avatar url={tip.recipient.avatar_url} name={recipientName} size={36} />
        </a>
      ) : (
        <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ background: "var(--surface-hover)" }} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm" style={{ color: "var(--muted)" }}>To</span>
          <span className="text-sm font-medium">
            {recipientUsername ? (
              <a href={`/${recipientUsername}`} className="hover:underline">{recipientName}</a>
            ) : recipientName}
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
            {formatDollars(tip.amount_cents)}
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {timeAgo(tip.inserted_at)}
          </span>
        </div>
        {tip.message && (
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            &ldquo;{tip.message}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
