"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { detectService, getServiceIconSvg } from "@/lib/support-services";

interface ConnectStatus {
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  onboarded: boolean;
  account_id?: string;
}

interface UserData {
  support_url?: string | null;
  support_label?: string | null;
  subscription_tier?: string;
  stripe_connect_account_id?: string | null;
  stripe_connect_enabled?: boolean;
  stripe_connect_onboarded?: boolean;
}

export default function SupportSettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [user, setUser] = useState<UserData | null>(null);
  const [connectStatus, setConnectStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectLoading, setConnectLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  // Support link form state
  const [supportUrl, setSupportUrl] = useState("");
  const [supportLabel, setSupportLabel] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkStatus, setLinkStatus] = useState<"idle" | "success" | "error">("idle");
  const [linkError, setLinkError] = useState("");

  const onboardingComplete = searchParams.get("onboarding") === "complete";
  const refreshNeeded = searchParams.get("refresh") === "true";

  const fetchConnectStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/tipping/connect/status");
      if (res.ok) {
        const data = await res.json();
        setConnectStatus(data.data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          const u = data.data;
          setUser(u);
          setSupportUrl(u.support_url || "");
          setSupportLabel(u.support_label || "");
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    fetchConnectStatus();
  }, [fetchConnectStatus]);

  // Refresh connect status when returning from onboarding
  useEffect(() => {
    if (onboardingComplete || refreshNeeded) {
      fetchConnectStatus();
      // Clean up URL params
      router.replace("/settings/support");
    }
  }, [onboardingComplete, refreshNeeded, fetchConnectStatus, router]);

  async function handleSaveLink() {
    setLinkSaving(true);
    setLinkStatus("idle");
    setLinkError("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          support_url: supportUrl || null,
          support_label: supportLabel || null,
        }),
      });
      if (res.ok) {
        setLinkStatus("success");
        router.refresh();
      } else {
        const data = await res.json();
        setLinkError(data.error || "Failed to save");
        setLinkStatus("error");
      }
    } catch {
      setLinkError("Network error — please try again");
      setLinkStatus("error");
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleConnect() {
    setConnectLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tipping/connect", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to start setup");
        setConnectLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setConnectLoading(false);
    }
  }

  async function handleRefreshOnboarding() {
    setConnectLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tipping/connect/refresh", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Unable to resume setup");
        setConnectLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setConnectLoading(false);
    }
  }

  async function handleDashboard() {
    setDashboardLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tipping/connect/dashboard", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      } else {
        setError(data.error || "Unable to open dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function handleDisconnect() {
    setDisconnectLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tipping/connect/disconnect", { method: "POST" });
      if (res.ok) {
        setConnectStatus({ connected: false, charges_enabled: false, payouts_enabled: false, onboarded: false });
        setShowDisconnectConfirm(false);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Unable to disconnect");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDisconnectLoading(false);
    }
  }

  const isPlus = user?.subscription_tier === "plus";
  const isConnected = connectStatus?.connected === true;
  const isFullyOnboarded = connectStatus?.charges_enabled === true;
  const isPending = isConnected && !isFullyOnboarded;

  const inputClass = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:ring-2 focus:ring-[var(--accent)] transition";
  const inputStyle = { borderColor: "var(--border)" };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-pulse text-sm" style={{ color: "var(--muted)" }}>
          Loading support settings...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Onboarding complete banner */}
      {onboardingComplete && (
        <div className="rounded-xl border p-4 text-sm"
          style={{ borderColor: "var(--success)", background: "var(--surface)" }}>
          <span className="font-medium" style={{ color: "var(--success)" }}>
            Stripe setup complete!
          </span>{" "}
          Your account is being verified. Tips will be enabled once Stripe confirms your account.
        </div>
      )}

      {/* Section 1: External Support Link (all users) */}
      <div className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-base font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          External Support Link
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Add a link to your Ko-fi, Buy Me a Coffee, Patreon, or any support page.
          It will appear on your profile and at the bottom of your entries.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Support URL</label>
            <input
              type="url"
              value={supportUrl}
              maxLength={500}
              onChange={e => setSupportUrl(e.target.value)}
              placeholder="https://ko-fi.com/yourname"
              className={inputClass}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Button label</label>
            <input
              type="text"
              value={supportLabel}
              maxLength={50}
              onChange={e => setSupportLabel(e.target.value)}
              placeholder="Support My Writing"
              className={inputClass}
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              Leave blank to use the default label.
            </p>
          </div>

          {supportUrl && supportUrl.startsWith("https://") && (
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>Preview</label>
              <div
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                <span
                  dangerouslySetInnerHTML={{ __html: getServiceIconSvg(detectService(supportUrl).icon) }}
                  style={{ color: detectService(supportUrl).color }}
                />
                {supportLabel || "Support My Writing"}
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
                Detected: {detectService(supportUrl).name}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4 pt-1">
            <button
              onClick={handleSaveLink}
              disabled={linkSaving}
              className="rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60 transition"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {linkSaving ? "Saving..." : "Save link"}
            </button>
            {linkStatus === "success" && (
              <span className="text-sm font-medium" style={{ color: "var(--success)" }}>Saved</span>
            )}
            {linkStatus === "error" && (
              <span className="text-sm" style={{ color: "var(--danger)" }}>{linkError}</span>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Integrated Tips via Stripe Connect (Plus only) */}
      <div className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Integrated Tips
          </h2>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}>
            Plus
          </span>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
          Let readers tip you directly on Inkwell. Payments are processed by Stripe.
          You receive 92% of each tip — Inkwell takes an 8% platform fee.
        </p>

        {!isPlus ? (
          /* Non-Plus: show upgrade prompt */
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              Integrated tips are available for Inkwell Plus members. Upgrade to let readers
              support you directly without leaving the platform.
            </p>
            <a href="/settings/billing"
              className="inline-flex rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Upgrade to Plus — $5/mo
            </a>
          </div>
        ) : isFullyOnboarded ? (
          /* Fully connected and enabled */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--success)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--success)" }}>
                Tips are active
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Readers can now tip you on your profile and entries. Tips are deposited to your
              connected Stripe account.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleDashboard}
                disabled={dashboardLoading}
                className="rounded-lg px-4 py-2 text-sm font-medium border transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              >
                {dashboardLoading ? "Opening..." : "View Stripe Dashboard"}
              </button>

              {!showDisconnectConfirm ? (
                <button
                  onClick={() => setShowDisconnectConfirm(true)}
                  className="text-xs font-medium transition-colors"
                  style={{ color: "var(--muted)" }}
                >
                  Disconnect
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--danger)" }}>
                    Disconnect Stripe account?
                  </span>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnectLoading}
                    className="rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                    style={{ background: "var(--danger)", color: "#fff" }}
                  >
                    {disconnectLoading ? "..." : "Yes, disconnect"}
                  </button>
                  <button
                    onClick={() => setShowDisconnectConfirm(false)}
                    className="text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : isPending ? (
          /* Account created but onboarding not complete */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--warning, #f59e0b)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--warning, #f59e0b)" }}>
                Onboarding in progress
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Your Stripe account has been created but setup isn&apos;t complete yet.
              Continue the onboarding process to start receiving tips.
            </p>

            <button
              onClick={handleRefreshOnboarding}
              disabled={connectLoading}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {connectLoading ? "Redirecting..." : "Continue setup"}
            </button>
          </div>
        ) : (
          /* Not connected yet */
          <div className="space-y-4">
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-sm font-medium mb-2">How it works</h3>
              <ul className="text-xs space-y-1.5" style={{ color: "var(--muted)" }}>
                <li className="flex gap-2 items-start">
                  <span style={{ color: "var(--accent)" }}>1.</span>
                  Connect your Stripe account (takes about 5 minutes)
                </li>
                <li className="flex gap-2 items-start">
                  <span style={{ color: "var(--accent)" }}>2.</span>
                  A tip button appears on your profile and entries
                </li>
                <li className="flex gap-2 items-start">
                  <span style={{ color: "var(--accent)" }}>3.</span>
                  Readers choose an amount ($1–$100) and pay via card or Apple/Google Pay
                </li>
                <li className="flex gap-2 items-start">
                  <span style={{ color: "var(--accent)" }}>4.</span>
                  You receive 92% of each tip directly to your bank account
                </li>
              </ul>
            </div>

            <button
              onClick={handleConnect}
              disabled={connectLoading}
              className="rounded-lg px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {connectLoading ? "Redirecting to Stripe..." : "Enable Tips"}
            </button>

            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Stripe handles all payments, identity verification, and tax reporting.
              Inkwell never has access to your bank details.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--danger)" }}>{error}</p>
        )}
      </div>

      {/* Fee info */}
      <div className="text-xs space-y-1" style={{ color: "var(--muted)" }}>
        <p>
          <strong>Fee breakdown:</strong> Inkwell takes 8% of each tip. Readers pay a small
          processing fee on top (2.9% + $0.30, charged by Stripe). You receive 92% of the tip amount.
        </p>
        <p>
          Tips are one-time voluntary contributions. See our{" "}
          <a href="/terms" className="underline" target="_blank" rel="noopener noreferrer">Terms of Service</a>{" "}
          for details.
        </p>
      </div>
    </div>
  );
}
