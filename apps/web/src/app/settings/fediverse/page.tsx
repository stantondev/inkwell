"use client";

import { useState, useEffect, useCallback } from "react";

interface FediverseAccount {
  id: string;
  domain: string;
  remote_username: string;
  remote_acct: string;
  remote_display_name: string | null;
  remote_avatar_url: string | null;
  linked_at: string;
}

export default function FediverseSettingsPage() {
  const [accounts, setAccounts] = useState<FediverseAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState("");
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/fediverse/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    setLinking(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/fediverse/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }

      // Redirect to remote instance's authorization page
      window.location.href = data.authorize_url;
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (id: string) => {
    if (!confirm("Unlink this fediverse account? You can always re-link it later.")) return;
    setUnlinkingId(id);

    try {
      const res = await fetch(`/api/auth/fediverse/accounts/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // silently fail
    } finally {
      setUnlinkingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2
          className="text-lg font-semibold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          Fediverse Accounts
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Link your Mastodon, Pleroma, or other fediverse accounts to sign in
          with them.
        </p>
      </div>

      {/* Linked accounts */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading...
        </p>
      ) : accounts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center gap-3 rounded-xl border p-4"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
              }}
            >
              {account.remote_avatar_url ? (
                <img
                  src={account.remote_avatar_url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                  }}
                >
                  {(account.remote_username || "?")[0].toUpperCase()}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--foreground)" }}
                >
                  {account.remote_display_name || account.remote_username}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: "var(--muted)" }}
                >
                  @{account.remote_acct}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleUnlink(account.id)}
                disabled={unlinkingId === account.id}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--danger, #dc2626)",
                }}
              >
                {unlinkingId === account.id ? "Unlinking..." : "Unlink"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl border p-6 text-center"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface)",
          }}
        >
          <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
            No fediverse accounts linked yet.
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Link one below to sign in with it next time.
          </p>
        </div>
      )}

      {/* Link new account */}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--foreground)" }}
        >
          Link a fediverse account
        </h3>

        <form onSubmit={handleLink} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="@you@mastodon.social"
              className="flex-1 rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
            <button
              type="submit"
              disabled={linking || !handle.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-60 whitespace-nowrap"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {linking ? "Connecting..." : "Link"}
            </button>
          </div>

          {error && (
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{
                background: "var(--danger-light, #fef2f2)",
                color: "var(--danger, #dc2626)",
              }}
            >
              {error}
            </p>
          )}

          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Works with Mastodon, Pleroma, GoToSocial, Pixelfed, and other
            compatible instances.
          </p>
        </form>
      </div>
    </div>
  );
}
