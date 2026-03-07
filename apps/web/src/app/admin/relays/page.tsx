"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "../admin-nav";

interface RelaySubscription {
  id: string;
  relay_url: string;
  relay_domain: string;
  status: "pending" | "active" | "paused" | "error";
  entry_count: number;
  last_activity_at: string | null;
  error_message: string | null;
  inserted_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const statusColors: Record<string, { bg: string; color: string }> = {
  active: { bg: "#16a34a", color: "white" },
  pending: { bg: "#eab308", color: "#1a1a1a" },
  paused: { bg: "var(--muted)", color: "white" },
  error: { bg: "var(--danger, #dc2626)", color: "white" },
};

export default function AdminRelaysPage() {
  const [subscriptions, setSubscriptions] = useState<RelaySubscription[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [relayUrl, setRelayUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchRelays = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/relays");
      const data = await res.json();
      if (data.subscriptions) setSubscriptions(data.subscriptions);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRelays();
  }, [fetchRelays]);

  const handleAdd = async () => {
    const url = relayUrl.trim();
    if (!url) {
      setAddError("Relay actor URL is required");
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const res = await fetch("/api/admin/relays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relay_url: url }),
      });
      const data = await res.json();
      if (res.ok) {
        setRelayUrl("");
        fetchRelays();
      } else {
        setAddError(data.error || "Failed to subscribe");
      }
    } catch {
      setAddError("Failed to subscribe");
    } finally {
      setAdding(false);
    }
  };

  const handlePause = async (id: string) => {
    await fetch(`/api/admin/relays/${id}/pause`, { method: "POST" });
    fetchRelays();
  };

  const handleResume = async (id: string) => {
    await fetch(`/api/admin/relays/${id}/resume`, { method: "POST" });
    fetchRelays();
  };

  const handleRemove = async (id: string, domain: string) => {
    if (!confirm(`Remove relay ${domain}? This will send an Undo Follow and delete the subscription.`))
      return;
    await fetch(`/api/admin/relays/${id}`, { method: "DELETE" });
    fetchRelays();
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1
          style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--foreground)",
          }}
        >
          Admin
        </h1>
      </div>

      <AdminNav />

      <div className="mt-6" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
        {/* Add relay form */}
        <div
          style={{
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "20px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontSize: "18px",
              fontWeight: 600,
              margin: "0 0 16px 0",
              color: "var(--foreground)",
            }}
          >
            Subscribe to Relay
          </h2>

          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "4px",
              }}
            >
              Relay Actor URL
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="url"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="https://relay.fedi.buzz/actor"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "14px",
                }}
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{
                  padding: "10px 24px",
                  borderRadius: "999px",
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: adding ? "default" : "pointer",
                  opacity: adding ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {adding ? "Subscribing..." : "Subscribe"}
              </button>
            </div>
            <p
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                marginTop: "4px",
              }}
            >
              Enter the ActivityPub actor URL of the relay (e.g. relay.fedi.buzz/actor)
            </p>
          </div>

          {addError && (
            <p style={{ color: "var(--danger, #dc2626)", fontSize: "13px", margin: "0" }}>
              {addError}
            </p>
          )}
        </div>

        {/* Subscriptions list */}
        <div>
          <h2
            style={{
              fontFamily: "var(--font-lora, Georgia, serif)",
              fontSize: "18px",
              fontWeight: 600,
              margin: "0 0 16px 0",
              color: "var(--foreground)",
            }}
          >
            Relay Subscriptions
          </h2>

          {loading ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading...</p>
          ) : subscriptions.length === 0 ? (
            <div
              style={{
                borderRadius: "12px",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                padding: "32px",
                textAlign: "center",
              }}
            >
              <p style={{ color: "var(--muted)", fontStyle: "italic", margin: 0 }}>
                No relay subscriptions yet. Add one above to start receiving fediverse content.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {subscriptions.map((sub) => {
                const sc = statusColors[sub.status] || statusColors.error;
                return (
                  <div
                    key={sub.id}
                    style={{
                      borderRadius: "12px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3
                          style={{
                            margin: "0 0 4px",
                            fontSize: "15px",
                            fontWeight: 600,
                            color: "var(--foreground)",
                          }}
                        >
                          {sub.relay_domain}
                        </h3>
                        <p
                          style={{
                            fontSize: "12px",
                            color: "var(--muted)",
                            margin: "0 0 6px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sub.relay_url}
                        </p>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            flexWrap: "wrap",
                            fontSize: "12px",
                            color: "var(--muted)",
                          }}
                        >
                          <span
                            style={{
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: sc.bg,
                              color: sc.color,
                              fontWeight: 600,
                              fontSize: "11px",
                              textTransform: "uppercase",
                            }}
                          >
                            {sub.status}
                          </span>
                          <span>{sub.entry_count.toLocaleString()} entries</span>
                          <span>Last activity: {timeAgo(sub.last_activity_at)}</span>
                          <span>Added: {timeAgo(sub.inserted_at)}</span>
                        </div>
                        {sub.error_message && (
                          <p
                            style={{
                              fontSize: "12px",
                              color: "var(--danger, #dc2626)",
                              margin: "4px 0 0",
                            }}
                          >
                            {sub.error_message}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        {sub.status === "active" && (
                          <button
                            onClick={() => handlePause(sub.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--foreground)",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            Pause
                          </button>
                        )}
                        {sub.status === "paused" && (
                          <button
                            onClick={() => handleResume(sub.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--foreground)",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: 500,
                            }}
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(sub.id, sub.relay_domain)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--danger, #dc2626)",
                            background: "transparent",
                            color: "var(--danger, #dc2626)",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 500,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
