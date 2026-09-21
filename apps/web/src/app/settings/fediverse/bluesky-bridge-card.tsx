"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface BridgeStatus {
  status: "off" | "pending" | "active";
  handle: string;
  profile_url: string;
  has_avatar: boolean;
  requested_at: string | null;
}

/**
 * Settings → Fediverse → Share on Bluesky.
 * Switching on has the writer's Inkwell account follow Bridgy Fed's bot; the
 * bot follows back and the account appears on Bluesky. Switching off blocks it.
 */
export function BlueskyBridgeCard() {
  const [data, setData] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/bluesky", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json.data);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While waiting for the bridge to follow back, check every 10s for 3 minutes.
  useEffect(() => {
    if (data?.status !== "pending") return;
    polls.current = 0;
    const id = setInterval(() => {
      polls.current += 1;
      if (polls.current > 18) return clearInterval(id);
      load();
    }, 10_000);
    return () => clearInterval(id);
  }, [data?.status, load]);

  const change = async (method: "POST" | "DELETE") => {
    if (
      method === "DELETE" &&
      !confirm(
        "Stop sharing on Bluesky? New posts won't appear there, and people following you on Bluesky will stop seeing you. You can switch it back on any time."
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/bluesky", { method });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setData(json.data);
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-labelledby="bluesky-bridge-heading"
    >
      <div className="flex items-start gap-3">
        <ButterflyIcon />
        <div className="flex-1 min-w-0">
          <h2
            id="bluesky-bridge-heading"
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Share on Bluesky
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Your public entries and stickies also appear on Bluesky, where people can follow you,
            like, repost and reply. Their replies show up here as comments.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {loadFailed && !data && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Couldn&apos;t load this just now.{" "}
            <button className="underline" onClick={load}>
              Try again
            </button>
          </p>
        )}

        {!data && !loadFailed && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Loading…
          </p>
        )}

        {data?.status === "active" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span style={{ color: "var(--success, #15803d)" }}>●</span> Live on Bluesky as{" "}
              <a
                href={data.profile_url}
                target="_blank"
                rel="noopener"
                className="font-medium underline underline-offset-2 break-all"
                style={{ color: "var(--accent)" }}
              >
                @{data.handle}
              </a>
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              New public posts appear there within a few minutes. Posts older than two weeks
              aren&apos;t copied over.
            </p>
            <div>
              <button
                onClick={() => change("DELETE")}
                disabled={busy}
                className="text-sm underline underline-offset-2 disabled:opacity-60"
                style={{ color: "var(--muted)" }}
              >
                {busy ? "Stopping…" : "Stop sharing on Bluesky"}
              </button>
            </div>
          </div>
        )}

        {data?.status === "pending" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              <span style={{ color: "var(--accent)" }}>●</span> Setting up — this usually takes a
              minute or two.
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Your Bluesky handle will be <span className="break-all">@{data.handle}</span>.{" "}
              <button className="underline" onClick={load}>
                Check now
              </button>{" "}
              ·{" "}
              <button className="underline" onClick={() => change("DELETE")} disabled={busy}>
                Cancel
              </button>
            </p>
          </div>
        )}

        {data?.status === "off" && (
          <div className="flex flex-col gap-3">
            {!data.has_avatar ? (
              <p className="text-sm">
                Bluesky&apos;s bridge needs a profile picture first.{" "}
                <Link href="/settings/avatar" className="underline" style={{ color: "var(--accent)" }}>
                  Add one
                </Link>
              </p>
            ) : (
              <div>
                <button
                  onClick={() => change("POST")}
                  disabled={busy}
                  className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {busy ? "Switching on…" : "Share my journal on Bluesky"}
                </button>
              </div>
            )}
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              You&apos;ll be <span className="break-all">@{data.handle}</span>. Only public posts are
              shared. This uses{" "}
              <a
                href="https://fed.brid.gy/docs"
                target="_blank"
                rel="noopener"
                className="underline"
              >
                Bridgy Fed
              </a>
              , a free, independent bridge between the fediverse and Bluesky. You can switch it off
              any time.
            </p>
          </div>
        )}

        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2 mt-3"
            style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function ButterflyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>
      <path
        fill="currentColor"
        d="M6.3 3.9C8.6 5.6 11 9 12 10.9c1-1.9 3.4-5.3 5.7-7 1.7-1.2 4.3-2.1 4.3.8 0 .6-.3 4.9-.5 5.6-.7 2.4-3.2 3-5.4 2.7 3.9.7 4.9 2.9 2.8 5.1-4 4.1-5.8-1-6.2-2.3l-.2-.6-.2.6c-.4 1.3-2.2 6.4-6.2 2.3-2.1-2.2-1.1-4.4 2.8-5.1-2.2.3-4.7-.3-5.4-2.7C2.3 9.6 2 5.3 2 4.7c0-2.9 2.6-2 4.3-.8Z"
      />
    </svg>
  );
}
