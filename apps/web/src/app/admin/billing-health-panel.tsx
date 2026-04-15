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
  plus_square_active: number;
  plus_manually_granted: number;
  plus_legacy_stripe: number;
  plus_orphaned: number;
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

interface PlusUser {
  id: string;
  username: string;
  email: string;
  inserted_at: string;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  square_customer_id: string | null;
  square_subscription_id: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
}

interface PlusUsersData {
  square_active: PlusUser[];
  manually_granted: PlusUser[];
  legacy_stripe: PlusUser[];
  orphaned: PlusUser[];
}

interface SquareSubscriptionRaw {
  subscription_id: string;
  status: string;
  plan_variation_id: string | null;
  plan_type: "plus" | "donor" | "unknown";
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  created_at: string | null;
  start_date: string | null;
  canceled_date: string | null;
  matched_user: {
    id: string;
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  } | null;
}

interface SquareSubscriptionsData {
  ok: boolean;
  subscriptions: SquareSubscriptionRaw[];
  total: number;
  error?: string;
}

interface AttachResult {
  ok: boolean;
  type?: "plus" | "donor";
  user?: {
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  };
  error?: string;
  detail?: string;
}

interface SquarePaymentRaw {
  payment_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string | null;
  note: string | null;
  looks_like: "plus" | "donor" | "donation" | "unknown";
  card_brand: string | null;
  card_last4: string | null;
  receipt_url: string | null;
  order_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  buyer_email: string | null;
  matched_user: {
    id: string;
    username: string;
    email: string;
    subscription_tier: string;
    square_subscription_id: string | null;
    square_donor_subscription_id: string | null;
  } | null;
}

interface SquarePaymentsData {
  ok: boolean;
  payments: SquarePaymentRaw[];
  total: number;
  error?: string;
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

interface GraceUserSummary {
  id: string;
  username: string;
  email: string;
  subscription_expires_at: string | null;
}

interface GraceExpirationResult {
  dry_run: boolean;
  checked_at: string;
  candidates: GraceUserSummary[];
  downgraded: GraceUserSummary[];
  errors: Array<{ user_id: string; username: string; reason: string }>;
}

interface GraceExpirationResponse {
  ok: boolean;
  result?: GraceExpirationResult;
  error?: string;
}

const EXPECTED_WEBHOOK_URL = "https://api.inkwell.social/api/billing/webhook";

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

function formatDate(iso: string): string {
  try {
    const d = new Date(parseUtc(iso));
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
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

  // Reconcile state
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Sync-by-email state
  const [syncEmail, setSyncEmail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncUserResult | null>(null);

  // Plus user breakdown state
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownData, setBreakdownData] = useState<PlusUsersData | null>(null);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);

  // Raw Square data state
  const [rawOpen, setRawOpen] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawData, setRawData] = useState<SquareSubscriptionsData | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  // Manual attach subscription ID state
  const [attachEmail, setAttachEmail] = useState("");
  const [attachSubId, setAttachSubId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachResult, setAttachResult] = useState<AttachResult | null>(null);

  // Raw payments state
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsData, setPaymentsData] = useState<SquarePaymentsData | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  // Grant Plus until date state
  const [grantEmail, setGrantEmail] = useState("");
  const [grantDate, setGrantDate] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantResult, setGrantResult] = useState<GrantPlusResult | null>(null);

  // Grace expiration worker state
  const [graceLoading, setGraceLoading] = useState(false);
  const [graceResult, setGraceResult] = useState<GraceExpirationResult | null>(null);
  const [graceError, setGraceError] = useState<string | null>(null);

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
    if (!confirm("Reconcile all users with billing history against Square? Filtered to ~10-30 users with existing Plus/Donor/Stripe state. Safe to run anytime.")) {
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
        // Refresh health stats so the count cards reflect the new state
        fetchHealth();
      }
    } catch {
      setSyncResult({ ok: false, error: "Network error during sync" });
    } finally {
      setSyncing(false);
    }
  }

  async function handleToggleBreakdown() {
    if (breakdownOpen) {
      setBreakdownOpen(false);
      return;
    }
    setBreakdownOpen(true);
    if (breakdownData) return; // already loaded

    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const res = await fetch("/api/admin/plus-users", { cache: "no-store" });
      if (!res.ok) {
        setBreakdownError(`Failed to load Plus users (HTTP ${res.status})`);
        return;
      }
      const json = await res.json();
      setBreakdownData(json);
    } catch {
      setBreakdownError("Network error loading Plus user breakdown");
    } finally {
      setBreakdownLoading(false);
    }
  }

  async function handleToggleRaw() {
    if (rawOpen) {
      setRawOpen(false);
      return;
    }
    setRawOpen(true);
    if (rawData) return;

    setRawLoading(true);
    setRawError(null);
    try {
      const res = await fetch("/api/admin/square-subscriptions", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setRawData(json);
      } else {
        setRawError(json.error || `Failed to load Square subscriptions (HTTP ${res.status})`);
      }
    } catch {
      setRawError("Network error loading raw Square data");
    } finally {
      setRawLoading(false);
    }
  }

  async function handleRefreshRaw() {
    setRawData(null);
    setRawError(null);
    await handleToggleRaw();
  }

  async function handleTogglePayments() {
    if (paymentsOpen) {
      setPaymentsOpen(false);
      return;
    }
    setPaymentsOpen(true);
    if (paymentsData) return;

    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const res = await fetch("/api/admin/square-payments", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setPaymentsData(json);
      } else {
        setPaymentsError(json.error || `Failed to load Square payments (HTTP ${res.status})`);
      }
    } catch {
      setPaymentsError("Network error loading raw Square payments");
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function handleRefreshPayments() {
    setPaymentsData(null);
    setPaymentsError(null);
    await handleTogglePayments();
  }

  async function handleGracePreview() {
    setGraceLoading(true);
    setGraceError(null);
    try {
      const res = await fetch("/api/admin/grace-expiration-preview", { cache: "no-store" });
      const json: GraceExpirationResponse = await res.json();
      if (res.ok && json.result) {
        setGraceResult(json.result);
      } else {
        setGraceError(json.error || `Preview failed (HTTP ${res.status})`);
      }
    } catch {
      setGraceError("Network error fetching grace expiration preview");
    } finally {
      setGraceLoading(false);
    }
  }

  async function handleGraceRunNow() {
    const preview = graceResult;
    const candidateCount = preview?.candidates.length ?? 0;
    const msg = preview
      ? `Run grace expiration now? This will DOWNGRADE ${candidateCount} user(s) whose grace period has expired. They will be set to tier=free immediately.`
      : `Run grace expiration now? This will downgrade any user whose grace period has expired — you haven't previewed the list yet, so consider clicking Preview first.`;

    if (!confirm(msg)) return;

    setGraceLoading(true);
    setGraceError(null);
    try {
      const res = await fetch("/api/admin/run-grace-expiration", {
        method: "POST",
        cache: "no-store",
      });
      const json: GraceExpirationResponse = await res.json();
      if (res.ok && json.result) {
        setGraceResult(json.result);
        fetchHealth();
      } else {
        setGraceError(json.error || `Run failed (HTTP ${res.status})`);
      }
    } catch {
      setGraceError("Network error running grace expiration");
    } finally {
      setGraceLoading(false);
    }
  }

  async function handleGrantPlus(e: React.FormEvent) {
    e.preventDefault();
    const email = grantEmail.trim();
    const date = grantDate.trim();
    if (!email || !date) return;

    // Convert YYYY-MM-DD to ISO 8601 at end of day UTC
    const isoDate = date.includes("T") ? date : `${date}T23:59:59Z`;

    if (
      !confirm(
        `Manually grant ${email} Plus tier until ${date}?\n\nThis writes subscription_tier="plus", subscription_status="active", and subscription_expires_at to their user record. Use only when you've verified they paid (e.g., via the Raw Payments view) but no Square subscription was created.`
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

  async function handleAttachSubscription(e: React.FormEvent) {
    e.preventDefault();
    const email = attachEmail.trim();
    const subId = attachSubId.trim();
    if (!email || !subId) return;
    if (!confirm(`Manually attach Square subscription ${subId} to ${email}?\n\nThis verifies the subscription exists in Square, then writes it to the user record. Use only when automatic sync can't find the payment.`)) {
      return;
    }
    setAttaching(true);
    setAttachResult(null);
    try {
      const res = await fetch("/api/admin/attach-square-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, subscription_id: subId }),
        cache: "no-store",
      });
      const json: AttachResult = await res.json();
      setAttachResult(json);
      if (json.ok) {
        setAttachEmail("");
        setAttachSubId("");
        fetchHealth();
      }
    } catch {
      setAttachResult({ ok: false, error: "Network error during attach" });
    } finally {
      setAttaching(false);
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
  // Webhook never received at all — separate from silent death
  const webhookNeverReceived = stats.last_delivery_at === null;

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

      {/* Webhook URL diagnostic — always show, but emphasize when never received */}
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

      {/* Ghost Plus detection metrics */}
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
          Plus users by payment source
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HealthStat
            label="On Square"
            value={stats.plus_square_active.toString()}
            tone={stats.plus_square_active > 0 ? "success" : undefined}
          />
          <HealthStat
            label="Manually granted"
            value={stats.plus_manually_granted.toString()}
            tone={stats.plus_manually_granted > 0 ? "info" : undefined}
          />
          <HealthStat
            label="Legacy Stripe ⚠"
            value={stats.plus_legacy_stripe.toString()}
            tone={stats.plus_legacy_stripe > 0 ? "warning" : undefined}
          />
          <HealthStat
            label="Orphaned ⚠"
            value={stats.plus_orphaned.toString()}
            tone={stats.plus_orphaned > 0 ? "warning" : undefined}
          />
        </div>
        <button
          onClick={handleToggleBreakdown}
          className="text-xs underline mt-2 opacity-70 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
        >
          {breakdownOpen ? "Hide" : "View"} Plus user breakdown
        </button>
      </div>

      {/* Plus user breakdown (expandable) */}
      {breakdownOpen && (
        <div
          className="rounded-lg p-3 mb-4"
          style={{ background: "var(--surface-hover, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}
        >
          {breakdownLoading && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>
          )}
          {breakdownError && (
            <p className="text-xs" style={{ color: "var(--danger, #dc2626)" }}>{breakdownError}</p>
          )}
          {breakdownData && (
            <div className="space-y-3">
              <PlusUserGroup
                label="Square active"
                tone="success"
                users={breakdownData.square_active}
                emptyText="No Plus users on Square."
              />
              <PlusUserGroup
                label="Manually granted (admin set explicit expiration)"
                tone="info"
                users={breakdownData.manually_granted}
                emptyText="No manually granted Plus users."
                showLetterButton
              />
              <PlusUserGroup
                label="Legacy Stripe (Stripe is dead — getting Plus for free)"
                tone="warning"
                users={breakdownData.legacy_stripe}
                emptyText="No legacy Stripe Plus users."
                showLetterButton
              />
              <PlusUserGroup
                label="Orphaned (tier=plus, no payment source)"
                tone="warning"
                users={breakdownData.orphaned}
                emptyText="No orphaned Plus users."
              />
            </div>
          )}
        </div>
      )}

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

      {/* Sync user by email */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Sync user by email</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Look up a user by email and pull their current Square subscription state. Use this when you know someone paid via Square but their Plus status hasn&apos;t synced (webhook didn&apos;t fire). 2 API calls per use, no rate limit risk.
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
                {syncResult.detail && <span style={{ color: "var(--muted)" }}> — {syncResult.detail}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reconciliation section */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="text-sm font-medium mb-1">Reconcile users with billing history</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Pulls Square state for users with existing Plus/Donor/Stripe state (not all users — that&apos;d hit rate limits). 300ms delay between users + automatic 429 retry. Idempotent.
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
            </div>
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

      {/* Raw Square Data — what's actually in Square, independent of our DB */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "var(--surface-hover, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium">Raw Square data</div>
          {rawOpen && (
            <button
              onClick={handleRefreshRaw}
              className="text-xs underline opacity-70 hover:opacity-100"
              style={{ color: "var(--foreground)" }}
            >
              refresh
            </button>
          )}
        </div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Lists every subscription in your Square account and which local user it maps to (if any). Use this to verify a payment exists in Square when the local sync can&apos;t find it. Read-only, no side effects.
        </div>
        <button
          onClick={handleToggleRaw}
          className="text-xs underline opacity-80 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
        >
          {rawOpen ? "Hide" : "View"} raw Square subscriptions
        </button>

        {rawOpen && (
          <div className="mt-3">
            {rawLoading && <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>}
            {rawError && <p className="text-xs" style={{ color: "var(--danger, #dc2626)" }}>{rawError}</p>}
            {rawData && (
              <div>
                <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  {rawData.total} subscription{rawData.total === 1 ? "" : "s"} in Square
                </div>
                {rawData.subscriptions.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Square has no subscriptions for this location. If you expect payments to be here, check that SQUARE_LOCATION_ID matches the location in your Square dashboard.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rawData.subscriptions.map((sub) => (
                      <SquareSubRow key={sub.subscription_id} sub={sub} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual attach Square subscription ID — safety net */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Manually attach Square subscription</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Safety net for when automatic sync can&apos;t find a payment. Look up the subscription ID in your Square dashboard (under Subscriptions → click the customer → copy the subscription ID, looks like <code>sub_...</code>), then paste it here. We&apos;ll verify it exists in Square and attach it to the user record.
        </div>
        <form onSubmit={handleAttachSubscription} className="space-y-2">
          <input
            type="email"
            value={attachEmail}
            onChange={(e) => setAttachEmail(e.target.value)}
            placeholder="user@example.com"
            disabled={attaching}
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
              type="text"
              value={attachSubId}
              onChange={(e) => setAttachSubId(e.target.value)}
              placeholder="Square subscription ID"
              disabled={attaching}
              required
              className="flex-1 px-2 py-1.5 rounded text-xs font-mono"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={attaching || !attachEmail.trim() || !attachSubId.trim()}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={{
                background: "var(--accent)",
                color: "white",
                opacity: attaching || !attachEmail.trim() || !attachSubId.trim() ? 0.5 : 1,
              }}
            >
              {attaching ? "Attaching…" : "Attach"}
            </button>
          </div>
        </form>

        {attachResult && (
          <div className="mt-2 text-xs">
            {attachResult.ok && attachResult.user ? (
              <div>
                <div style={{ color: "var(--success, #16a34a)" }} className="font-medium">
                  ✓ Attached {attachResult.type} subscription to @{attachResult.user.username}
                </div>
                <div style={{ color: "var(--muted)" }} className="mt-0.5">
                  tier: {attachResult.user.subscription_tier} · sub:{" "}
                  {attachResult.user.square_subscription_id ||
                    attachResult.user.square_donor_subscription_id}
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--danger, #dc2626)" }}>
                {attachResult.error || "Attach failed"}
                {attachResult.detail && (
                  <span style={{ color: "var(--muted)" }}> — {attachResult.detail}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Raw Payments — find one-time charges that never became subscriptions */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "var(--surface-hover, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium">Raw Square payments</div>
          {paymentsOpen && (
            <button
              onClick={handleRefreshPayments}
              className="text-xs underline opacity-70 hover:opacity-100"
              style={{ color: "var(--foreground)" }}
            >
              refresh
            </button>
          )}
        </div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Lists every <strong>one-time payment</strong> in your Square account from the last 90 days, including charges that did NOT create a subscription. Use this to find users who paid via the broken Payment Link flow (one-time $5 receipts that should have been $5/mo subscriptions).
        </div>
        <button
          onClick={handleTogglePayments}
          className="text-xs underline opacity-80 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
        >
          {paymentsOpen ? "Hide" : "View"} raw Square payments
        </button>

        {paymentsOpen && (
          <div className="mt-3">
            {paymentsLoading && <p className="text-xs" style={{ color: "var(--muted)" }}>Loading…</p>}
            {paymentsError && <p className="text-xs" style={{ color: "var(--danger, #dc2626)" }}>{paymentsError}</p>}
            {paymentsData && (
              <div>
                <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  {paymentsData.total} payment{paymentsData.total === 1 ? "" : "s"} in the last 90 days
                </div>
                {paymentsData.payments.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    No payments. Either nobody has paid via Square yet, or location_id is misconfigured.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {paymentsData.payments.map((p) => (
                      <SquarePaymentRow key={p.payment_id} payment={p} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grant Plus until date — manual recovery for users with one-time payments */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Grant Plus until date</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Manually grant a user Plus tier with an explicit expiration date. For recovery cases like users who paid via the broken Payment Link flow and got a one-time charge instead of a subscription. Sets <code>tier=plus</code> + <code>status=active</code> + <code>subscription_expires_at</code>. Phase 2&apos;s grace-period worker (when built) will downgrade them when the date passes if they haven&apos;t re-subscribed.
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

      {/* Grace expiration worker — daily cron + admin preview/run */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ background: "var(--surface-hover, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Grace expiration worker</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Runs automatically every 4 hours via Oban. Downgrades any Plus user whose <code>subscription_expires_at</code> has passed AND whose subscription status is <code>canceled</code> (manually granted Plus users + users who cancelled at period end). Fires a Slack notification on every non-empty run. Use Preview to see what the next run would do, or Run Now to fire it immediately.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGracePreview}
            disabled={graceLoading}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              background: "var(--surface)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              opacity: graceLoading ? 0.5 : 1,
            }}
          >
            {graceLoading ? "Loading…" : "Preview"}
          </button>
          <button
            onClick={handleGraceRunNow}
            disabled={graceLoading}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              background: "var(--accent)",
              color: "white",
              opacity: graceLoading ? 0.5 : 1,
            }}
          >
            {graceLoading ? "Running…" : "Run now"}
          </button>
        </div>

        {graceError && (
          <div className="mt-2 text-xs" style={{ color: "var(--danger, #dc2626)" }}>
            {graceError}
          </div>
        )}

        {graceResult && (
          <div className="mt-3 text-xs">
            <div className="font-medium mb-1" style={{ color: "var(--foreground)" }}>
              {graceResult.dry_run ? "Preview" : "Run result"} · checked at{" "}
              {formatDate(graceResult.checked_at)}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2" style={{ color: "var(--muted)" }}>
              <span>
                Candidates: <strong>{graceResult.candidates.length}</strong>
              </span>
              {!graceResult.dry_run && (
                <span style={{ color: graceResult.downgraded.length > 0 ? "var(--success, #16a34a)" : undefined }}>
                  Downgraded: <strong>{graceResult.downgraded.length}</strong>
                </span>
              )}
              {graceResult.errors.length > 0 && (
                <span style={{ color: "var(--danger, #dc2626)" }}>
                  Errors: <strong>{graceResult.errors.length}</strong>
                </span>
              )}
            </div>

            {graceResult.candidates.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                No users currently match the expiration criteria. The worker would be a no-op right now.
              </p>
            ) : (
              <div
                className="rounded p-2 space-y-1"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                {graceResult.candidates.map((u) => {
                  const wasDowngraded = graceResult.downgraded.some((d) => d.id === u.id);
                  const hadError = graceResult.errors.some((e) => e.user_id === u.id);

                  return (
                    <div key={u.id} className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono shrink-0" style={{ color: "var(--foreground)" }}>
                        @{u.username}
                      </span>
                      <span className="truncate flex-1 min-w-0" style={{ color: "var(--muted)" }}>
                        {u.email}
                      </span>
                      {u.subscription_expires_at && (
                        <span className="shrink-0" style={{ color: "var(--muted)" }}>
                          expired {formatDate(u.subscription_expires_at)}
                        </span>
                      )}
                      {graceResult.dry_run ? (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            background: "color-mix(in srgb, #f59e0b 18%, transparent)",
                            color: "#f59e0b",
                          }}
                        >
                          would downgrade
                        </span>
                      ) : wasDowngraded ? (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            background: "color-mix(in srgb, var(--success, #16a34a) 18%, transparent)",
                            color: "var(--success, #16a34a)",
                          }}
                        >
                          ✓ downgraded
                        </span>
                      ) : hadError ? (
                        <span
                          className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                          style={{
                            background: "color-mix(in srgb, var(--danger, #dc2626) 18%, transparent)",
                            color: "var(--danger, #dc2626)",
                          }}
                        >
                          error
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            {graceResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer" style={{ color: "var(--muted)" }}>
                  Error details ({graceResult.errors.length})
                </summary>
                <ul className="mt-1 space-y-0.5" style={{ color: "var(--muted)" }}>
                  {graceResult.errors.map((e) => (
                    <li key={e.user_id}>
                      @{e.username}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
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

function HealthStat({
  label,
  value,
  muted,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: "success" | "warning" | "info";
}) {
  let color = "var(--foreground)";
  if (muted) color = "var(--muted)";
  else if (tone === "success") color = "var(--success, #16a34a)";
  else if (tone === "warning") color = "#f59e0b";
  else if (tone === "info") color = "var(--accent)";

  return (
    <div>
      <div
        className="text-lg font-semibold"
        style={{ color, fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}

function PlusUserGroup({
  label,
  tone,
  users,
  emptyText,
  showLetterButton,
}: {
  label: string;
  tone: "success" | "warning" | "info";
  users: PlusUser[];
  emptyText: string;
  showLetterButton?: boolean;
}) {
  const headerColor =
    tone === "success"
      ? "var(--success, #16a34a)"
      : tone === "info"
      ? "var(--accent)"
      : "#f59e0b";

  // Per-row state: which user is currently being sent, and the inline result.
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function handleSend(u: PlusUser) {
    const confirmText =
      `Send the billing apology letter to @${u.username} (${u.email})?\n\n` +
      `They'll receive a letter in their Inkwell letterbox immediately, ` +
      `apologizing for the Stripe migration bug, confirming we manually granted ` +
      `them Plus through their expiration date, and providing the new Square ` +
      `upgrade link. Letters are delivered internally so they work for ` +
      `fediverse-placeholder accounts where email would bounce.`;
    if (!confirm(confirmText)) return;

    setSendingId(u.id);
    setResults((r) => {
      const next = { ...r };
      delete next[u.id];
      return next;
    });

    try {
      const res = await fetch("/api/admin/send-billing-apology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email }),
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResults((r) => ({
          ...r,
          [u.id]: { ok: true, text: `✓ Letter sent to @${json.recipient_username}` },
        }));
      } else {
        setResults((r) => ({
          ...r,
          [u.id]: { ok: false, text: json.error || `Failed (HTTP ${res.status})` },
        }));
      }
    } catch {
      setResults((r) => ({
        ...r,
        [u.id]: { ok: false, text: "Network error" },
      }));
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider mb-1 font-medium"
        style={{ color: headerColor }}
      >
        {label} ({users.length})
      </div>
      {users.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1">
          {users.map((u) => {
            const expiresAt = u.subscription_expires_at;
            const expiresMs = expiresAt ? parseUtc(expiresAt) : null;
            const isExpired = expiresMs !== null && expiresMs < Date.now();
            const sending = sendingId === u.id;
            const result = results[u.id];

            return (
              <div
                key={u.id}
                className="rounded"
                style={{
                  background: "var(--surface, rgba(255,255,255,0.5))",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-2 text-xs px-2 py-1 flex-wrap">
                  <span className="font-mono shrink-0" style={{ color: "var(--foreground)" }}>
                    @{u.username}
                  </span>
                  <span className="truncate flex-1 min-w-0" style={{ color: "var(--muted)" }}>
                    {u.email}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--muted)" }}>
                    joined {formatDate(u.inserted_at)}
                  </span>
                  {u.subscription_status && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                      style={{
                        background: u.subscription_status === "active"
                          ? "color-mix(in srgb, var(--success, #16a34a) 18%, transparent)"
                          : "var(--surface-hover, rgba(0,0,0,0.06))",
                        color: u.subscription_status === "active"
                          ? "var(--success, #16a34a)"
                          : "var(--muted)",
                      }}
                    >
                      {u.subscription_status}
                    </span>
                  )}
                  {expiresAt && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: isExpired
                          ? "color-mix(in srgb, var(--danger, #dc2626) 18%, transparent)"
                          : "color-mix(in srgb, var(--accent) 15%, transparent)",
                        color: isExpired ? "var(--danger, #dc2626)" : "var(--accent)",
                      }}
                      title={`Expires at ${expiresAt}`}
                    >
                      {isExpired ? "expired" : "expires"} {formatDate(expiresAt)}
                    </span>
                  )}
                  <button
                    onClick={() => navigator.clipboard.writeText(u.email)}
                    className="shrink-0 underline opacity-60 hover:opacity-100"
                    style={{ color: "var(--foreground)" }}
                    title="Copy email"
                  >
                    copy
                  </button>
                  {showLetterButton && (
                    <button
                      onClick={() => handleSend(u)}
                      disabled={sending}
                      className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: "var(--accent)",
                        color: "white",
                        opacity: sending ? 0.5 : 1,
                      }}
                      title="Send the standard billing apology letter to this user"
                    >
                      {sending ? "Sending…" : "send letter"}
                    </button>
                  )}
                </div>
                {result && (
                  <div
                    className="px-2 py-1 text-[11px]"
                    style={{
                      color: result.ok ? "var(--success, #16a34a)" : "var(--danger, #dc2626)",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {result.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SquarePaymentRow({ payment: p }: { payment: SquarePaymentRaw }) {
  const isCompleted = p.status === "COMPLETED" || p.status === "APPROVED";
  const statusBg = isCompleted
    ? "color-mix(in srgb, var(--success, #16a34a) 18%, transparent)"
    : "var(--surface-hover, rgba(0,0,0,0.06))";
  const statusFg = isCompleted ? "var(--success, #16a34a)" : "var(--muted)";

  const looksBg =
    p.looks_like === "plus"
      ? "color-mix(in srgb, var(--accent) 15%, transparent)"
      : p.looks_like === "donor" || p.looks_like === "donation"
      ? "color-mix(in srgb, #f59e0b 18%, transparent)"
      : "var(--surface-hover, rgba(0,0,0,0.06))";

  const dollars = (p.amount_cents / 100).toFixed(2);

  // Email shown to admin: prefer buyer_email, fall back to customer_email
  const displayEmail = p.buyer_email || p.customer_email;

  // Whether this payment is "orphaned" — succeeded but has no matched local user OR
  // user has no Square subscription attached (this is the bug case)
  const isOrphan =
    isCompleted &&
    (!p.matched_user ||
      (!p.matched_user.square_subscription_id && !p.matched_user.square_donor_subscription_id));

  return (
    <div
      className="text-xs px-2 py-1.5 rounded space-y-1"
      style={{
        background: "var(--surface, rgba(255,255,255,0.5))",
        border: isOrphan ? "1px solid #f59e0b" : "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: statusBg, color: statusFg }}
        >
          {p.status}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: looksBg, color: "var(--foreground)" }}
        >
          looks like {p.looks_like}
        </span>
        <span className="font-medium" style={{ color: "var(--foreground)" }}>
          ${dollars} {p.currency}
        </span>
        {p.card_brand && p.card_last4 && (
          <span style={{ color: "var(--muted)" }}>
            · {p.card_brand} •{p.card_last4}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
        {p.customer_name && <span>{p.customer_name}</span>}
        {displayEmail && <span>&lt;{displayEmail}&gt;</span>}
        {p.created_at && <span>· {formatDate(p.created_at)}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {p.matched_user ? (
          <>
            <span style={{ color: "var(--success, #16a34a)" }}>
              ✓ matches{" "}
              <span className="font-mono" style={{ color: "var(--foreground)" }}>
                @{p.matched_user.username}
              </span>
            </span>
            {isOrphan && (
              <span style={{ color: "#f59e0b" }} className="font-medium">
                ⚠ NO Square subscription attached — this is a one-time charge that should have been recurring
              </span>
            )}
          </>
        ) : (
          <span style={{ color: "#f59e0b" }}>
            ⚠ no matching local user — orphan payment, may be from a checkout that never completed account creation
          </span>
        )}
        {p.receipt_url && (
          <a
            href={p.receipt_url}
            target="_blank"
            rel="noreferrer"
            className="underline opacity-70 hover:opacity-100"
            style={{ color: "var(--foreground)" }}
          >
            receipt
          </a>
        )}
      </div>
    </div>
  );
}

function SquareSubRow({ sub }: { sub: SquareSubscriptionRaw }) {
  const isActive = sub.status === "ACTIVE" || sub.status === "PENDING";
  const statusBg = isActive
    ? "color-mix(in srgb, var(--success, #16a34a) 18%, transparent)"
    : "var(--surface-hover, rgba(0,0,0,0.06))";
  const statusFg = isActive ? "var(--success, #16a34a)" : "var(--muted)";

  const planBg =
    sub.plan_type === "plus"
      ? "color-mix(in srgb, var(--accent) 15%, transparent)"
      : sub.plan_type === "donor"
      ? "color-mix(in srgb, #f59e0b 18%, transparent)"
      : "var(--surface-hover, rgba(0,0,0,0.06))";

  return (
    <div
      className="text-xs px-2 py-1.5 rounded space-y-1"
      style={{ background: "var(--surface, rgba(255,255,255,0.5))", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: statusBg, color: statusFg }}
        >
          {sub.status}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: planBg, color: "var(--foreground)" }}
        >
          {sub.plan_type}
        </span>
        <span className="font-mono text-[10px] truncate" style={{ color: "var(--muted)" }}>
          {sub.subscription_id}
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(sub.subscription_id)}
          className="shrink-0 underline opacity-60 hover:opacity-100"
          style={{ color: "var(--foreground)" }}
          title="Copy subscription ID"
        >
          copy
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap" style={{ color: "var(--muted)" }}>
        {sub.customer_email && (
          <span className="truncate">
            {sub.customer_name ? `${sub.customer_name} <${sub.customer_email}>` : sub.customer_email}
          </span>
        )}
        {sub.created_at && <span>· created {formatDate(sub.created_at)}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sub.matched_user ? (
          <span style={{ color: "var(--success, #16a34a)" }}>
            ✓ matches local user{" "}
            <span className="font-mono" style={{ color: "var(--foreground)" }}>
              @{sub.matched_user.username}
            </span>
            {sub.matched_user.subscription_tier === "plus" &&
              (sub.matched_user.square_subscription_id === sub.subscription_id ||
                sub.matched_user.square_donor_subscription_id === sub.subscription_id) && (
                <span style={{ color: "var(--muted)" }}> · already attached</span>
              )}
            {sub.matched_user.subscription_tier === "plus" &&
              sub.matched_user.square_subscription_id !== sub.subscription_id &&
              sub.matched_user.square_donor_subscription_id !== sub.subscription_id && (
                <span style={{ color: "#f59e0b" }}> · NOT attached to local record</span>
              )}
          </span>
        ) : (
          <span style={{ color: "#f59e0b" }}>⚠ no matching local user</span>
        )}
      </div>
    </div>
  );
}
