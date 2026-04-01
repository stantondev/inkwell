"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const DISMISS_KEY = "inkwell-resubscribe-dismissed";

interface ResubscribeBannerProps {
  /** From session: true when user had Stripe subs but hasn't migrated to Square */
  needsResubscribe?: boolean;
  /** Server-side dismissed state from user settings */
  serverDismissed?: boolean;
}

/**
 * Dismissible banner shown to users who had Stripe subscriptions (Plus or Donor)
 * that are now dead after the processor migration to Square. Prompts them to
 * re-subscribe through the new checkout flow.
 */
export function ResubscribeBanner({ needsResubscribe, serverDismissed }: ResubscribeBannerProps) {
  const [dismissed, setDismissed] = useState(serverDismissed ?? false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (serverDismissed) return;
    const stored = localStorage.getItem(DISMISS_KEY);
    if (stored === "true") {
      setDismissed(true);
    }
  }, [serverDismissed]);

  useEffect(() => {
    // Show after a brief delay so it doesn't flash on page load
    if (needsResubscribe && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 300);
      return () => clearTimeout(timer);
    }
  }, [needsResubscribe, dismissed]);

  if (!needsResubscribe || dismissed || !visible) return null;

  function handleDismiss() {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "true");
    // Also persist to server settings so it stays dismissed across devices
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { resubscribe_banner_dismissed: true } }),
    }).catch(() => {});
  }

  return (
    <div
      className="rounded-xl border-2 p-4 sm:p-5 mb-6 relative"
      style={{
        borderColor: "var(--accent)",
        background: "var(--surface)",
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 rounded-full w-6 h-6 flex items-center justify-center text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--muted)" }}
        aria-label="Dismiss"
      >
        ✕
      </button>

      <div className="flex items-start gap-3 pr-6">
        {/* Ink drop icon */}
        <div
          className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: "var(--accent-light)", color: "var(--accent)" }}
        >
          <svg width="18" height="22" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
            <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--accent)", fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Restore your subscription
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            We&apos;ve switched payment processors. Your previous subscription is no longer active.
            Re-subscribe to restore your benefits and help support Inkwell.
          </p>
          <Link
            href="/settings/billing"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden="true">
              <path d="M5 0C5 0 0 5.5 0 8a5 5 0 0 0 10 0C10 5.5 5 0 5 0Z" />
            </svg>
            Go to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}
