"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";

interface MastodonAccount {
  id: string;
  domain: string;
  remote_username: string;
  remote_acct: string;
  remote_display_name: string | null;
  remote_avatar_url: string | null;
  token_scope: string | null;
  kind?: string;
}

function canShare(scope: string | null): boolean {
  if (!scope) return false;
  return scope.includes("write:statuses") || scope.includes("write");
}

/**
 * Settings → Mastodon & Bluesky → Mastodon: linked Mastodon (and other
 * fediverse) accounts, for signing in and sharing entries.
 */
export function MastodonAccountsCard() {
  const [accounts, setAccounts] = useState<MastodonAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/fediverse/accounts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // The linked Bluesky account has its own card.
        setAccounts((data.data || []).filter((a: MastodonAccount) => a.kind !== "bluesky"));
      }
    } catch {
      // The form below still works.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Linking and turning on sharing both go through the account's server.
  const authorize = async (body: Record<string, string>, onDone: () => void) => {
    setError(null);
    try {
      const res = await fetch("/api/auth/fediverse/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorize_url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        onDone();
        return;
      }
      window.location.href = data.authorize_url;
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
      onDone();
    }
  };

  const link = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLinking(true);
    authorize({ handle: handle.trim() }, () => setLinking(false));
  };

  const turnOnSharing = (account: MastodonAccount) => {
    setBusyId(account.id);
    authorize({ handle: `@${account.remote_username}@${account.domain}`, redirect_after: "/settings/fediverse" }, () =>
      setBusyId(null)
    );
  };

  const unlink = async (account: MastodonAccount) => {
    if (!confirm(`Unlink @${account.remote_acct}? You can link it again any time.`)) return;
    setBusyId(account.id);
    try {
      const res = await fetch(`/api/auth/fediverse/accounts/${account.id}`, { method: "DELETE" });
      if (res.ok) setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      else setError("Couldn't unlink that account. Please try again.");
    } catch {
      setError("Couldn't reach Inkwell. Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      aria-labelledby="mastodon-heading"
    >
      <div className="flex items-start gap-3">
        <GlobeIcon />
        <div className="flex-1 min-w-0">
          <h3 id="mastodon-heading" className="text-base font-semibold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
            Mastodon
          </h3>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            Or another site on the fediverse: Pixelfed, GoToSocial, Pleroma, Akkoma and others work the same way.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {!loading &&
          accounts.map((account) => {
            const sharing = canShare(account.token_scope);
            return (
              <div key={account.id} className="flex flex-col gap-2 pb-3 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <Avatar url={account.remote_avatar_url} name={account.remote_display_name || account.remote_username || "?"} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{account.remote_display_name || account.remote_username}</p>
                    <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                      @{account.remote_acct}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => unlink(account)}
                    disabled={busyId === account.id}
                    className="text-xs px-3 py-1.5 rounded-lg border disabled:opacity-60"
                    style={{ borderColor: "var(--border)", color: "var(--danger, #dc2626)" }}
                  >
                    Unlink
                  </button>
                </div>
                {sharing ? (
                  <p className="text-sm">
                    <span style={{ color: "var(--success, #15803d)" }}>●</span> Sharing is on. Tick{" "}
                    <strong className="break-all">@{account.remote_acct}</strong> under Cross-post in the editor&apos;s
                    settings when you publish.
                  </p>
                ) : (
                  <p className="text-sm">
                    Sign-in only.{" "}
                    <button
                      type="button"
                      onClick={() => turnOnSharing(account)}
                      disabled={busyId === account.id}
                      className="font-medium underline underline-offset-2 disabled:opacity-60"
                      style={{ color: "var(--accent)" }}
                    >
                      {busyId === account.id ? "Opening your server…" : "Turn on sharing"}
                    </button>
                  </p>
                )}
              </div>
            );
          })}

        <form onSubmit={link} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="@you@mastodon.social"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Your Mastodon handle"
              className="flex-1 min-w-0 rounded-xl border px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
            />
            <button
              type="submit"
              disabled={linking || !handle.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--background)" }}
            >
              {linking ? "Opening…" : accounts.length > 0 ? "Link another" : "Link Mastodon"}
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Your server will ask you to let Inkwell sign you in and post for you. Nothing is posted unless you tick it
            when you publish.
          </p>
        </form>

        {error && (
          <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger, #dc2626)" }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

export function GlobeIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}
