"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ButterflyIcon } from "./bluesky-bridge-card";

interface BlueskyAccount {
  id: string;
  did: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  can_post: boolean;
  connected: boolean;
  profile_url: string;
}

/**
 * Settings → Mastodon & Bluesky → Bluesky (your own account).
 * Link a Bluesky account (sign in with it, share entries from it). Sharing
 * asks Bluesky for posting permission separately, so linking alone only
 * proves who you are.
 */
export function BlueskyAccountCard() {
  const params = useSearchParams();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [account, setAccount] = useState<BlueskyAccount | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(params.get("bluesky_error"));
  const justLinked = params.get("bluesky") === "linked";

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/bluesky/account", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setEnabled(!!json.enabled);
      setAccount(json.data ?? null);
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async (posting: boolean) => {
    setBusy(posting ? "posting" : "link");
    setError(null);
    try {
      const res = await fetch("/api/auth/bluesky/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: account ? undefined : handle.trim(), posting }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.authorize_url) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setBusy(null);
        return;
      }
      window.location.href = json.authorize_url;
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
      setBusy(null);
    }
  };

  const unlink = async () => {
    if (!confirm("Unlink your Bluesky account? You won't be able to sign in with it or share entries to it until you link it again.")) return;
    setBusy("unlink");
    setError(null);
    try {
      const res = await fetch("/api/auth/bluesky/account", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Something went wrong. Please try again.");
      else setAccount(null);
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!enabled) return null;

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-labelledby="bluesky-account-heading"
    >
      <div className="flex items-start gap-3">
        <ButterflyIcon />
        <div className="flex-1 min-w-0">
          <h3
            id="bluesky-account-heading"
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Bluesky
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Your own Bluesky account. Entries you share appear there as posts from you.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {justLinked && account && (
          <p className="text-sm" style={{ color: "var(--success, #15803d)" }}>
            ✓ Your Bluesky account is linked.
          </p>
        )}

        {account ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar url={account.avatar_url} name={account.display_name || account.handle || "?"} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{account.display_name || account.handle}</p>
                <a
                  href={account.profile_url}
                  target="_blank"
                  rel="noopener"
                  className="text-xs truncate block underline-offset-2 hover:underline"
                  style={{ color: "var(--muted)" }}
                >
                  @{account.handle || account.did}
                </a>
              </div>
              <button
                type="button"
                onClick={unlink}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-60"
                style={{ borderColor: "var(--border)", color: "var(--danger, #dc2626)" }}
              >
                {busy === "unlink" ? "Unlinking…" : "Unlink"}
              </button>
            </div>

            {!account.connected ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">Bluesky ended this connection. Connect again to keep sharing.</p>
                <div>
                  <button
                    onClick={() => connect(true)}
                    disabled={busy !== null}
                    className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
                    style={{ background: "var(--accent)", color: "var(--background)" }}
                  >
                    {busy ? "Opening Bluesky…" : "Connect again"}
                  </button>
                </div>
              </div>
            ) : account.can_post ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm">
                  <span style={{ color: "var(--success, #15803d)" }}>●</span> Sharing is on. Tick{" "}
                  <strong>@{account.handle}</strong> under Cross-post in the editor&apos;s settings when
                  you publish.
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  If you also give your journal its own Bluesky account (below), people following
                  both will see your entries twice, so use one or the other.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <button
                    onClick={() => connect(true)}
                    disabled={busy !== null}
                    className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-60"
                    style={{ background: "var(--accent)", color: "var(--background)" }}
                  >
                    {busy === "posting" ? "Opening Bluesky…" : "Share my entries on Bluesky"}
                  </button>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  Bluesky will ask you to let Inkwell post for you. Nothing is posted unless you
                  tick it when you publish an entry.
                </p>
              </div>
            )}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              connect(false);
            }}
            className="flex flex-col gap-2"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="you.bsky.social"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Your Bluesky handle"
                className="flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
              />
              <button
                type="submit"
                disabled={busy !== null}
                className="rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap disabled:opacity-60"
                style={{ background: "var(--accent)", color: "var(--background)" }}
              >
                {busy ? "Opening Bluesky…" : "Link Bluesky"}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Leave it empty to pick your account on Bluesky. Bluesky asks you to approve, and you can
              then sign in to Inkwell with it.
            </p>
          </form>
        )}

        {error && (
          <p
            className="text-sm rounded-lg px-3 py-2"
            style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
