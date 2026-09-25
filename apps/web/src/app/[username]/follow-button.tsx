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

  const [error, setError] = useState<string | null>(null);

  // Runs a request; on failure, puts the button back and says so. These used
  // to reset silently (or claim success when the server refused).
  async function run(url: string, method: string, onOk: (res: Response) => Promise<void> | void, fallback: FollowState) {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(url, { method });
      if (res.ok) {
        await onOk(res);
      } else {
        const data = await res.json().catch(() => ({}));
        setError((typeof data.error === "string" && data.error) || "That didn't go through. Please try again.");
        setState(fallback);
      }
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
      setState(fallback);
    }
  }

  async function handleSendRequest() {
    if (!isLoggedIn) {
      window.location.href = `/login?next=${encodeURIComponent(`/${targetUsername}`)}`;
      return;
    }
    await run(`/api/follow/${targetUsername}`, "POST", async (res) => {
      const data = await res.json().catch(() => ({}));
      setState(data.status === "accepted" ? "pen_pals" : "pending");
    }, "idle");
  }

  async function handleCancel() {
    if (!window.confirm(`Unfollow @${targetUsername}? This cancels your pen pal request, and their entries leave your Feed.`)) return;
    await run(`/api/follow/${targetUsername}`, "DELETE", () => setState("idle"), "pending");
  }

  async function handleRemove() {
    if (!window.confirm(`Stop being pen pals with @${targetUsername}? You'll stop seeing their pen-pals-only entries.`)) return;
    await run(`/api/follow/${targetUsername}`, "DELETE", () => setState("idle"), "pen_pals");
  }

  async function handleAccept() {
    await run(`/api/follow/${targetUsername}/accept`, "POST", () => setState("pen_pals"), "incoming");
  }

  async function handleDecline() {
    await run(`/api/follow/${targetUsername}/reject`, "DELETE", () => setState("idle"), "incoming");
  }

  const errorNote = error ? (
    <p className="text-xs mt-1" role="alert" style={{ color: "var(--danger)" }}>{error}</p>
  ) : null;

  return (
    <div className="inline-flex flex-col">
      {renderButton()}
      {state === "pending" && !error && (
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Their public entries are in your Feed now. You&apos;ll be pen pals once @{targetUsername} accepts.
        </p>
      )}
      {errorNote}
    </div>
  );

  function renderButton() {
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
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
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

  // Following, waiting for them to accept: click to unfollow
  if (state === "pending") {
    return (
      <button
        onClick={handleCancel}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        {hovered ? "Unfollow" : "Following"}
      </button>
    );
  }

  // Idle: "Follow" (sends a pen pal request)
  return (
    <button
      onClick={handleSendRequest}
      disabled={state === "loading"}
      className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
      title="Their public entries come to your Feed; you're pen pals once they accept"
    >
      {state === "loading" ? "..." : "Follow"}
    </button>
  );
  }
}
