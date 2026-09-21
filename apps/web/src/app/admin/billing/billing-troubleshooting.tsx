"use client";

import { useState } from "react";
import {
  formatDate,
  parseUtc,
  statusColor,
  timeAgo,
  type AttachResult,
  type SquarePaymentRaw,
  type SquarePaymentsData,
  type SquareSubscriptionRaw,
  type SquareSubscriptionsData,
  type WebhookDelivery,
} from "./billing-shared";

// Rarely-needed billing repair tools, kept out of the way on the Billing
// page (inside a collapsed "Troubleshooting" section). Day to day the page
// above this — status line + member list — is all that's needed.

const WEBHOOK_URL = "https://api.inkwell.social/api/billing/webhook";

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

export function BillingTroubleshooting({
  recent,
  onChanged,
}: {
  recent: WebhookDelivery[];
  onChanged: () => void;
}) {
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  // Sync-by-email state
  const [syncEmail, setSyncEmail] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncUserResult | null>(null);

  // Grant Plus until date state
  // Accepts either an Inkwell @username or an email address — auto-detected
  // on submit based on whether the input contains an `@` followed by a
  // domain (i.e., looks like an email).
  // Raw Square data state
  const [rawOpen, setRawOpen] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawData, setRawData] = useState<SquareSubscriptionsData | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  // Manual attach subscription state
  const [attachEmail, setAttachEmail] = useState("");
  const [attachSubId, setAttachSubId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachResult, setAttachResult] = useState<AttachResult | null>(null);

  // Raw Square payments state
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsData, setPaymentsData] = useState<SquarePaymentsData | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);


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
        onChanged();
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
        onChanged();
      }
    } catch {
      setSyncResult({ ok: false, error: "Network error during sync" });
    } finally {
      setSyncing(false);
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

  async function handleAttachSubscription(e: React.FormEvent) {
    e.preventDefault();
    const email = attachEmail.trim();
    const subId = attachSubId.trim();
    if (!email || !subId) return;
    if (
      !confirm(
        `Manually attach Square subscription ${subId} to ${email}?\n\nThis verifies the subscription exists in Square, then writes it to the user record. Use only when automatic sync can't find the payment.`
      )
    ) {
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
        onChanged();
      }
    } catch {
      setAttachResult({ ok: false, error: "Network error during attach" });
    } finally {
      setAttaching(false);
    }
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

  return (
    <div className="space-y-4">
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

      {/* Raw Square Data — what's actually in Square, independent of our DB */}
      <div
        className="rounded-lg p-3"
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
          Lists every subscription in your Square account and which local user it maps to (if any). Use this to verify a payment exists in Square when the local sync can&apos;t find it.
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
        className="rounded-lg p-3"
        style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Manually attach Square subscription</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Safety net for when automatic sync can&apos;t find a payment. Look up the subscription ID in your Square dashboard, then paste it here with the user&apos;s email. We&apos;ll verify it exists in Square and attach it to the user record.
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
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
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
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground)" }}
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
                  {attachResult.user.square_subscription_id || attachResult.user.square_donor_subscription_id}
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
        className="rounded-lg p-3"
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
          Lists every <strong>one-time payment</strong> in your Square account from the last 90 days, including charges that did NOT create a subscription.
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

      {/* Recent Square webhooks */}
      <div>
        <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
          Recent Square webhooks
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
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Square sends webhooks to <code>{WEBHOOK_URL}</code>. If they stop arriving, check the
        webhook subscription and signature key in the Square dashboard.
      </p>
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
  const displayEmail = p.buyer_email || p.customer_email;

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
