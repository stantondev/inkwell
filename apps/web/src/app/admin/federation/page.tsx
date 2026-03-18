"use client";

import { useEffect, useState } from "react";
import { AdminNav } from "../admin-nav";

interface EndpointCheck {
  status: string;
  http_status?: number;
  latency_ms?: number;
  url?: string;
  error?: string;
  reason?: string;
}

interface FederationStatus {
  endpoints: {
    webfinger: EndpointCheck;
    actor: EndpointCheck;
    avatar: EndpointCheck;
    entry: EndpointCheck;
  };
  inbound: Record<string, number>;
  outbound: {
    success: number;
    failure: number;
    pending_jobs: number;
    recent_failures: Array<{ inbox: string; error: string; at: string }>;
  };
  oban: {
    available: number;
    executing: number;
    retryable: number;
    scheduled: number;
    pending: number;
  };
  remote_actors: {
    total: number;
    stale: number;
  };
  remote_entries: {
    total: number;
    by_source: { relay: number; follow: number; inbox: number };
    avg_engagement: { likes: number; boosts: number; replies: number };
  };
  relays: {
    active: number;
    paused: number;
    error: number;
    pending: number;
    total_entries: number;
  };
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  tracking_since: string | null;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: ok ? "var(--accent, #2d4a8a)" : "var(--danger, #dc2626)",
        marginRight: 8,
      }}
    />
  );
}

function TimeAgo({ iso }: { iso: string | null }) {
  if (!iso) return <span style={{ color: "var(--muted)" }}>never</span>;
  const d = new Date(iso);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return <span>{secs}s ago</span>;
  if (secs < 3600) return <span>{Math.floor(secs / 60)}m ago</span>;
  if (secs < 86400) return <span>{Math.floor(secs / 3600)}h ago</span>;
  return <span>{Math.floor(secs / 86400)}d ago</span>;
}

export default function FederationPage() {
  const [status, setStatus] = useState<FederationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick action states
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [wfHandle, setWfHandle] = useState("");
  const [wfResult, setWfResult] = useState<Record<string, unknown> | null>(null);
  const [wfLoading, setWfLoading] = useState(false);
  const [actorUri, setActorUri] = useState("");
  const [actorResult, setActorResult] = useState<Record<string, unknown> | null>(null);
  const [actorLoading, setActorLoading] = useState(false);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/admin/federation");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleRefreshEngagement() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/admin/federation/refresh-engagement", { method: "POST" });
      const data = await res.json();
      setRefreshMsg(data.message || data.error || "Done");
    } catch {
      setRefreshMsg("Failed to enqueue");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleTestWebfinger() {
    if (!wfHandle.trim()) return;
    setWfLoading(true);
    setWfResult(null);
    try {
      const res = await fetch("/api/admin/federation/test-webfinger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: wfHandle.trim() }),
      });
      setWfResult(await res.json());
    } catch {
      setWfResult({ ok: false, error: "Network error" });
    } finally {
      setWfLoading(false);
    }
  }

  async function handleTestActor() {
    if (!actorUri.trim()) return;
    setActorLoading(true);
    setActorResult(null);
    try {
      const res = await fetch("/api/admin/federation/test-actor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: actorUri.trim() }),
      });
      setActorResult(await res.json());
    } catch {
      setActorResult({ ok: false, error: "Network error" });
    } finally {
      setActorLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <AdminNav />
      <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: 24, marginBottom: 8 }}>
        Federation Diagnostics
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
        Real-time health and activity tracking for ActivityPub federation.
      </p>

      {loading && <p style={{ color: "var(--muted)" }}>Loading federation status...</p>}
      {error && <p style={{ color: "var(--danger)" }}>Error: {error}</p>}

      {status && (
        <>
          {/* 1. Endpoint Health */}
          <Section title="Endpoint Health">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {(["webfinger", "actor", "avatar", "entry"] as const).map((key) => {
                const ep = status.endpoints[key];
                const ok = ep?.status === "ok";
                return (
                  <Card key={key}>
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                      <StatusDot ok={ok} />
                      <strong style={{ textTransform: "capitalize" }}>{key}</strong>
                      <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
                        {ep?.latency_ms != null ? `${ep.latency_ms}ms` : "—"}
                      </span>
                    </div>
                    {ep?.http_status && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>HTTP {ep.http_status}</div>
                    )}
                    {ep?.error && (
                      <div style={{ fontSize: 12, color: "var(--danger)" }}>{ep.error}</div>
                    )}
                    {ep?.reason && (
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{ep.reason}</div>
                    )}
                  </Card>
                );
              })}
            </div>
          </Section>

          {/* 2. Activity Stats */}
          <Section title="Activity Stats">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Inbound */}
              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Inbound Activities
                </h3>
                {Object.keys(status.inbound).length === 0 ? (
                  <p style={{ color: "var(--muted)", fontSize: 13 }}>No activities since last restart</p>
                ) : (
                  <table style={{ width: "100%", fontSize: 13 }}>
                    <tbody>
                      {Object.entries(status.inbound)
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([type, count]) => (
                          <tr key={type}>
                            <td style={{ padding: "2px 0" }}>
                              {type === "rejected_signature" ? (
                                <span style={{ color: "var(--danger)" }}>{type}</span>
                              ) : (
                                type
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontFamily: "monospace" }}>{count as number}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  Last activity: <TimeAgo iso={status.last_inbound_at} />
                </div>
              </Card>

              {/* Outbound */}
              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Outbound Delivery
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <Stat label="Success" value={status.outbound.success} color="var(--accent)" />
                  <Stat label="Failed" value={status.outbound.failure} color="var(--danger)" />
                  <Stat label="Pending" value={status.outbound.pending_jobs} />
                </div>
                {status.outbound.success + status.outbound.failure > 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                    Success rate:{" "}
                    {(
                      (status.outbound.success / (status.outbound.success + status.outbound.failure)) *
                      100
                    ).toFixed(1)}
                    %
                  </div>
                )}
                {status.outbound.recent_failures.length > 0 && (
                  <details style={{ fontSize: 12 }}>
                    <summary style={{ cursor: "pointer", color: "var(--danger)" }}>
                      Recent failures ({status.outbound.recent_failures.length})
                    </summary>
                    <div style={{ maxHeight: 150, overflow: "auto", marginTop: 4 }}>
                      {status.outbound.recent_failures.slice(0, 10).map((f, i) => (
                        <div key={i} style={{ padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
                          <div style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{f.inbox}</div>
                          <div style={{ color: "var(--danger)" }}>{f.error}</div>
                          <div style={{ color: "var(--muted)" }}><TimeAgo iso={f.at} /></div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  Last delivery: <TimeAgo iso={status.last_outbound_at} />
                </div>
              </Card>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              Tracking since: {status.tracking_since ? new Date(status.tracking_since).toLocaleString() : "—"} (resets on restart)
            </div>
          </Section>

          {/* 3. Oban Federation Queue */}
          <Section title="Federation Queue (Oban)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              <Stat label="Available" value={status.oban.available} />
              <Stat label="Executing" value={status.oban.executing} color="var(--accent)" />
              <Stat label="Retryable" value={status.oban.retryable} color={status.oban.retryable > 0 ? "var(--danger)" : undefined} />
              <Stat label="Scheduled" value={status.oban.scheduled} />
            </div>
          </Section>

          {/* 4. Remote Content */}
          <Section title="Remote Content">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Remote Actors</h3>
                <Stat label="Total cached" value={status.remote_actors.total} />
                <Stat
                  label="Stale (>24h)"
                  value={status.remote_actors.stale}
                  color={status.remote_actors.stale > 50 ? "var(--danger)" : undefined}
                />
              </Card>
              <Card>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Remote Entries</h3>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  Total: <strong>{status.remote_entries.total}</strong>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Relay: {status.remote_entries.by_source.relay} · Follow: {status.remote_entries.by_source.follow} · Inbox: {status.remote_entries.by_source.inbox}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Avg engagement — Likes: {status.remote_entries.avg_engagement.likes} · Boosts: {status.remote_entries.avg_engagement.boosts} · Replies: {status.remote_entries.avg_engagement.replies}
                </div>
              </Card>
            </div>
          </Section>

          {/* 5. Relays */}
          <Section title="Relay Subscriptions">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              <Stat label="Active" value={status.relays.active} color="var(--accent)" />
              <Stat label="Paused" value={status.relays.paused} />
              <Stat label="Error" value={status.relays.error} color={status.relays.error > 0 ? "var(--danger)" : undefined} />
              <Stat label="Pending" value={status.relays.pending} />
              <Stat label="Total entries" value={status.relays.total_entries} />
            </div>
            <div style={{ marginTop: 8 }}>
              <a href="/admin/relays" style={{ fontSize: 13, color: "var(--accent)" }}>
                Manage relays →
              </a>
            </div>
          </Section>

          {/* 6. Quick Actions */}
          <Section title="Quick Actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Refresh Engagement */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleRefreshEngagement}
                  disabled={refreshing}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: refreshing ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {refreshing ? "Enqueuing..." : "Refresh Engagement Counts"}
                </button>
                {refreshMsg && <span style={{ fontSize: 13, color: "var(--muted)" }}>{refreshMsg}</span>}
              </div>

              {/* Test WebFinger */}
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={wfHandle}
                    onChange={(e) => setWfHandle(e.target.value)}
                    placeholder="user@domain.com"
                    onKeyDown={(e) => e.key === "Enter" && handleTestWebfinger()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: 13,
                      width: 260,
                      color: "var(--foreground)",
                    }}
                  />
                  <button
                    onClick={handleTestWebfinger}
                    disabled={wfLoading}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      cursor: wfLoading ? "wait" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    {wfLoading ? "Testing..." : "Test WebFinger"}
                  </button>
                </div>
                {wfResult && (
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 6,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      maxHeight: 200,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {JSON.stringify(wfResult, null, 2)}
                  </pre>
                )}
              </div>

              {/* Test Actor */}
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={actorUri}
                    onChange={(e) => setActorUri(e.target.value)}
                    placeholder="https://mastodon.social/users/username"
                    onKeyDown={(e) => e.key === "Enter" && handleTestActor()}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      fontSize: 13,
                      width: 360,
                      color: "var(--foreground)",
                    }}
                  />
                  <button
                    onClick={handleTestActor}
                    disabled={actorLoading}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      cursor: actorLoading ? "wait" : "pointer",
                      fontSize: 13,
                    }}
                  >
                    {actorLoading ? "Fetching..." : "Test Actor Fetch"}
                  </button>
                </div>
                {actorResult && (
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 6,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                      maxHeight: 200,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {JSON.stringify(actorResult, null, 2)}
                  </pre>
                )}
              </div>

              {/* Refresh button */}
              <div>
                <button
                  onClick={() => { setLoading(true); fetchStatus(); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  ↻ Refresh Dashboard
                </button>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontSize: 16,
          fontWeight: 600,
          marginBottom: 12,
          paddingBottom: 6,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: "monospace", color: color || "var(--foreground)" }}>
        {value}
      </div>
    </div>
  );
}
