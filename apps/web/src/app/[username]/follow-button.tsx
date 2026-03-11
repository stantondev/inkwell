"use client";

import { useState } from "react";

type FollowState = "idle" | "pen_pals" | "pending" | "incoming" | "loading";

export function FollowButton({
  targetUsername,
  initialState = "idle",
  isLoggedIn = true,
}: {
  targetUsername: string;
  initialState?: FollowState;
  isLoggedIn?: boolean;
}) {
  const [state, setState] = useState<FollowState>(initialState);
  const [hovered, setHovered] = useState(false);

  async function handleSendRequest() {
    if (!isLoggedIn) {
      window.location.href = "/get-started";
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${targetUsername}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setState(data.data?.status === "accepted" ? "pen_pals" : "pending");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  async function handleCancel() {
    setState("loading");
    try {
      await fetch(`/api/follow/${targetUsername}`, { method: "DELETE" });
      setState("idle");
    } catch {
      setState("pending");
    }
  }

  async function handleRemove() {
    setState("loading");
    try {
      await fetch(`/api/follow/${targetUsername}`, { method: "DELETE" });
      setState("idle");
    } catch {
      setState("pen_pals");
    }
  }

  async function handleAccept() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${targetUsername}/accept`, { method: "POST" });
      if (res.ok) {
        setState("pen_pals");
      } else {
        setState("incoming");
      }
    } catch {
      setState("incoming");
    }
  }

  async function handleDecline() {
    setState("loading");
    try {
      await fetch(`/api/follow/${targetUsername}/reject`, { method: "DELETE" });
      setState("idle");
    } catch {
      setState("incoming");
    }
  }

  // Incoming request: show Accept + Decline buttons
  if (state === "incoming") {
    return (
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Decline
        </button>
      </div>
    );
  }

  // Mutual pen pals: show "Pen Pals ✓" with hover to "Remove"
  if (state === "pen_pals") {
    return (
      <button
        onClick={handleRemove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        style={{
          borderColor: hovered ? "var(--danger, #ef4444)" : "var(--accent)",
          color: hovered ? "var(--danger, #ef4444)" : "var(--accent)",
          opacity: hovered ? 0.8 : 1,
        }}
      >
        {hovered ? "Remove Pen Pal" : "Pen Pals ✓"}
      </button>
    );
  }

  // Request sent: show "Request Sent" with click to cancel
  if (state === "pending") {
    return (
      <button
        onClick={handleCancel}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        {hovered ? "Cancel Request" : "Request Sent"}
      </button>
    );
  }

  // Idle: show "Send Pen Pal Request"
  return (
    <button
      onClick={handleSendRequest}
      disabled={state === "loading"}
      className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      title="Both of you must accept to become pen pals"
    >
      {state === "loading" ? "..." : "Send Pen Pal Request"}
    </button>
  );
}
