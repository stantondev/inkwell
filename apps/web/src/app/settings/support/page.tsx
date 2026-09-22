"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { detectService, getServiceIconSvg } from "@/lib/support-services";

interface TipStats {
  all_time_total_cents: number;
  all_time_count: number;
  month_total_cents: number;
  month_count: number;
}

function formatStatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

interface UserData {
  support_url?: string | null;
  support_label?: string | null;
  subscription_tier?: string;
  stripe_connect_account_id?: string | null;
  stripe_connect_enabled?: boolean;
  stripe_connect_onboarded?: boolean;
  has_writer_plan?: boolean;
}

export default function SupportSettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipStats, setTipStats] = useState<TipStats | null>(null);

  // Support link form state
  const [supportUrl, setSupportUrl] = useState("");
  const [supportLabel, setSupportLabel] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkStatus, setLinkStatus] = useState<"idle" | "success" | "error">("idle");
  const [linkError, setLinkError] = useState("");

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
    // Fetch tip stats (historical data still available)
    fetch("/api/tips/stats")
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.data) setTipStats(data.data); })
      .catch(() => {});
  }, []);

  async function handleSaveLink() {
    // `user` is only set once /api/me loaded. Saving the empty form without it
    // would erase the writer's existing support link.
    if (!user) {
      setLinkStatus("error");
      setLinkError("Couldn't load your current support link, so nothing was saved. Reload the page to try again.");
      return;
    }
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
      {/* Section 1: External Support Link (all users) */}
      <div className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-base font-semibold mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
          External Payment Link
        </h2>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Link to your Ko-fi, Buy Me a Coffee, Patreon, or any payment page.
          A button will appear on your profile and at the bottom of your entries. Free for all users.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Payment URL</label>
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

      {/* Past postage (Postage is retired; only shown to writers who received some) */}
      {tipStats && tipStats.all_time_count > 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          You received {formatStatDollars(tipStats.all_time_total_cents)} in postage before it was retired.{" "}
          <a href="/settings/support/postage" className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
            See the history &rarr;
          </a>
        </p>
      )}
    </div>
  );
}
