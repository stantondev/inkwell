"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface BillingStatus {
  subscription_tier: string;
  subscription_status: string;
  subscription_expires_at: string | null;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const justSucceeded = searchParams.get("success") === "true";
  const justCanceled = searchParams.get("canceled") === "true";

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
      {justSucceeded && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--success)", background: "var(--surface)" }}>
          <span className="font-medium" style={{ color: "var(--success)" }}>
            Welcome to Inkwell Plus!
          </span>{" "}
          Your subscription is now active. Thank you for supporting Inkwell.
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
                "Custom domain for your journal",
                "Extended media storage",
                "Advanced profile CSS/HTML theming",
                "Accept reader tips",
                "Priority support",
                "Plus badge on your profile",
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

      {/* Info footer */}
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Payments are securely processed by Stripe. You can cancel anytime from
        the billing portal. Inkwell never sees your card details.
      </p>
    </div>
  );
}
