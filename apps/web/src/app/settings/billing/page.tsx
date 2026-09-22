"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface BillingStatus {
  subscription_tier: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
  self_hosted?: boolean;
  processor?: string;
  needs_resubscribe?: boolean;
  founding_member_number?: number | null;
  founding_member_at?: string | null;
  founding?: { cap: number; sold: number; remaining: number; price_cents: number };
  trial_eligible?: boolean;
  trial_days?: number;
  plus_annual_available?: boolean;
  plus_annual_cents?: number;
  storage?: StorageSummary;
  /** Whether a new Plus checkout is safe (see Billing.plus_checkout_state/1). */
  plus_checkout?: "allowed" | "already_subscribed" | "payment_failed" | "cancel_scheduled";
  /** A canceled Plus subscription with paid days left that can be kept. */
  plus_resumable?: boolean;
}

interface StorageSummary {
  used_bytes: number;
  limit_bytes: number;
  plus_years: number;
  next_increase_on: string | null;
  yearly_increase_bytes: number | null;
}

function formatBytes(bytes: number) {
  const gb = 1024 ** 3;
  if (bytes >= gb) return `${(bytes / gb).toFixed(1).replace(/\.0$/, "")} GB`;
  const mb = bytes / 1024 ** 2;
  return mb < 1 && bytes > 0 ? "under 1 MB" : `${Math.round(mb)} MB`;
}

function StorageCard({ storage, isPlus }: { storage: StorageSummary; isPlus: boolean }) {
  const pct = storage.limit_bytes > 0 ? Math.min(100, (storage.used_bytes / storage.limit_bytes) * 100) : 0;
  return (
    <div
      id="storage"
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          Image Storage
        </h3>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {formatBytes(storage.used_bytes)} of {formatBytes(storage.limit_bytes)}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--surface-hover, var(--border))" }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Image storage used"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(pct, storage.used_bytes > 0 ? 1 : 0)}%`, background: pct >= 90 ? "var(--danger, #ef4444)" : "var(--accent)" }}
        />
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        {isPlus ? (
          <>
            Plus storage starts at 1 GB and grows by 1 GB every year you&apos;re a member
            {storage.plus_years > 0 && <> — you&apos;ve earned {storage.plus_years} extra GB so far</>}.
            {storage.next_increase_on && <> Your next increase is on {formatDate(storage.next_increase_on + "T12:00:00Z")}.</>}
          </>
        ) : (
          <>Free accounts include 100 MB. Plus includes 1 GB, growing by 1 GB every year you&apos;re a member.</>
        )}
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [donorLoading, setDonorLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDonorLoading, setCancelDonorLoading] = useState(false);
  const [donateLoading, setDonateLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAmount, setSelectedAmount] = useState(200);
  const [selectedDonation, setSelectedDonation] = useState(500);
  const [customDonation, setCustomDonation] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showCancelDonorConfirm, setShowCancelDonorConfirm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [foundingLoading, setFoundingLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState("");

  const justSucceeded = searchParams.get("success") === "true" || searchParams.get("checkout") === "success";
  const justCanceled = searchParams.get("canceled") === "true";
  const justDonored = justSucceeded && searchParams.get("donor") === "true";
  const justDonated = searchParams.get("donation") === "success";
  const justFounded = justSucceeded && searchParams.get("type") === "founding";

  async function fetchStatus() {
    try {
      const res = await fetch("/api/billing/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
        return data.data as BillingStatus;
      }
    } catch {
      // silently fail — will show as free
    }
    return null;
  }

  async function handleSync({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) {
      setSyncing(true);
      setSyncMessage("");
      setError("");
    }
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchStatus();
        if (!silent) {
          const changes: string[] = data.changes || [];
          if (changes.length === 0) {
            setSyncMessage("Everything's already in sync with Square.");
          } else {
            setSyncMessage("Your subscription has been updated from Square.");
          }
        }
        return data.changes as string[] || [];
      } else if (!silent) {
        setError(data.error || "Unable to sync from Square.");
      }
    } catch {
      if (!silent) setError("Network error while syncing from Square.");
    } finally {
      if (!silent) setSyncing(false);
    }
    return [];
  }

  useEffect(() => {
    async function init() {
      const initial = await fetchStatus();
      setLoading(false);

      // Auto-reconcile when the user is returning from a Square checkout, OR
      // when they look stranded (legacy Stripe with no Square record). This
      // self-heals the common case where a webhook failed to reach us.
      const shouldAutoSync =
        justSucceeded || (initial?.needs_resubscribe === true);

      if (shouldAutoSync) {
        await handleSync({ silent: !justSucceeded });
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheckout() {
    setCheckoutLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: billingInterval }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to start checkout");
        setCheckoutLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  }

  async function handleDonorCheckout(amountCents: number) {
    setDonorLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/donor-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to start checkout");
        setDonorLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setDonorLoading(false);
    }
  }

  async function handleFoundingCheckout() {
    setFoundingLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/founding-checkout", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to start checkout");
        setFoundingLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setFoundingLoading(false);
    }
  }

  async function handleStartTrial() {
    setTrialLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/start-trial", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetchStatus();
        // Refresh sidebar/nav so Plus-only UI unlocks without a reload.
        window.dispatchEvent(new Event("inkwell-nav-refresh"));
      } else {
        setError(data.error || "Couldn't start your trial.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setTrialLoading(false);
    }
  }

  async function handleCancel() {
    setCancelLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShowCancelConfirm(false);
        setStatus(prev => prev ? { ...prev, subscription_status: "canceled" } : prev);
        // Picks up the end date Square scheduled and whether "Keep my Plus" applies.
        await fetchStatus();
      } else {
        setError(data.error || "Unable to cancel subscription");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  }

  // Past-due members: Square can't swap the card on an existing subscription,
  // so close the failing one first, then open a fresh checkout. Canceling
  // first is what keeps this from billing twice.
  async function handleRestart() {
    setRestartLoading(true);
    setError("");
    try {
      const cancelRes = await fetch("/api/billing/cancel", { method: "POST" });
      const cancelData = await cancelRes.json().catch(() => ({}));
      if (!cancelRes.ok) {
        setError(cancelData.error || "Couldn't cancel the failed subscription. Nothing was charged — please try again.");
        setRestartLoading(false);
        return;
      }

      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: billingInterval }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      // The old subscription is canceled; show the plain subscribe form.
      await fetchStatus();
      setError(data.error || "Your failed subscription is canceled, but checkout didn't open. Try \"Start a new subscription\" below.");
    } catch {
      await fetchStatus();
      setError("Network error. Please try again.");
    }
    setRestartLoading(false);
  }

  async function handleResume() {
    setResumeLoading(true);
    setError("");
    setResumeMessage("");
    try {
      const res = await fetch("/api/billing/resume", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchStatus();
        setResumeMessage("You're staying on Plus. Your subscription will renew on its usual date — nothing was charged today.");
      } else {
        setError(data.error || "Couldn't keep your Plus. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setResumeLoading(false);
    }
  }

  async function handleCancelDonor() {
    setCancelDonorLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/cancel-donor", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShowCancelDonorConfirm(false);
        setStatus(prev => prev ? { ...prev, ink_donor_status: "canceled" } : prev);
      } else {
        setError(data.error || "Unable to cancel donation");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelDonorLoading(false);
    }
  }

  async function handleDonate(amountCents: number) {
    setDonateLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/donate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to start checkout");
        setDonateLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setDonateLoading(false);
    }
  }

  const needsResubscribe = !!status?.needs_resubscribe;
  // Legacy Stripe users with needs_resubscribe are effectively free — hide the
  // "Plus member" UI so they can see the Square upgrade form and re-subscribe.
  const isPlus = status?.subscription_tier === "plus" && !needsResubscribe;
  const isPastDue = status?.subscription_status === "past_due";
  const isCanceled = status?.subscription_status === "canceled";
  // Same treatment for legacy donor subscribers.
  const isDonor = status?.ink_donor_status === "active" && !needsResubscribe;
  const isDonorPastDue = status?.ink_donor_status === "past_due";
  const isFounding = !!status?.founding_member_number;
  const isTrialing = isPlus && !isFounding && status?.subscription_status === "trialing";
  const isPaidPlus = isPlus && !isFounding && !isTrialing;
  // A cancel that still has paid days left. Starting a new subscription now
  // would charge for those days twice, so the only offer is "Keep my Plus".
  const isCancelScheduled = isCanceled && status?.plus_checkout === "cancel_scheduled";
  // Canceled and nothing left running (paid period over, or the canceled
  // subscription was the one whose payment failed): safe to subscribe again.
  const canResubscribe = isCanceled && status?.plus_checkout === "allowed";
  const founding = status?.founding;
  const annualAvailable = !!status?.plus_annual_available;
  const annualPrice = Math.round((status?.plus_annual_cents ?? 5000) / 100);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-sm" style={{ color: "var(--muted)" }}>
          Loading billing info...
        </div>
      </div>
    );
  }

  if (status?.self_hosted) {
    return (
      <div>
        <div
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Self-Hosted Instance
            </h3>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Plus
            </span>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            All Plus features are included with your self-hosted instance. No subscription required.
          </p>
        </div>
      </div>
    );
  }

  const donationAmount = customDonation
    ? Math.round(parseFloat(customDonation) * 100)
    : selectedDonation;
  const donationValid = donationAmount >= 100 && donationAmount <= 50000;

  return (
    <div>
      {/* Banners */}
      {syncing && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid var(--border)" }}
        >
          Checking with Square for your latest subscription status…
        </div>
      )}
      {syncMessage && !syncing && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--success, #22c55e) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--success, #22c55e) 30%, transparent)" }}
        >
          {syncMessage}
        </div>
      )}
      {status?.needs_resubscribe && (
        <div
          className="rounded-lg p-4 mb-4 text-sm relative"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}
        >
          <strong>Restore your subscription</strong> — We&apos;ve switched payment processors.
          Your previous subscription is no longer active. Re-subscribe below to restore your benefits.
          <div className="mt-2">
            <button
              onClick={() => handleSync()}
              disabled={syncing}
              className="text-xs underline opacity-80 hover:opacity-100"
              style={{ color: "var(--foreground)" }}
            >
              Already paid? Sync from Square
            </button>
          </div>
          <button
            onClick={async () => {
              setStatus(prev => prev ? { ...prev, needs_resubscribe: false } : prev);
              try {
                await fetch("/api/me", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ settings: { resubscribe_dismissed: true } }),
                });
              } catch {}
            }}
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: "var(--foreground)" }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {justFounded && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--success, #22c55e) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--success, #22c55e) 30%, transparent)" }}
        >
          {isFounding ? (
            <><strong>Welcome, Founding Member #{status?.founding_member_number}.</strong> You have Plus for as long as Inkwell runs. Thank you — this genuinely keeps the lights on.</>
          ) : (
            <><strong>Thank you!</strong> We&apos;re confirming your payment with Square. This usually takes a few seconds — refresh this page if your membership doesn&apos;t appear.</>
          )}
        </div>
      )}
      {justSucceeded && !justDonored && !justDonated && !justFounded && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--success, #22c55e) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--success, #22c55e) 30%, transparent)" }}
        >
          <strong>Welcome to Inkwell Plus!</strong> Your subscription is now active. Thank you for supporting Inkwell.
        </div>
      )}
      {justDonored && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}
        >
          <strong>Thank you, Ink Donor!</strong> Your donation is now active. Every drop helps keep Inkwell ad-free.
        </div>
      )}
      {justDonated && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}
        >
          <strong>Thank you for your donation!</strong> Your generosity helps keep Inkwell ad-free and community-owned.
        </div>
      )}
      {justCanceled && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--muted) 12%, transparent)", border: "1px solid var(--border)" }}
        >
          Checkout was canceled. No charges were made.
        </div>
      )}
      {isPastDue && !isFounding && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)" }}
        >
          <strong>Your last Plus payment didn&apos;t go through.</strong> See <em>Your Plan</em> below to switch to a card that works.
        </div>
      )}
      {resumeMessage && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--success, #22c55e) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--success, #22c55e) 30%, transparent)" }}
        >
          {resumeMessage}
        </div>
      )}

      {error && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)" }}
        >
          {error}
        </div>
      )}

      {/* Your Plan */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Your Plan
          </h3>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={isPlus
              ? { background: "var(--accent)", color: "white" }
              : { background: "var(--surface-hover, var(--border))", color: "var(--foreground)" }
            }
          >
            {isFounding ? `✦ Founding #${status?.founding_member_number}` : isTrialing ? "✦ Plus trial" : isPlus ? "✦ Plus" : "Free"}
          </span>
        </div>

        {isFounding ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re Founding Member <strong style={{ color: "var(--foreground)" }}>#{status?.founding_member_number}</strong>.
              You have every Plus feature for as long as Inkwell runs — nothing to renew, nothing to cancel.
            </p>
            {status?.founding_member_at && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Joined {formatDate(status.founding_member_at)}
              </p>
            )}
          </div>
        ) : isTrialing ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re trying Plus for free
              {status?.subscription_expires_at && <> until <strong style={{ color: "var(--foreground)" }}>{formatDate(status.subscription_expires_at)}</strong></>}.
              Nothing will be charged. When the trial ends your account goes back to Free, and anything
              you customized is kept — it comes back if you subscribe.
            </p>
            <div className="mt-4">
              <PlusIntervalPicker
                interval={billingInterval}
                onChange={setBillingInterval}
                annualAvailable={annualAvailable}
                annualPrice={annualPrice}
              />
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white", opacity: checkoutLoading ? 0.6 : 1 }}
              >
                {checkoutLoading ? "Redirecting to checkout..." : billingInterval === "year" ? `Keep Plus — $${annualPrice}/year` : "Keep Plus — $5/month"}
              </button>
            </div>
          </div>
        ) : isPaidPlus && isPastDue ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Square couldn&apos;t charge your card for Plus. Square doesn&apos;t let us change the card on an
              existing subscription, so the fix is to close this one and start a new one with a card that works.
              We cancel the failed subscription <em>first</em>, so you&apos;re never billed twice.
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
              If Square emails you about the unpaid charge, you don&apos;t need to pay it once you&apos;ve started over.
            </p>
            <div className="mt-4">
              <PlusIntervalPicker
                interval={billingInterval}
                onChange={setBillingInterval}
                annualAvailable={annualAvailable}
                annualPrice={annualPrice}
              />
              <button
                onClick={handleRestart}
                disabled={restartLoading}
                className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white", opacity: restartLoading ? 0.6 : 1 }}
              >
                {restartLoading
                  ? "Canceling the failed subscription…"
                  : billingInterval === "year"
                    ? `Cancel and start over — $${annualPrice}/year`
                    : "Cancel and start over — $5/month"}
              </button>
              {!showCancelConfirm ? (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full mt-2 text-xs underline opacity-80 hover:opacity-100"
                  style={{ color: "var(--muted)" }}
                >
                  Or just cancel Plus
                </button>
              ) : (
                <div className="mt-3 flex gap-2 justify-center">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "var(--danger, #ef4444)", color: "white", opacity: cancelLoading ? 0.6 : 1 }}
                  >
                    {cancelLoading ? "Canceling..." : "Yes, cancel Plus"}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "transparent", color: "var(--muted)" }}
                  >
                    Never mind
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : isPaidPlus && isCancelScheduled ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your subscription is canceled. You keep Plus
              {status?.subscription_expires_at && <> until <strong style={{ color: "var(--foreground)" }}>{formatDate(status.subscription_expires_at)}</strong></>},
              the end of the period you&apos;ve paid for.
            </p>
            {status?.plus_resumable && (
              <>
                <button
                  onClick={handleResume}
                  disabled={resumeLoading}
                  className="w-full mt-4 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{ background: "var(--accent)", color: "white", opacity: resumeLoading ? 0.6 : 1 }}
                >
                  {resumeLoading ? "Keeping your Plus…" : "Keep my Plus"}
                </button>
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  Changed your mind? This undoes the cancellation: your subscription renews on its usual date, on the
                  same card. Nothing is charged today.
                </p>
              </>
            )}
          </div>
        ) : isPaidPlus && canResubscribe ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your Plus subscription is canceled. Start a new one whenever you like — everything you customized is
              still here.
            </p>
            <div className="mt-4">
              <PlusIntervalPicker
                interval={billingInterval}
                onChange={setBillingInterval}
                annualAvailable={annualAvailable}
                annualPrice={annualPrice}
              />
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "white", opacity: checkoutLoading ? 0.6 : 1 }}
              >
                {checkoutLoading ? "Redirecting to checkout..." : billingInterval === "year" ? `Start a new subscription — $${annualPrice}/year` : "Start a new subscription — $5/month"}
              </button>
            </div>
          </div>
        ) : isPaidPlus ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re an Inkwell Plus member. Thank you for supporting the platform!
            </p>
            {status?.subscription_expires_at && (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Current period ends:{" "}
                {new Date(status.subscription_expires_at).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            )}
            {isCanceled ? (
              <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                Your subscription has been canceled. You&apos;ll retain Plus features until the end of your billing period.
              </p>
            ) : !showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="mt-3 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--surface-hover, var(--border))", color: "var(--foreground)" }}
              >
                Cancel subscription
              </button>
            ) : (
              <div
                className="mt-3 rounded-lg p-3"
                style={{ background: "color-mix(in srgb, var(--danger, #ef4444) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 20%, transparent)" }}
              >
                <p className="text-xs mb-2" style={{ color: "var(--foreground)" }}>
                  Are you sure? You&apos;ll lose access to Plus features at the end of your billing period.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "var(--danger, #ef4444)", color: "white", opacity: cancelLoading ? 0.6 : 1 }}
                  >
                    {cancelLoading ? "Canceling..." : "Yes, cancel"}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "transparent", color: "var(--muted)" }}
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              Upgrade to Inkwell Plus for <strong style={{ color: "var(--foreground)" }}>$5/month</strong> and
              unlock premium features while supporting an ad-free, algorithm-free platform.
            </p>
            <ul className="space-y-1.5 mb-4">
              {[
                "Custom domain (your-site.com)",
                "Reader stats: reads by day, top entries, where readers came from",
                "Unlimited newsletter subscribers, 8 sends/mo",
                "Custom colors, fonts, layouts & themes",
                "Custom HTML & CSS theming",
                "Background images & profile music",
                "Post by Email",
                "Cross-post to Mastodon",
                "Unlimited drafts, series & filters",
                "1 GB image storage, +1 GB every year",
                "API read + write access",
                "First Class stamp",
                "Plus badge",
                "Priority support",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm" style={{ color: "var(--foreground)" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                    <polyline points="2.5 7 5.5 10 11.5 4" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <PlusIntervalPicker
              interval={billingInterval}
              onChange={setBillingInterval}
              annualAvailable={annualAvailable}
              annualPrice={annualPrice}
            />
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "white", opacity: checkoutLoading ? 0.6 : 1 }}
            >
              {checkoutLoading ? "Redirecting to checkout..." : billingInterval === "year" ? `Upgrade to Plus — $${annualPrice}/year` : "Upgrade to Plus — $5/mo"}
            </button>
            {status?.trial_eligible && (
              <button
                onClick={handleStartTrial}
                disabled={trialLoading}
                className="w-full mt-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)", opacity: trialLoading ? 0.6 : 1 }}
              >
                {trialLoading ? "Starting your trial..." : `Try Plus free for ${status.trial_days ?? 14} days — no card needed`}
              </button>
            )}
          </div>
        )}
      </div>

      {status?.storage && <StorageCard storage={status.storage} isPlus={isPlus} />}

      {/* Founding Members */}
      {founding && (!isFounding) && (
        <div
          className="rounded-xl border p-5 mt-6"
          style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Become a Founding Member
            </h3>
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--accent-light, var(--surface-hover))", color: "var(--accent)" }}
            >
              {founding.remaining > 0 ? `${founding.remaining} of ${founding.cap} left` : "All claimed"}
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: "var(--muted)", fontStyle: "italic" }}>
            ${founding.price_cents / 100} once. Plus for as long as Inkwell runs.
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Inkwell is run by one person and doesn&apos;t cover its own costs yet. Founding Members pay once
            to fund it up front, and get every Plus feature for as long as Inkwell runs, a numbered Founding
            Member badge on their profile, and our real gratitude.
            {isPaidPlus && " Your monthly Plus subscription is canceled automatically, so you won't be charged twice."}
          </p>
          {founding.remaining > 0 ? (
            <button
              onClick={handleFoundingCheckout}
              disabled={foundingLoading}
              className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "white", opacity: foundingLoading ? 0.6 : 1 }}
            >
              {foundingLoading ? "Redirecting to checkout..." : `Become Founding Member #${founding.sold + 1} — $${founding.price_cents / 100}`}
            </button>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              All {founding.cap} Founding Memberships have been claimed. Thank you to everyone who joined.
            </p>
          )}
          <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
            <a href="/transparency" className="underline" style={{ color: "var(--accent)" }}>See what Inkwell costs to run</a>
            {" "}and where the money goes.
          </p>
        </div>
      )}

      {/* Ink Donor */}
      <div
        className="rounded-xl border p-5 mt-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold flex items-center gap-1.5" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            <svg width="14" height="17" viewBox="0 0 10 12" fill="var(--accent)" aria-hidden="true">
              <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
            </svg>
            Ink Donor
          </h3>
          {isDonor && (
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Active
            </span>
          )}
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--muted)", fontStyle: "italic" }}>
          Keep the ink flowing.
        </p>

        {isDonor ? (
          <div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re donating <strong style={{ color: "var(--foreground)" }}>${((status?.ink_donor_amount_cents ?? 0) / 100).toFixed(0)}/month</strong> to
              help keep Inkwell running.
            </p>
            {!showCancelDonorConfirm ? (
              <button
                onClick={() => setShowCancelDonorConfirm(true)}
                className="mt-3 px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={{ background: "var(--surface-hover, var(--border))", color: "var(--foreground)" }}
              >
                Cancel donation
              </button>
            ) : (
              <div
                className="mt-3 rounded-lg p-3"
                style={{ background: "color-mix(in srgb, var(--danger, #ef4444) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 20%, transparent)" }}
              >
                <p className="text-xs mb-2">Are you sure you want to cancel your Ink Donor subscription?</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelDonor}
                    disabled={cancelDonorLoading}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "var(--danger, #ef4444)", color: "white", opacity: cancelDonorLoading ? 0.6 : 1 }}
                  >
                    {cancelDonorLoading ? "Canceling..." : "Yes, cancel"}
                  </button>
                  <button
                    onClick={() => setShowCancelDonorConfirm(false)}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "transparent", color: "var(--muted)" }}
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              A small voluntary donation to help sustain Inkwell. No features unlocked —
              just the satisfaction of keeping an ad-free platform alive, and an Ink Donor badge on your profile.
            </p>

            {isDonorPastDue && (
              <p className="text-xs mb-2" style={{ color: "var(--danger, #ef4444)" }}>
                Your last donation payment failed. You can start a new donation below.
              </p>
            )}

            {/* Monthly recurring */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Monthly recurring
              </p>
              <div className="flex gap-2 mb-3">
                {[100, 200, 300].map((cents) => (
                  <button
                    key={cents}
                    onClick={() => setSelectedAmount(cents)}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={selectedAmount === cents
                      ? { background: "var(--accent)", color: "white" }
                      : { background: "var(--surface-hover, var(--border))", color: "var(--foreground)" }
                    }
                  >
                    ${cents / 100}/mo
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleDonorCheckout(selectedAmount)}
                disabled={donorLoading}
                className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent)", color: "white", opacity: donorLoading ? 0.6 : 1 }}
              >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
                  <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
                </svg>
                {donorLoading ? "Redirecting..." : "Become an Ink Donor"}
              </button>
            </div>

            {/* One-time donation */}
            <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                One-time donation
              </p>
              <div className="flex gap-2 flex-wrap mb-3">
                {[300, 500, 1000].map((cents) => (
                  <button
                    key={cents}
                    onClick={() => { setSelectedDonation(cents); setCustomDonation(""); }}
                    className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={selectedDonation === cents && !customDonation
                      ? { background: "var(--accent)", color: "white" }
                      : { background: "var(--surface-hover, var(--border))", color: "var(--foreground)" }
                    }
                  >
                    ${cents / 100}
                  </button>
                ))}
                <div
                  className="flex items-center rounded-full overflow-hidden"
                  style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                >
                  <span className="pl-3 text-sm" style={{ color: "var(--muted)" }}>$</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    step="1"
                    placeholder="Custom"
                    value={customDonation}
                    onChange={(e) => setCustomDonation(e.target.value)}
                    className="bg-transparent outline-none text-sm py-1.5 pr-3 pl-1 w-20"
                    style={{ color: "var(--foreground)" }}
                  />
                </div>
              </div>
              <button
                onClick={() => handleDonate(donationAmount)}
                disabled={donateLoading || !donationValid}
                className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                  opacity: (donateLoading || !donationValid) ? 0.5 : 1,
                }}
              >
                {donateLoading ? "Redirecting..." : `Donate${donationValid ? ` $${(donationAmount / 100).toFixed(donationAmount % 100 === 0 ? 0 : 2)}` : ""}`}
              </button>
              {customDonation && !donationValid && (
                <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                  Donations can be between $1 and $500.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs mt-6" style={{ color: "var(--muted)" }}>
        Payments are securely processed by Square. You can cancel anytime from this page.
        Inkwell never sees your card details.
      </p>
    </div>
  );
}

function PlusIntervalPicker({
  interval,
  onChange,
  annualAvailable,
  annualPrice,
}: {
  interval: "month" | "year";
  onChange: (i: "month" | "year") => void;
  annualAvailable: boolean;
  annualPrice: number;
}) {
  if (!annualAvailable) return null;
  const options: { id: "month" | "year"; label: string; note: string }[] = [
    { id: "month", label: "$5 / month", note: "Cancel anytime" },
    { id: "year", label: `$${annualPrice} / year`, note: `Two months free` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 mb-3" role="radiogroup" aria-label="Billing interval">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={interval === o.id}
          onClick={() => onChange(o.id)}
          className="rounded-lg border px-3 py-2 text-left transition-colors"
          style={{
            borderColor: interval === o.id ? "var(--accent)" : "var(--border)",
            borderWidth: interval === o.id ? 2 : 1,
            background: "var(--background)",
          }}
        >
          <span className="block text-sm font-medium">{o.label}</span>
          <span className="block text-xs" style={{ color: "var(--muted)" }}>{o.note}</span>
        </button>
      ))}
    </div>
  );
}
