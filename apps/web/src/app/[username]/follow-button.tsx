"use client";

import { useState } from "react";

type FollowState = "idle" | "following" | "pending" | "loading";

export function FollowButton({ targetUsername }: { targetUsername: string }) {
  const [state, setState] = useState<FollowState>("idle");

  async function handleFollow() {
    setState("loading");
    try {
      const res = await fetch(`/api/follow/${targetUsername}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        // relationship status: "pending" if not auto-accepted, "accepted" if mutual
        setState(data.data?.status === "accepted" ? "following" : "pending");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  async function handleUnfollow() {
    setState("loading");
    try {
      await fetch(`/api/follow/${targetUsername}`, { method: "DELETE" });
      setState("idle");
    } catch {
      setState(state === "loading" ? "following" : state);
    }
  }

  if (state === "following") {
    return (
      <button onClick={handleUnfollow}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Reading ✓
      </button>
    );
  }

  if (state === "pending") {
    return (
      <button onClick={handleUnfollow}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
        Requested
      </button>
    );
  }

  return (
    <button onClick={handleFollow} disabled={state === "loading"}
      className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>
      {state === "loading" ? "…" : "Follow"}
    </button>
  );
}
