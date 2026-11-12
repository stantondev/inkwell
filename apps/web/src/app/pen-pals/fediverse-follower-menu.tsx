"use client";

import { useRef, useState } from "react";
import { FloatingPopup } from "@/components/floating-popup";

/**
 * ⋯ menu on a fediverse connection in Pen Pals: remove them as a follower
 * (when they follow you) or block them. Both tell their server, so they stop
 * getting your posts.
 */
export function FediverseFollowerMenu({
  remoteActorId,
  handle,
  followsYou,
  onDone,
}: {
  remoteActorId: string;
  handle: string;
  followsYou: boolean;
  onDone: (result: "removed" | "blocked") => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<"remove" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setConfirming(null);
    setError(null);
  }

  async function run(action: "remove" | "block") {
    setBusy(true);
    setError(null);
    try {
      const res =
        action === "remove"
          ? await fetch(`/api/fediverse-followers/${remoteActorId}`, { method: "DELETE" })
          : await fetch("/api/fediverse-blocks/actors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ remote_actor_id: remoteActorId }),
            });

      if (res.ok) {
        close();
        onDone(action === "remove" ? "removed" : "blocked");
      } else {
        setError("That didn't work. Try again in a moment.");
      }
    } catch {
      setError("That didn't work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={`More for ${handle}`}
        aria-expanded={open}
        className="ppf-menu-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <FloatingPopup
        anchorRef={btnRef}
        open={open}
        onClose={close}
        placement="bottom"
        align="end"
        className="ppf-menu rounded-xl border shadow-lg"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {confirming ? (
          <div className="ppf-confirm">
            <p className="ppf-confirm-text">
              {confirming === "remove" ? (
                <>
                  Remove <strong>{handle}</strong> as a follower? They stop getting your posts. They can
                  follow you again.
                </>
              ) : (
                <>
                  Block <strong>{handle}</strong>? They stop following you and can&apos;t follow again,
                  reply, or write to you.{followsYou ? "" : " If you follow them, that stops too."}
                </>
              )}
            </p>
            {error && <p className="ppf-error">{error}</p>}
            <div className="ppf-confirm-actions">
              <button type="button" className="ppf-cancel" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="ppf-danger" onClick={() => run(confirming)} disabled={busy}>
                {busy ? "…" : confirming === "remove" ? "Remove" : "Block"}
              </button>
            </div>
          </div>
        ) : (
          <div role="menu">
            {followsYou && (
              <button type="button" role="menuitem" className="ppf-item" onClick={() => setConfirming("remove")}>
                Remove follower
              </button>
            )}
            <button type="button" role="menuitem" className="ppf-item ppf-item-danger" onClick={() => setConfirming("block")}>
              Block
            </button>
          </div>
        )}
      </FloatingPopup>
    </>
  );
}
