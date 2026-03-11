"use client";

import { useState } from "react";

export function AcceptDeclineButtons({ username }: { username: string }) {
  const [state, setState] = useState<"idle" | "loading" | "accepted" | "declined">("idle");

  if (state === "accepted") {
    return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Pen Pals ✓</span>;
  }
  if (state === "declined") {
    return <span className="text-xs" style={{ color: "var(--muted)" }}>Declined</span>;
  }

  async function handleAccept() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/accept`, { method: "POST" });
      setState(res.ok ? "accepted" : "idle");
    } catch {
      setState("idle");
    }
  }

  async function handleDecline() {
    setState("loading");
    try {
      await fetch(`/api/follow/${username}/reject`, { method: "DELETE" });
      setState("declined");
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={handleAccept}
        disabled={state === "loading"}
        className="rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Accept
      </button>
      <button
        onClick={handleDecline}
        disabled={state === "loading"}
        className="rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Decline
      </button>
    </div>
  );
}

export function CancelRequestButton({ username }: { username: string }) {
  const [state, setState] = useState<"idle" | "loading" | "cancelled">("idle");

  if (state === "cancelled") {
    return <span className="text-xs" style={{ color: "var(--muted)" }}>Cancelled</span>;
  }

  async function handleCancel() {
    setState("loading");
    try {
      await fetch(`/api/follow/${username}`, { method: "DELETE" });
      setState("cancelled");
    } catch {
      setState("idle");
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={state === "loading"}
      className="rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-80"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {state === "loading" ? "..." : "Cancel"}
    </button>
  );
}
