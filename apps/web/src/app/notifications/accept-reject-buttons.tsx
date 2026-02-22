"use client";

import { useState } from "react";

type State = "idle" | "loading" | "accepted" | "declined";

export function AcceptRejectButtons({ username }: { username: string }) {
  const [state, setState] = useState<State>("idle");

  async function handleAccept() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/accept`, { method: "POST" });
      if (res.ok) {
        setState("accepted");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  async function handleDecline() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${username}/reject`, { method: "DELETE" });
      if (res.ok) {
        setState("declined");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "accepted") {
    return (
      <span className="text-xs font-medium px-3 py-1 rounded-full"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        Accepted
      </span>
    );
  }

  if (state === "declined") {
    return (
      <span className="text-xs px-3 py-1 rounded-full" style={{ color: "var(--muted)" }}>
        Declined
      </span>
    );
  }

  return (
    <div className="flex gap-2 mt-2">
      <button onClick={handleAccept} disabled={state === "loading"}
        className="text-xs px-3 py-1 rounded-full font-medium transition-opacity disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}>
        {state === "loading" ? "..." : "Accept"}
      </button>
      <button onClick={handleDecline} disabled={state === "loading"}
        className="text-xs px-3 py-1 rounded-full font-medium border transition-colors disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Decline
      </button>
    </div>
  );
}
