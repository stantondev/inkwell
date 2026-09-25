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

  // One slim line, like the Feed's other notices.
  return (
    <div
      className="notice-strip"
      role="note"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}
    >
      <span className="notice-strip-label">Stay in the loop</span>
      <span className="notice-strip-text">
        Get a notification when someone writes you a letter, leaves a footnote, or asks to be your pen pal.
      </span>
      <button type="button" onClick={handleEnable} disabled={enabling} className="notice-strip-link">
        {enabling ? "Turning on…" : "Turn on notifications"}
      </button>
      <button type="button" onClick={handleDismiss} className="notice-strip-close" aria-label="Not now">
        ×
      </button>
    </div>
  );
}
