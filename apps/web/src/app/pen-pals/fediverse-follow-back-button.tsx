"use client";

import { useState } from "react";

export function FediverseFollowBackButton({
  apId,
  isFollowingBack,
  initialRelationship,
}: {
  apId: string;
  isFollowingBack?: boolean;
  initialRelationship?: string;
}) {
  // Derive initial state from relationship or legacy isFollowingBack
  const getInitialState = () => {
    if (initialRelationship === "mutual") return "mutual";
    if (initialRelationship === "follower_following_pending") return "pending";
    if (isFollowingBack) return "following";
    return "idle";
  };

  const [state, setState] = useState<
    "idle" | "loading" | "pending" | "following" | "mutual"
  >(getInitialState);

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
          // Already following + they follow us = mutual
          setState("mutual");
        } else if (data.data?.status === "accepted") {
          setState("mutual");
        } else {
          setState("pending");
        }
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "mutual") {
    return (
      <span
        className="text-xs px-3 py-1 rounded-full font-medium flex-shrink-0"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
      >
        Pen Pals
      </span>
    );
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
