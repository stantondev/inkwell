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

function InkDropIcon({ size = 10 }: { size?: number }) {
  const h = Math.round(size * 1.2);
  return (
    <svg width={size} height={h} viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
      <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
    </svg>
  );
}

function OrnamentDivider() {
  return (
    <div className="billing-ornament" aria-hidden="true">
      · · ·
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2.5 7 5.5 10 11.5 4" />
    </svg>
  );
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

  // Self-hosted mode
  if (status?.self_hosted) {
    return (
      <div className="billing-page">
        <div className="billing-card">
          <div className="billing-card-header">
            <h2 className="billing-heading">Self-Hosted Instance</h2>
            <span className="billing-badge billing-badge--plus">Plus</span>
          </div>
          <p className="billing-text-muted">
            All Plus features are included with your self-hosted instance.
            No subscription required.
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
    <div className="billing-page">
      {/* Banners */}
      {status?.needs_resubscribe && (
        <div className="billing-banner billing-banner--accent">
          <strong>Restore your subscription</strong> — We&apos;ve switched payment processors.
          Your previous subscription is no longer active. Re-subscribe below to restore your benefits.
        </div>
      )}

      {justSucceeded && !justDonored && !justDonated && (
        <div className="billing-banner billing-banner--success">
          <strong>Welcome to Inkwell Plus!</strong> Your subscription is now active. Thank you for supporting Inkwell.
        </div>
      )}
      {justDonored && (
        <div className="billing-banner billing-banner--ink">
          <strong>Thank you, Ink Donor!</strong> Your donation is now active. Every drop helps keep Inkwell ad-free.
        </div>
      )}
      {justDonated && (
        <div className="billing-banner billing-banner--ink">
          <strong>Thank you for your donation!</strong> Your generosity helps keep Inkwell ad-free and community-owned.
        </div>
      )}
      {justCanceled && (
        <div className="billing-banner billing-banner--muted">
          Checkout was canceled. No charges were made.
        </div>
      )}
      {isPastDue && (
        <div className="billing-banner billing-banner--danger">
          <strong>Payment issue</strong> — Your last payment failed. Please update your payment method to keep your Plus benefits.
        </div>
      )}

      {error && (
        <div className="billing-banner billing-banner--danger">{error}</div>
      )}

      {/* ═══ Your Plan ═══ */}
      <div className="billing-card">
        <div className="billing-card-header">
          <h2 className="billing-heading">Your Plan</h2>
          <span className={`billing-badge ${isPlus ? "billing-badge--plus" : "billing-badge--free"}`}>
            {isPlus ? "✦ Plus" : "Free"}
          </span>
        </div>

        {isPlus ? (
          <div className="billing-card-body">
            <p className="billing-text-muted">
              You&apos;re an Inkwell Plus member. Thank you for supporting the platform!
            </p>
            {status?.subscription_expires_at && (
              <p className="billing-text-detail">
                Current period ends:{" "}
                {new Date(status.subscription_expires_at).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            )}
            {isCanceled ? (
              <p className="billing-text-muted">
                Your subscription has been canceled. You&apos;ll retain Plus features until the end of your current billing period.
              </p>
            ) : !showCancelConfirm ? (
              <button onClick={() => setShowCancelConfirm(true)} className="billing-btn billing-btn--outline">
                Cancel subscription
              </button>
            ) : (
              <div className="billing-confirm-box">
                <p className="billing-text-sm">
                  Are you sure? You&apos;ll lose access to Plus features at the end of your billing period.
                </p>
                <div className="billing-confirm-actions">
                  <button onClick={handleCancel} disabled={cancelLoading} className="billing-btn billing-btn--danger">
                    {cancelLoading ? "Canceling..." : "Yes, cancel"}
                  </button>
                  <button onClick={() => setShowCancelConfirm(false)} className="billing-btn-text">
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="billing-card-body">
            <p className="billing-text-muted" style={{ marginBottom: "1rem" }}>
              Upgrade to Inkwell Plus for <strong style={{ color: "var(--foreground)" }}>$5/month</strong> and
              unlock premium features while supporting an ad-free, algorithm-free platform.
            </p>
            <ul className="billing-feature-list">
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
                <li key={item} className="billing-feature-item">
                  <span className="billing-feature-check"><CheckIcon /></span>
                  {item}
                </li>
              ))}
            </ul>
            <button onClick={handleCheckout} disabled={checkoutLoading} className="billing-btn billing-btn--primary">
              {checkoutLoading ? "Redirecting to checkout..." : "Upgrade to Plus — $5/mo"}
            </button>
          </div>
        )}
      </div>

      <OrnamentDivider />

      {/* ═══ Ink Donor ═══ */}
      <div className="billing-card billing-card--ink">
        <div className="billing-card-header">
          <h2 className="billing-heading">
            <InkDropIcon size={14} /> Ink Donor
          </h2>
          {isDonor && (
            <span className="billing-badge billing-badge--ink">
              <InkDropIcon size={8} /> Active
            </span>
          )}
        </div>

        <p className="billing-tagline">Keep the ink flowing.</p>

        {isDonor ? (
          <div className="billing-card-body">
            <p className="billing-text-muted">
              You&apos;re donating <strong style={{ color: "var(--foreground)" }}>${((status?.ink_donor_amount_cents ?? 0) / 100).toFixed(0)}/month</strong> to
              help keep Inkwell running. Every drop of ink helps.
            </p>
            {!showCancelDonorConfirm ? (
              <button onClick={() => setShowCancelDonorConfirm(true)} className="billing-btn billing-btn--outline">
                Cancel donation
              </button>
            ) : (
              <div className="billing-confirm-box">
                <p className="billing-text-sm">
                  Are you sure you want to cancel your Ink Donor subscription?
                </p>
                <div className="billing-confirm-actions">
                  <button onClick={handleCancelDonor} disabled={cancelDonorLoading} className="billing-btn billing-btn--danger">
                    {cancelDonorLoading ? "Canceling..." : "Yes, cancel"}
                  </button>
                  <button onClick={() => setShowCancelDonorConfirm(false)} className="billing-btn-text">
                    Never mind
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="billing-card-body">
            <p className="billing-text-muted">
              A small voluntary donation to help sustain Inkwell. No features unlocked —
              just the satisfaction of keeping an ad-free platform alive, and an Ink Donor badge on your profile.
            </p>

            {isDonorPastDue && (
              <p className="billing-text-danger">
                Your last donation payment failed. You can start a new donation below.
              </p>
            )}

            {/* Monthly recurring */}
            <div className="billing-amount-section">
              <p className="billing-section-label">Monthly recurring</p>
              <div className="billing-pill-row">
                {[100, 200, 300].map((cents) => (
                  <button
                    key={cents}
                    onClick={() => setSelectedAmount(cents)}
                    className={`billing-pill ${selectedAmount === cents ? "billing-pill--active" : ""}`}>
                    ${cents / 100}/mo
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleDonorCheckout(selectedAmount)}
                disabled={donorLoading}
                className="billing-btn billing-btn--ink">
                <InkDropIcon size={10} />
                {donorLoading ? "Redirecting..." : "Become an Ink Donor"}
              </button>
            </div>

            {/* One-time donation */}
            <div className="billing-amount-section billing-amount-section--bordered">
              <p className="billing-section-label">One-time donation</p>
              <div className="billing-pill-row">
                {[300, 500, 1000].map((cents) => (
                  <button
                    key={cents}
                    onClick={() => { setSelectedDonation(cents); setCustomDonation(""); }}
                    className={`billing-pill ${selectedDonation === cents && !customDonation ? "billing-pill--active" : ""}`}>
                    ${cents / 100}
                  </button>
                ))}
                <div className="billing-custom-amount">
                  <span className="billing-custom-dollar">$</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    step="1"
                    placeholder="Custom"
                    value={customDonation}
                    onChange={(e) => setCustomDonation(e.target.value)}
                    className="billing-custom-input"
                  />
                </div>
              </div>
              <button
                onClick={() => handleDonate(donationAmount)}
                disabled={donateLoading || !donationValid}
                className="billing-btn billing-btn--ink-outline">
                <InkDropIcon size={10} />
                {donateLoading ? "Redirecting..." : `Donate${donationValid ? ` $${(donationAmount / 100).toFixed(donationAmount % 100 === 0 ? 0 : 2)}` : ""}`}
              </button>
              {customDonation && !donationValid && (
                <p className="billing-text-detail" style={{ marginTop: "0.5rem" }}>
                  Donations can be between $1 and $500.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <OrnamentDivider />

      {/* ═══ Paused Features ═══ */}
      <div className="billing-card billing-card--muted">
        <div className="billing-card-header">
          <h2 className="billing-heading">Postage</h2>
          <span className="billing-badge billing-badge--paused">Paused</span>
        </div>
        <p className="billing-text-muted">
          Postage (reader support payments) is temporarily unavailable while we switch payment processors.
          It will return soon. Your postage history is preserved.
        </p>
      </div>

      <div className="billing-card billing-card--muted">
        <div className="billing-card-header">
          <h2 className="billing-heading">Writer Subscription Plans</h2>
          <span className="billing-badge billing-badge--paused">Paused</span>
        </div>
        <p className="billing-text-muted">
          Writer subscription plans are temporarily unavailable while we switch payment processors.
          They will return soon. Existing paid content remains accessible.
        </p>
      </div>

      {/* Footer */}
      <p className="billing-footer">
        Payments are securely processed by Square. You can cancel anytime from this page.
        Inkwell never sees your card details.
      </p>
    </div>
  );
}
