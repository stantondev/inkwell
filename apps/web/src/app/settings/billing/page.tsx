"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface BillingStatus {
  subscription_tier: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  ink_donor_status: string | null;
  ink_donor_amount_cents: number | null;
}

function InkDropIcon({ size = 10 }: { size?: number }) {
  const h = Math.round(size * 1.2);
  return (
    <svg width={size} height={h} viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
      <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
    </svg>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [donorLoading, setDonorLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAmount, setSelectedAmount] = useState(200);

  const justSucceeded = searchParams.get("success") === "true";
  const justCanceled = searchParams.get("canceled") === "true";
  const justDonored = justSucceeded && searchParams.get("donor") === "true";

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

  async function handlePortal() {
    setPortalLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to open billing portal");
        setPortalLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setPortalLoading(false);
    }
  }

  const isPlus = status?.subscription_tier === "plus";
  const isPastDue = status?.subscription_status === "past_due";
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

  return (
    <div className="flex flex-col gap-6">
      {/* Success/cancel banners */}
      {justSucceeded && !justDonored && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--success)", background: "var(--surface)" }}>
          <span className="font-medium" style={{ color: "var(--success)" }}>
            Welcome to Inkwell Plus!
          </span>{" "}
          Your subscription is now active. Thank you for supporting Inkwell.
        </div>
      )}
      {justDonored && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--ink-deep, #2d4a8a)", background: "var(--surface)" }}>
          <span className="font-medium" style={{ color: "var(--ink-deep, #2d4a8a)" }}>
            Thank you, Ink Donor!
          </span>{" "}
          Your donation is now active. Every drop helps keep Inkwell ad-free.
        </div>
      )}
      {justCanceled && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          Checkout was canceled. No charges were made.
        </div>
      )}

      {/* Past due warning */}
      {isPastDue && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--danger)", background: "var(--surface)" }}>
          <span className="font-medium" style={{ color: "var(--danger)" }}>
            Payment issue
          </span>{" "}
          — Your last payment failed. Please update your payment method to keep your Plus benefits.
        </div>
      )}

      {/* Current plan */}
      <div className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Your Plan</h2>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              background: isPlus ? "var(--accent)" : "var(--surface-hover, #333)",
              color: isPlus ? "#fff" : "var(--muted)",
            }}>
            {isPlus ? "Plus" : "Free"}
          </span>
        </div>

        {isPlus ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re an Inkwell Plus member. Thank you for supporting the platform!
            </p>
            {status?.subscription_expires_at && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Current period ends:{" "}
                {new Date(status.subscription_expires_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
            <button onClick={handlePortal} disabled={portalLoading}
              className="self-start rounded-full px-5 py-2 text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              {portalLoading ? "Opening..." : "Manage subscription"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Upgrade to Inkwell Plus for $5/month and unlock extra features while supporting
              an ad-free, algorithm-free platform.
            </p>
            <ul className="text-sm space-y-1.5" style={{ color: "var(--muted)" }}>
              {[
                "Unlimited newsletter subscribers, 8 sends/mo (Free: 500 subs, 2 sends/mo)",
                "Custom newsletter name & reply-to",
                "Scheduled newsletter sends",
                "Unlimited version history (Free: 25 per entry)",
                "Unlimited series & collections (Free: 5 max)",
                "1 GB image storage (Free: 100 MB)",
                "Unlimited drafts (Free: 10 max)",
                "Unlimited pen pal filters (Free: 5 max)",
                "Integrated Postage (reader support payments)",
                "Paid subscription plans (earn from your writing)",
                "API read + write access, 300 req/15 min (Free: read-only, 100 req/15 min)",
                "Custom colors, fonts & layouts",
                "Background images & profile music",
                "Widget reordering",
                "Custom HTML & CSS theming",
                "First Class stamp",
                "Plus badge on your profile",
                "Priority support",
              ].map((item) => (
                <li key={item} className="flex gap-2 items-start">
                  <span style={{ color: "var(--accent)" }} aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <button onClick={handleCheckout} disabled={checkoutLoading}
              className="self-start rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}>
              {checkoutLoading ? "Redirecting to checkout..." : "Upgrade to Plus — $5/mo"}
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--danger)" }}>{error}</p>
        )}
      </div>

      {/* Ink Donor section */}
      <div className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Ink Donor
          </h2>
          {isDonor && (
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "var(--ink-deep, #2d4a8a)", color: "#fff", opacity: 0.9 }}>
              <InkDropIcon size={8} />
              Active
            </span>
          )}
        </div>

        {isDonor ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              You&apos;re donating <strong style={{ color: "var(--foreground)" }}>${((status?.ink_donor_amount_cents ?? 0) / 100).toFixed(0)}/month</strong> to
              help keep Inkwell running. Thank you for being an Ink Donor — every drop of ink helps.
            </p>
            <button onClick={handlePortal} disabled={portalLoading}
              className="self-start rounded-full px-5 py-2 text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              {portalLoading ? "Opening..." : "Manage donation"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              <em style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>Keep the ink flowing.</em>
            </p>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Ink Donor is a small voluntary donation to help sustain Inkwell. No features are unlocked —
              just the satisfaction of keeping an ad-free, community-owned platform alive, and an Ink Donor
              badge on your profile.
            </p>

            {isDonorPastDue && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                Your last donation payment failed. You can start a new donation below.
              </p>
            )}

            <div className="flex gap-3 items-center">
              {[100, 200, 300].map((cents) => (
                <button
                  key={cents}
                  onClick={() => setSelectedAmount(cents)}
                  className="rounded-full px-5 py-2 text-sm font-medium border-2 transition-all"
                  style={{
                    borderColor: selectedAmount === cents ? "var(--ink-deep, #2d4a8a)" : "var(--border)",
                    color: selectedAmount === cents ? "#fff" : "var(--ink-deep, #2d4a8a)",
                    background: selectedAmount === cents ? "var(--ink-deep, #2d4a8a)" : "transparent",
                  }}>
                  ${cents / 100}/mo
                </button>
              ))}
            </div>

            <button
              onClick={() => handleDonorCheckout(selectedAmount)}
              disabled={donorLoading}
              className="self-start inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--ink-deep, #2d4a8a)", color: "#fff" }}>
              <InkDropIcon size={10} />
              {donorLoading ? "Redirecting..." : "Become an Ink Donor"}
            </button>
          </div>
        )}
      </div>

      {/* Info footer */}
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Payments are securely processed by Stripe. You can cancel anytime from
        the billing portal. Inkwell never sees your card details.
      </p>
    </div>
  );
}
