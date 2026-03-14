"use client";

import { useState } from "react";

type ConnectionType =
  | "pen_pal"       // mutual local — "Remove" with confirm
  | "reading"       // you follow them — "Unfollow"
  | "fediverse_mutual"         // fediverse mutual — "Remove" with confirm
  | "fediverse_following"      // fediverse following — "Unfollow"
  | "fediverse_pending";       // fediverse pending follow — "Cancel"

interface RemoveConnectionButtonProps {
  type: ConnectionType;
  /** For local connections: the username */
  username?: string;
  /** For fediverse connections: the remote_actor_id */
  remoteActorId?: string;
}

export function RemoveConnectionButton({ type, username, remoteActorId }: RemoveConnectionButtonProps) {
  const [state, setState] = useState<"idle" | "confirm" | "loading" | "done">("idle");

  const needsConfirm = type === "pen_pal" || type === "fediverse_mutual";
  const label = type === "pen_pal" || type === "fediverse_mutual"
    ? "Remove"
    : type === "fediverse_pending"
      ? "Cancel"
      : "Unfollow";

  const doneLabel = type === "pen_pal" || type === "fediverse_mutual"
    ? "Removed"
    : type === "fediverse_pending"
      ? "Cancelled"
      : "Unfollowed";

  if (state === "done") {
    return <span className="text-xs" style={{ color: "var(--muted)" }}>{doneLabel}</span>;
  }

  async function handleAction() {
    if (needsConfirm && state !== "confirm") {
      setState("confirm");
      return;
    }

    setState("loading");
    try {
      let res: Response;

      if (type.startsWith("fediverse_") && remoteActorId) {
        // Fediverse unfollow
        res = await fetch("/api/fediverse/unfollow", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remote_actor_id: remoteActorId }),
        });
      } else if (username) {
        // Local unfollow
        res = await fetch(`/api/follow/${username}`, { method: "DELETE" });
      } else {
        setState("idle");
        return;
      }

      setState(res.ok ? "done" : "idle");
    } catch {
      setState("idle");
    }
  }

  if (state === "confirm") {
    return (
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={handleAction}
          className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
          style={{ background: "var(--danger, #dc2626)", color: "#fff" }}
        >
          Confirm
        </button>
        <button
          onClick={() => setState("idle")}
          className="rounded-full border px-2.5 py-1 text-xs transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleAction}
      disabled={state === "loading"}
      className="rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 hover:opacity-80 flex-shrink-0"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {state === "loading" ? "..." : label}
    </button>
  );
}
