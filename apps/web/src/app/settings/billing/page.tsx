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

  const justSucceeded = searchParams.get("success") === "true" || searchParams.get("checkout") === "success";
  const justCanceled = searchParams.get("canceled") === "true";
  const justDonored = justSucceeded && searchParams.get("donor") === "true";
  const justDonated = searchParams.get("donation") === "success";

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/billing/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data.data);
        }
      } catch {
        // silently fail — will show as free
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
  }, []);

  async function handleCheckout() {
    setCheckoutLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
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

  async function handleCancel() {
    setCancelLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setShowCancelConfirm(false);
        setStatus(prev => prev ? { ...prev, subscription_status: "canceled" } : prev);
      } else {
        setError(data.error || "Unable to cancel subscription");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelLoading(false);
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

  const isPlus = status?.subscription_tier === "plus";
  const isPastDue = status?.subscription_status === "past_due";
  const isCanceled = status?.subscription_status === "canceled";
  const isDonor = status?.ink_donor_status === "active";
  const isDonorPastDue = status?.ink_donor_status === "past_due";

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
      {status?.needs_resubscribe && (
        <div
          className="rounded-lg p-4 mb-4 text-sm relative"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}
        >
          <strong>Restore your subscription</strong> — We&apos;ve switched payment processors.
          Your previous subscription is no longer active. Re-subscribe below to restore your benefits.
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

      {justSucceeded && !justDonored && !justDonated && (
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
      {isPastDue && (
        <div
          className="rounded-lg p-4 mb-4 text-sm"
          style={{ background: "color-mix(in srgb, var(--danger, #ef4444) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)" }}
        >
          <strong>Payment issue</strong> — Your last payment failed. Please update your payment method to keep your Plus benefits.
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
            {isPlus ? "✦ Plus" : "Free"}
          </span>
        </div>

        {isPlus ? (
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
                "Custom colors, fonts, layouts & themes",
                "Custom HTML & CSS theming",
                "Background images & profile music",
                "Custom domain (your-site.com)",
                "Post by Email",
                "Cross-post to Mastodon",
                "Unlimited newsletters — 8 sends/mo",
                "Unlimited drafts, series & filters",
                "1 GB image storage",
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
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
              style={{ background: "var(--accent)", color: "white", opacity: checkoutLoading ? 0.6 : 1 }}
            >
              {checkoutLoading ? "Redirecting to checkout..." : "Upgrade to Plus — $5/mo"}
            </button>
          </div>
        )}
      </div>

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

      {/* Paused Features */}
      <div
        className="rounded-xl border p-5 mt-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)", opacity: 0.7 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Postage
          </h3>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--surface-hover, var(--border))", color: "var(--muted)" }}
          >
            Paused
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Postage (reader support payments) is temporarily unavailable while we switch payment processors.
          It will return soon. Your postage history is preserved.
        </p>
      </div>

      <div
        className="rounded-xl border p-5 mt-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)", opacity: 0.7 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Writer Subscription Plans
          </h3>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--surface-hover, var(--border))", color: "var(--muted)" }}
          >
            Paused
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Writer subscription plans are temporarily unavailable while we switch payment processors.
          They will return soon. Existing paid content remains accessible.
        </p>
      </div>

      {/* Footer */}
      <p className="text-xs mt-6" style={{ color: "var(--muted)" }}>
        Payments are securely processed by Square. You can cancel anytime from this page.
        Inkwell never sees your card details.
      </p>
    </div>
  );
}
