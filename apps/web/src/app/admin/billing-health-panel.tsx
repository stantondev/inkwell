"use client";

import { useEffect, useState } from "react";

interface WebhookDelivery {
  id: string;
  source: string;
  event_type: string | null;
  status: string;
  signature_valid: boolean | null;
  remote_ip: string | null;
  body_size: number | null;
  error: string | null;
  inserted_at: string;
}

interface WebhookStats {
  last_delivery_at: string | null;
  total_24h: number;
  total_7d: number;
  by_status_24h: Record<string, number>;
  square_subscribers: number;
  square_donors: number;
  legacy_stripe_users: number;
}

interface HealthData {
  stats: WebhookStats;
  recent: WebhookDelivery[];
}

interface ReconcileResult {
  total_checked: number;
  plus_activated: number;
  donor_activated: number;
  plus_canceled: number;
  donor_canceled: number;
  errors: number;
  error_details: Array<{ user_id: string; username: string; reason: string }>;
}

function parseUtc(iso: string): number {
  // Phoenix's NaiveDateTime serializes without a timezone suffix. Force UTC
  // by appending 'Z' if the string has no offset info, otherwise JS parses
  // it as local time and produces negative diffs.
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : iso + "Z").getTime();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - parseUtc(iso);
  const secs = Math.max(0, Math.floor(diff / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "received":
    case "processed":
      return { bg: "var(--success, #16a34a)", fg: "white" };
    case "signature_failed":
      return { bg: "var(--danger, #dc2626)", fg: "white" };
    case "parse_failed":
    case "handler_failed":
    case "missing_body":
      return { bg: "#f59e0b", fg: "white" };
    default:
      return { bg: "var(--muted)", fg: "white" };
  }
}

export function BillingHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  async function fetchHealth() {
    try {
      const res = await fetch("/api/admin/billing-health", { cache: "no-store" });
      if (!res.ok) {
        setError(`Failed to load billing health (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError("Network error loading billing health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  async function handleReconcile() {
    if (!confirm("Reconcile all users with Square? This checks each active user's subscription status against Square and updates the local database. Safe to run anytime.")) {
      return;
    }
    setReconciling(true);
    setReconcileResult(null);
    setReconcileError(null);
    try {
      const res = await fetch("/api/admin/reconcile-subscriptions", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.result) {
        setReconcileResult(json.result);
        // Refresh health stats after reconciliation
        fetchHealth();
      } else {
        setReconcileError(json.error || "Reconciliation failed");
      }
    } catch {
      setReconcileError("Network error during reconciliation");
    } finally {
      setReconciling(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-card">
        <h2 className="admin-card-header">Billing Health (Square)</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-card">
        <h2 className="admin-card-header">Billing Health (Square)</h2>
        <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>{error || "No data"}</p>
      </div>
    );
  }

  const { stats, recent } = data;
  const lastDeliveryAgo = timeAgo(stats.last_delivery_at);

  // Warning state: zero webhooks in 24h but we have active subscribers
  const hasActiveSubs = stats.square_subscribers > 0 || stats.square_donors > 0;
  const silentDeath = hasActiveSubs && stats.total_24h === 0;

  return (
    <div className="admin-card" style={{ marginBottom: "1rem" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="admin-card-header" style={{ marginBottom: 0 }}>Billing Health (Square)</h2>
        <button
          onClick={fetchHealth}
          className="text-xs underline opacity-70 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
          title="Refresh"
        >
          refresh
        </button>
      </div>

      {silentDeath && (
        <div
          className="rounded-lg p-3 mb-3 text-xs"
          style={{
            background: "color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--danger, #dc2626) 30%, transparent)",
          }}
        >
          <strong>⚠ No webhooks in 24h but there are active subscribers.</strong>
          {" "}Square webhooks may be broken. Check the webhook subscription in Square dashboard, or run reconciliation below.
        </div>
      )}

      {/* Top-level metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <HealthStat label="Last webhook" value={lastDeliveryAgo} />
        <HealthStat label="Events (24h)" value={stats.total_24h.toString()} />
        <HealthStat label="Events (7d)" value={stats.total_7d.toString()} />
        <HealthStat label="Square subs" value={stats.square_subscribers.toString()} />
        <HealthStat label="Square donors" value={stats.square_donors.toString()} />
        <HealthStat label="Legacy Stripe" value={stats.legacy_stripe_users.toString()} muted />
      </div>

      {/* By status breakdown */}
      {Object.keys(stats.by_status_24h).length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
            Status (24h)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.by_status_24h).map(([status, count]) => {
              const color = statusColor(status);
              return (
                <span
                  key={status}
                  className="px-2 py-0.5 rounded text-[11px] font-medium"
                  style={{ background: color.bg, color: color.fg }}
                >
                  {status}: {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Reconciliation section */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium mb-1">Reconcile all users</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Actively pull subscription status from Square for every user. Safe fallback when webhooks fail. Idempotent.
            </div>
          </div>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              background: "var(--accent)",
              color: "white",
              opacity: reconciling ? 0.6 : 1,
            }}
          >
            {reconciling ? "Reconciling…" : "Reconcile now"}
          </button>
        </div>

        {reconcileResult && (
          <div className="mt-3 text-xs" style={{ color: "var(--foreground)" }}>
            <div className="font-medium mb-1">
              Checked {reconcileResult.total_checked} users
              {reconcileResult.errors > 0 && (
                <span style={{ color: "var(--danger, #dc2626)" }}> · {reconcileResult.errors} errors</span>
              )}
            </div>
            <div style={{ color: "var(--muted)" }}>
              Plus activated: {reconcileResult.plus_activated} · Donor activated: {reconcileResult.donor_activated}
              {(reconcileResult.plus_canceled > 0 || reconcileResult.donor_canceled > 0) && (
                <>
                  {" · "}Plus canceled: {reconcileResult.plus_canceled} · Donor canceled: {reconcileResult.donor_canceled}
                </>
              )}
            </div>
            {reconcileResult.error_details.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>
                  Error details
                </summary>
                <ul className="mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
                  {reconcileResult.error_details.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      @{e.username}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {reconcileError && (
          <div className="mt-2 text-xs" style={{ color: "var(--danger, #dc2626)" }}>
            {reconcileError}
          </div>
        )}
      </div>

      {/* Recent deliveries */}
      <div>
        <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
          Recent deliveries
        </div>
        {recent.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No webhook deliveries logged yet.
          </p>
        ) : (
          <div className="space-y-1">
            {recent.map((d) => {
              const color = statusColor(d.status);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded"
                  style={{ background: "var(--surface-hover, transparent)" }}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                    style={{ background: color.bg, color: color.fg }}
                  >
                    {d.status}
                  </span>
                  <span className="flex-1 truncate font-mono" style={{ color: "var(--foreground)" }}>
                    {d.event_type || "—"}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--muted)" }}>
                    {d.remote_ip || "?"}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--muted)" }}>
                    {timeAgo(d.inserted_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div
        className="text-lg font-semibold"
        style={{ color: muted ? "var(--muted)" : "var(--foreground)", fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}
