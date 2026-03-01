"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ApiKeyData {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  inserted_at: string;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPlus, setIsPlus] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [includeWrite, setIncludeWrite] = useState(false);
  const [expiresIn, setExpiresIn] = useState("never");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display-once raw key
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    // Check subscription tier
    fetch("/api/me").then(r => r.json()).then(d => {
      if (d.data?.subscription_tier === "plus") setIsPlus(true);
    }).catch(() => {});
  }, [fetchKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    const scopes = includeWrite ? ["read", "write"] : ["read"];
    let expires_at: string | null = null;

    if (expiresIn !== "never") {
      const now = new Date();
      const days = { "30d": 30, "90d": 90, "1y": 365 }[expiresIn] || 0;
      if (days > 0) {
        now.setDate(now.getDate() + days);
        expires_at = now.toISOString();
      }
    }

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes, expires_at }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.errors?.name?.[0] || "Something went wrong");
        return;
      }

      setNewKey(data.data.raw_key);
      setName("");
      setIncludeWrite(false);
      setExpiresIn("never");
      fetchKeys();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    if (!confirm(`Revoke API key "${keyName}"? Any integrations using this key will stop working.`)) return;
    setRevokingId(id);

    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== id));
      }
    } catch {
      // silently fail
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2
          className="text-lg font-semibold mb-1"
          style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
        >
          API Keys
        </h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Create API keys to integrate with Inkwell programmatically. Use them to publish entries from
          external tools, build custom workflows, or access your data.{" "}
          <Link href="/developers" className="underline" style={{ color: "var(--accent)" }}>
            View API documentation
          </Link>
        </p>
      </div>

      {/* Display-once raw key modal */}
      {newKey && (
        <div
          className="rounded-xl border p-6"
          style={{
            borderColor: "var(--danger, #dc2626)",
            background: "var(--danger-light, #fef2f2)",
          }}
        >
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--danger, #dc2626)" }}>
            Your new API key
          </h3>
          <p className="text-xs mb-3" style={{ color: "var(--danger, #dc2626)" }}>
            Copy this key now — it will not be shown again.
          </p>
          <div className="flex gap-2 items-center">
            <code
              className="flex-1 rounded-lg border px-3 py-2 text-xs break-all"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontFamily: "monospace",
              }}
            >
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => { setNewKey(null); setCopied(false); }}
            className="text-xs mt-3 underline"
            style={{ color: "var(--danger, #dc2626)" }}
          >
            I&apos;ve saved my key — dismiss
          </button>
        </div>
      )}

      {/* Create key form */}
      <div
        className="rounded-xl border p-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h3
          className="text-sm font-semibold mb-3"
          style={{ color: "var(--foreground)" }}
        >
          Create a new key
        </h3>

        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); if (error) setError(null); }}
              placeholder="e.g. WordPress Integration"
              maxLength={100}
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{
                borderColor: "var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                Permissions
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--foreground)" }}>
                  <input type="checkbox" checked disabled className="accent-current" />
                  Read
                </label>
                <label className="flex items-center gap-1.5 text-sm" style={{ color: isPlus ? "var(--foreground)" : "var(--muted)" }}>
                  <input
                    type="checkbox"
                    checked={includeWrite}
                    onChange={e => setIncludeWrite(e.target.checked)}
                    disabled={!isPlus}
                    className="accent-current"
                  />
                  Write
                  {!isPlus && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      (<Link href="/settings/billing" className="underline">Plus required</Link>)
                    </span>
                  )}
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>
                Expiration
              </label>
              <select
                value={expiresIn}
                onChange={e => setExpiresIn(e.target.value)}
                className="rounded-xl border px-3 py-2 text-sm focus:outline-none"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                }}
              >
                <option value="never">Never</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="1y">1 year</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {creating ? "Creating..." : "Create Key"}
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
        </form>
      </div>

      {/* Key list */}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
      ) : keys.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Active keys ({keys.length})
          </h3>
          {keys.map(key => (
            <div
              key={key.id}
              className="flex items-center gap-3 rounded-xl border p-4"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                    {key.name}
                  </p>
                  <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--background)", color: "var(--muted)", fontFamily: "monospace" }}>
                    {key.prefix}...
                  </code>
                </div>
                <div className="flex flex-wrap gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--background)" }}>
                    {key.scopes.includes("write") ? "Read + Write" : "Read only"}
                  </span>
                  <span>Created {timeAgo(key.inserted_at)}</span>
                  <span>Used {timeAgo(key.last_used_at)}</span>
                  {key.expires_at && <span>Expires {timeAgo(key.expires_at)}</span>}
                </div>
              </div>

              <button
                onClick={() => handleRevoke(key.id, key.name)}
                disabled={revokingId === key.id}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--danger, #dc2626)",
                }}
              >
                {revokingId === key.id ? "Revoking..." : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm mb-1" style={{ color: "var(--muted)" }}>
            No API keys yet.
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Create one above to start using the Inkwell API.
          </p>
        </div>
      )}

      {/* Rate limits info */}
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        <p className="font-medium mb-1">Rate limits</p>
        <p>{isPlus ? "Plus" : "Free"}: {isPlus ? "300" : "100"} read requests / 15 min per key{isPlus ? ", 60 write requests / 15 min per key" : ""}</p>
        {!isPlus && (
          <p className="mt-1">
            <Link href="/settings/billing" className="underline" style={{ color: "var(--accent)" }}>
              Upgrade to Plus
            </Link>{" "}
            for write access and higher rate limits.
          </p>
        )}
      </div>
    </div>
  );
}
