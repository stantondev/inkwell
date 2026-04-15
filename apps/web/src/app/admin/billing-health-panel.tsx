"use client";

import { useEffect, useState } from "react";
import {
  HealthStat,
  timeAgo,
  type HealthData,
} from "./billing-shared";
import { AdvancedBillingTools } from "./billing-advanced-tools";

// BillingHealthPanel — the day-to-day admin surface for Square billing.
//
// Shows the four things an admin actually uses on a normal day:
//   1. Webhook health metrics (last webhook, Square subs, legacy Stripe)
//   2. Sync user by email (when a user paid but didn't show up)
//   3. Reconcile (batch sync against Square)
//   4. Grant Plus until date (comp accounts, migration recovery)
//
// The debugging surface (ghost Plus detection, raw Square data/payments,
// manually attach subscription, grace expiration worker, recent deliveries)
// is hidden behind a "Show advanced tools" toggle and lives in a separate
// component (AdvancedBillingTools) imported from ./billing-advanced-tools.
//
// The split was made after the 2026-04-15 Stripe-to-Square migration
// cleanup: the main file grew to 1700+ lines holding 11 sections for a
// one-time fix. Splitting lets the common path stay small (~400 lines)
// and keeps the debugging/recovery tools available without cluttering
// the default view.

const EXPECTED_WEBHOOK_URL = "https://api.inkwell.social/api/billing/webhook";

interface ReconcileResult {
  total_checked: number;
  plus_activated: number;
  donor_activated: number;
  plus_canceled: number;
  donor_canceled: number;
  not_found: number;
  rate_limited: number;
  errors: number;
  error_details: Array<{ user_id: string; username: string; reason: string }>;
}

interface SyncUserResult {
  ok: boolean;
  user?: {
    id: string;
    username: string;
    email: string;
    subscription_tier: string;
    subscription_status: string | null;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
    ink_donor_status: string | null;
    ink_donor_amount_cents: number | null;
  };
  changes?: string[];
  error?: string;
  detail?: string;
}

interface GrantPlusResult {
  ok: boolean;
  user?: {
    username: string;
    email: string;
    subscription_tier: string;
    subscription_status: string | null;
    subscription_expires_at: string | null;
  };
  error?: string;
  detail?: string;
}

export function BillingHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reconcile state
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Sync-by-email state
  const [syncEmail, setSyncEmail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncUserResult | null>(null);

  // Grant Plus until date state
  const [grantEmail, setGrantEmail] = useState("");
  const [grantDate, setGrantDate] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<GrantPlusResult | null>(null);

  // Advanced tools toggle — default hidden
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    if (
      !confirm(
        "Reconcile all users with billing history against Square? Filtered to ~10-30 users with existing Plus/Donor/Stripe state. Safe to run anytime."
      )
    ) {
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

  async function handleSyncByEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = syncEmail.trim();
    if (!email) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync-user-by-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      });
      const json: SyncUserResult = await res.json();
      setSyncResult(json);
      if (json.ok) {
        fetchHealth();
      }
    } catch {
      setSyncResult({ ok: false, error: "Network error during sync" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleGrantPlus(e: React.FormEvent) {
    e.preventDefault();
    const email = grantEmail.trim();
    const date = grantDate.trim();
    if (!email || !date) return;

    const isoDate = date.includes("T") ? date : `${date}T23:59:59Z`;

    if (
      !confirm(
        `Manually grant ${email} Plus tier until ${date}?\n\nThis sets subscription_tier="plus", subscription_status="canceled" (cancel-at-period-end semantic), and subscription_expires_at to the chosen date. The grace expiration worker will auto-downgrade them on that date if they haven't re-subscribed.`
      )
    ) {
      return;
    }
    setGranting(true);
    setGrantResult(null);
    try {
      const res = await fetch("/api/admin/grant-plus-until", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, expires_at: isoDate }),
        cache: "no-store",
      });
      const json: GrantPlusResult = await res.json();
      setGrantResult(json);
      if (json.ok) {
        setGrantEmail("");
        setGrantDate("");
        fetchHealth();
      }
    } catch {
      setGrantResult({ ok: false, error: "Network error during grant" });
    } finally {
      setGranting(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-card">
        <h2 className="admin-card-header">Billing Health (Square)</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-card">
        <h2 className="admin-card-header">Billing Health (Square)</h2>
        <p className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
          {error || "No data"}
        </p>
      </div>
    );
  }

  const { stats, recent } = data;
  const lastDeliveryAgo = timeAgo(stats.last_delivery_at);
  const hasActiveSubs = stats.square_subscribers > 0 || stats.square_donors > 0;
  const silentDeath = hasActiveSubs && stats.total_24h === 0;
  const webhookNeverReceived = stats.last_delivery_at === null;

  return (
    <div className="admin-card" style={{ marginBottom: "1rem" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="admin-card-header" style={{ marginBottom: 0 }}>
          Billing Health (Square)
        </h2>
        <button
          onClick={fetchHealth}
          className="text-xs underline opacity-70 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
          title="Refresh"
        >
          refresh
        </button>
      </div>

      {/* Silent death warning — webhook hasn't fired in 24h but we have paying subs */}
      {silentDeath && (
        <div
          className="rounded-lg p-3 mb-3 text-xs"
          style={{
            background: "color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--danger, #dc2626) 30%, transparent)",
          }}
        >
          <strong>⚠ No webhooks in 24h but there are active subscribers.</strong>{" "}
          Square webhooks may be broken. Check the webhook subscription in the Square dashboard,
          or run reconciliation below.
        </div>
      )}

      {/* Webhook URL diagnostic — always show, emphasize when never received */}
      <div
        className="rounded-lg p-3 mb-3 text-xs"
        style={{
          background: webhookNeverReceived
            ? "color-mix(in srgb, #f59e0b 12%, transparent)"
            : "color-mix(in srgb, var(--accent) 5%, transparent)",
          border: webhookNeverReceived
            ? "1px solid color-mix(in srgb, #f59e0b 35%, transparent)"
            : "1px solid var(--border)",
        }}
      >
        <div className="font-medium mb-1">
          {webhookNeverReceived ? "⚠ " : ""}Square webhook must be configured to:
        </div>
        <code
          className="block px-2 py-1 rounded font-mono text-[11px] mb-1.5"
          style={{ background: "var(--surface-hover, rgba(0,0,0,0.05))", color: "var(--foreground)" }}
        >
          {EXPECTED_WEBHOOK_URL}
        </code>
        <div style={{ color: "var(--muted)" }}>
          {webhookNeverReceived
            ? "Last webhook shows never — this is the most likely cause. Verify the URL and signature key match in your Square dashboard webhook subscription."
            : "Verify the URL matches in your Square dashboard webhook subscription."}
        </div>
      </div>

      {/* Top-level webhook + Square sub metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <HealthStat label="Last webhook" value={lastDeliveryAgo} />
        <HealthStat label="Events (24h)" value={stats.total_24h.toString()} />
        <HealthStat label="Events (7d)" value={stats.total_7d.toString()} />
        <HealthStat label="Square subs" value={stats.square_subscribers.toString()} />
        <HealthStat label="Square donors" value={stats.square_donors.toString()} />
        <HealthStat label="Legacy Stripe" value={stats.legacy_stripe_users.toString()} muted />
      </div>

      {/* Sync user by email */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{
          background: "color-mix(in srgb, var(--accent) 5%, transparent)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="text-sm font-medium mb-1">Sync user by email</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Pull a user&apos;s current Square subscription state. Use when you know someone paid via
          Square but their Plus status hasn&apos;t synced. 2 API calls per use, no rate limit risk.
        </div>
        <form onSubmit={handleSyncByEmail} className="flex items-center gap-2">
          <input
            type="email"
            value={syncEmail}
            onChange={(e) => setSyncEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={syncing}
            required
            className="flex-1 px-2 py-1.5 rounded text-xs"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />
          <button
            type="submit"
            disabled={syncing || !syncEmail.trim()}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              background: "var(--accent)",
              color: "white",
              opacity: syncing || !syncEmail.trim() ? 0.5 : 1,
            }}
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </form>

        {syncResult && (
          <div className="mt-2 text-xs">
            {syncResult.ok && syncResult.user ? (
              <div>
                <div style={{ color: "var(--success, #16a34a)" }} className="font-medium">
                  ✓ Synced @{syncResult.user.username}
                </div>
                <div style={{ color: "var(--muted)" }} className="mt-0.5">
                  tier: {syncResult.user.subscription_tier}
                  {syncResult.user.subscription_status &&
                    ` · status: ${syncResult.user.subscription_status}`}
                  {syncResult.changes && syncResult.changes.length > 0
                    ? ` · changes: ${syncResult.changes.join(", ")}`
                    : " · no changes (already in sync, or no Square record)"}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--danger, #dc2626)" }}>
                {syncResult.error || "Sync failed"}
                {syncResult.detail && (
                  <span style={{ color: "var(--muted)" }}> — {syncResult.detail}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reconciliation */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{
          background: "color-mix(in srgb, var(--accent) 5%, transparent)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium mb-1">Reconcile users with billing history</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Pulls Square state for users with existing Plus/Donor/Stripe state. 300ms delay
              between users + automatic 429 retry. Idempotent.
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
            <div className="font-medium mb-1">Checked {reconcileResult.total_checked} users</div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--muted)" }}>
              {reconcileResult.plus_activated > 0 && (
                <span style={{ color: "var(--success, #16a34a)" }}>
                  Plus activated: {reconcileResult.plus_activated}
                </span>
              )}
              {reconcileResult.donor_activated > 0 && (
                <span style={{ color: "var(--success, #16a34a)" }}>
                  Donor activated: {reconcileResult.donor_activated}
                </span>
              )}
              {reconcileResult.plus_canceled > 0 && (
                <span>Plus canceled: {reconcileResult.plus_canceled}</span>
              )}
              {reconcileResult.donor_canceled > 0 && (
                <span>Donor canceled: {reconcileResult.donor_canceled}</span>
              )}
              <span>Not found: {reconcileResult.not_found}</span>
              {reconcileResult.rate_limited > 0 && (
                <span style={{ color: "#f59e0b" }}>
                  Rate limited: {reconcileResult.rate_limited}
                </span>
              )}
              {reconcileResult.errors > 0 && (
                <span style={{ color: "var(--danger, #dc2626)" }}>
                  Errors: {reconcileResult.errors}
                </span>
              )}
            </div>
            {reconcileResult.error_details.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>
                  Error details ({reconcileResult.error_details.length})
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

      {/* Grant Plus until date */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{
          background: "color-mix(in srgb, var(--accent) 5%, transparent)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="text-sm font-medium mb-1">Grant Plus until date</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Manually grant a user Plus tier with an explicit expiration date. Useful for comp
          accounts, gifts, or manually extending Plus for a specific user. Sets{" "}
          <code>status=canceled</code> + <code>subscription_expires_at</code>. The grace
          expiration worker will auto-downgrade them on that date.
        </div>
        <form onSubmit={handleGrantPlus} className="space-y-2">
          <input
            type="email"
            value={grantEmail}
            onChange={(e) => setGrantEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={granting}
            required
            className="w-full px-2 py-1.5 rounded text-xs"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={grantDate}
              onChange={(e) => setGrantDate(e.target.value)}
              disabled={granting}
              required
              className="flex-1 px-2 py-1.5 rounded text-xs"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={granting || !grantEmail.trim() || !grantDate.trim()}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={{
                background: "var(--accent)",
                color: "white",
                opacity: granting || !grantEmail.trim() || !grantDate.trim() ? 0.5 : 1,
              }}
            >
              {granting ? "Granting…" : "Grant Plus"}
            </button>
          </div>
        </form>

        {grantResult && (
          <div className="mt-2 text-xs">
            {grantResult.ok && grantResult.user ? (
              <div>
                <div style={{ color: "var(--success, #16a34a)" }} className="font-medium">
                  ✓ Granted Plus to @{grantResult.user.username}
                </div>
                <div style={{ color: "var(--muted)" }} className="mt-0.5">
                  expires: {grantResult.user.subscription_expires_at || "—"}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--danger, #dc2626)" }}>
                {grantResult.error || "Grant failed"}
                {grantResult.detail && (
                  <span style={{ color: "var(--muted)" }}> — {grantResult.detail}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced tools toggle */}
      <div className="mt-2 pt-3" style={{ borderTop: "1px dashed var(--border)" }}>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs underline opacity-70 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
          title="Show or hide ghost Plus detection, raw Square data/payments views, manual subscription attach, grace expiration worker controls, and the recent webhook deliveries audit log"
        >
          {showAdvanced ? "▲ Hide advanced tools" : "▼ Show advanced tools"}
        </button>
      </div>

      {showAdvanced && (
        <AdvancedBillingTools stats={stats} recent={recent} onRefresh={fetchHealth} />
      )}
    </div>
  );
}
