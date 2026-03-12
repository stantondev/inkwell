"use client";

import { useState } from "react";

export function FediverseFollowBackButton({
  apId,
  isFollowingBack,
}: {
  apId: string;
  isFollowingBack: boolean;
}) {
  const [state, setState] = useState<
    "idle" | "loading" | "pending" | "following"
  >(isFollowingBack ? "following" : "idle");

  async function handleFollow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setState("loading");
    try {
      const res = await fetch("/api/fediverse/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ap_id: apId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.already_following) {
          setState("following");
        } else {
          setState(
            data.data?.status === "accepted" ? "following" : "pending"
          );
        }
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "following") {
    return (
      <span
        className="text-xs px-3 py-1 rounded-full border flex-shrink-0"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Following
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span
        className="text-xs px-3 py-1 rounded-full border flex-shrink-0"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        Requested
      </span>
    );
  }
  return (
    <button
      onClick={handleFollow}
      disabled={state === "loading"}
      className="text-xs px-3 py-1 rounded-full border font-medium transition-colors disabled:opacity-50 flex-shrink-0"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
    >
      {state === "loading" ? "..." : "Follow Back"}
    </button>
  );
}
