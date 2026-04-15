"use client";

import { useState } from "react";
import {
  HealthStat,
  formatDate,
  parseUtc,
  statusColor,
  timeAgo,
  type AttachResult,
  type GraceExpirationResponse,
  type GraceExpirationResult,
  type PlusUser,
  type PlusUsersData,
  type SquarePaymentRaw,
  type SquarePaymentsData,
  type SquareSubscriptionRaw,
  type SquareSubscriptionsData,
  type WebhookDelivery,
  type WebhookStats,
} from "./billing-shared";

// AdvancedBillingTools — all the debugging / cleanup sections that used to
// clutter the main billing health panel. Hidden behind a "Show advanced
// tools" toggle in the parent, so by default the admin only sees the core
// day-to-day controls (webhook metrics, reconcile, sync user, grant Plus).
//
// The advanced surface covers: ghost Plus detection (users marked Plus with
// no active payment source), the Plus user breakdown expandable, raw Square
// subscription and payment views, manually attaching a Square subscription
// to a user, the grace expiration worker preview/run, and the recent webhook
// deliveries audit log.
//
// This component owns its own state for each section (breakdownOpen,
// rawOpen, attachEmail, paymentsOpen, graceLoading, etc.) so the parent
// doesn't need to pass them down. The parent only passes the current
// `stats` and `recent` snapshots plus an `onRefresh` callback that the
// advanced sections call after any mutating action (manual attach, grant,
// grace run) to refresh the parent's health data.
//
// Helper subcomponents (PlusUserGroup, SquareSubRow, SquarePaymentRow) are
// defined at the bottom of this file since they're only used here.

export function AdvancedBillingTools({
  stats,
  recent,
  onRefresh,
}: {
  stats: WebhookStats;
  recent: WebhookDelivery[];
  onRefresh: () => void;
}) {
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

  // Grace expiration worker state
  const [graceLoading, setGraceLoading] = useState(false);
  const [graceResult, setGraceResult] = useState<GraceExpirationResult | null>(null);
  const [graceError, setGraceError] = useState<string | null>(null);

  async function handleToggleBreakdown() {
    if (breakdownOpen) {
      setBreakdownOpen(false);
      return;
    }
    setBreakdownOpen(true);
    if (breakdownData) return;

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
        onRefresh();
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
    const candidateCount = graceResult?.candidates.length ?? 0;
    const msg = graceResult
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
        onRefresh();
      } else {
        setGraceError(json.error || `Run failed (HTTP ${res.status})`);
      }
    } catch {
      setGraceError("Network error running grace expiration");
    } finally {
      setGraceLoading(false);
    }
  }

  return (
    <div
      className="rounded-lg p-3 mt-3 space-y-4"
      style={{
        background: "var(--surface, rgba(0,0,0,0.01))",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        Advanced billing tools
      </div>

      {/* Ghost Plus detection metrics */}
      <div>
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
          className="rounded-lg p-3"
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

      {/* By status breakdown — 24h webhook status pills */}
      {Object.keys(stats.by_status_24h).length > 0 && (
        <div>
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

      {/* Grace expiration worker — daily cron + admin preview/run */}
      <div
        className="rounded-lg p-3"
        style={{ background: "var(--surface-hover, rgba(0,0,0,0.02))", border: "1px solid var(--border)" }}
      >
        <div className="text-sm font-medium mb-1">Grace expiration worker</div>
        <div className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Runs automatically every 4 hours via Oban. Downgrades any Plus user whose <code>subscription_expires_at</code> has passed AND whose subscription status is <code>canceled</code>. Fires a Slack notification on every non-empty run.
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
              {graceResult.dry_run ? "Preview" : "Run result"} · checked at {formatDate(graceResult.checked_at)}
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
                          style={{ background: "color-mix(in srgb, #f59e0b 18%, transparent)", color: "#f59e0b" }}
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

// ── Helper subcomponents used only by the advanced tools ─────────────────

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

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function handleSend(u: PlusUser) {
    const confirmText =
      `Send the billing apology letter to @${u.username} (${u.email})?\n\n` +
      `They'll receive a letter in their Inkwell letterbox immediately, ` +
      `apologizing for the Stripe migration bug and providing the new Square ` +
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
                        background:
                          u.subscription_status === "active"
                            ? "color-mix(in srgb, var(--success, #16a34a) 18%, transparent)"
                            : "var(--surface-hover, rgba(0,0,0,0.06))",
                        color:
                          u.subscription_status === "active"
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
