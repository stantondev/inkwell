"use client";

import { useState, useEffect } from "react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const STORAGE_KEY = "inkwell-push-prompt-dismissed";

interface PushPromptProps {
  serverDismissed?: boolean;
}

export function PushPrompt({ serverDismissed }: PushPromptProps) {
  const { supported, permission, subscribed, loading, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(true); // default hidden until checked
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    const wasDismissed = serverDismissed || localStorage.getItem(STORAGE_KEY) === "true";
    setDismissed(wasDismissed);
  }, [serverDismissed]);

  // Show after a brief delay for a smoother experience
  useEffect(() => {
    if (!loading && supported && permission !== "denied" && !subscribed && !dismissed) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [loading, supported, permission, subscribed, dismissed]);

  const handleEnable = async () => {
    setEnabling(true);
    await subscribe();
    setEnabling(false);
    handleDismiss();
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { push_prompt_dismissed: true } }),
    }).catch(() => {});
    setTimeout(() => setDismissed(true), 300);
  };

  if (dismissed || !visible || subscribed || !supported || permission === "denied") {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 mb-4">
      <div
        className="rounded-xl border-l-4 p-4 transition-opacity duration-300"
        style={{
          borderLeftColor: "var(--accent)",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
          opacity: visible ? 1 : 0,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "var(--accent)" }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium mb-1" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              Stay in the loop
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              Get notified when someone sends you a letter, comments on your entry, or wants to be your pen pal — even when you&apos;re not on Inkwell.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleEnable}
                disabled={enabling}
                className="rounded-lg px-3.5 py-1.5 text-xs font-medium transition-opacity disabled:opacity-60"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {enabling ? "Enabling..." : "Enable notifications"}
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg px-3 py-1.5 text-xs transition-colors"
                style={{ color: "var(--muted)" }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
