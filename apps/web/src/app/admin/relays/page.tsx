"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSkeletonCards } from "../admin-skeleton";

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

export default function AdminRelaysPage() {
  const [subscriptions, setSubscriptions] = useState<RelaySubscription[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => { fetchRelays(); }, [fetchRelays]);

  const handleAdd = async () => {
    const url = relayUrl.trim();
    if (!url) { setAddError("Relay actor URL is required"); return; }
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
    if (!confirm(`Remove relay ${domain}? This will send an Undo Follow and delete the subscription.`)) return;
    await fetch(`/api/admin/relays/${id}`, { method: "DELETE" });
    fetchRelays();
  };

  return (
    <div>
      {/* Subscribe form */}
      <div className="admin-card admin-section">
        <h2 className="admin-card-header">Subscribe to Relay</h2>

        <div style={{ marginBottom: "12px" }}>
          <label className="admin-label">Relay Actor URL</label>
          <div className="admin-form-row">
            <input
              type="url"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder="https://relay.fedi.buzz/actor"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="admin-input"
              style={{ flex: 1 }}
            />
            <button onClick={handleAdd} disabled={adding} className="admin-btn admin-btn--primary">
              {adding ? "Subscribing..." : "Subscribe"}
            </button>
          </div>
          <p className="admin-hint">
            Enter the ActivityPub actor URL of the relay (e.g. relay.fedi.buzz/actor)
          </p>
        </div>

        {addError && (
          <p style={{ color: "var(--danger, #dc2626)", fontSize: "13px", margin: 0 }}>{addError}</p>
        )}
      </div>

      {/* Subscriptions list */}
      <h2 className="admin-card-header" style={{ marginBottom: "16px" }}>Relay Subscriptions</h2>

      {loading ? (
        <AdminSkeletonCards count={3} />
      ) : subscriptions.length === 0 ? (
        <div className="admin-empty">
          <p>No relay subscriptions yet. Add one above to start receiving fediverse content.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {subscriptions.map((sub) => (
            <div key={sub.id} className="admin-item-card">
              <div className="admin-item-card-layout">
                <div className="admin-item-card-content">
                  <h3 className="admin-item-card-title">{sub.relay_domain}</h3>
                  <p className="admin-item-card-url">{sub.relay_url}</p>
                  <div className="admin-item-card-meta">
                    <span className={`admin-badge ${
                      sub.status === "active" ? "admin-badge--success" :
                      sub.status === "pending" ? "admin-badge--warning" :
                      sub.status === "error" ? "admin-badge--danger" :
                      "admin-badge--muted"
                    }`}>
                      {sub.status}
                    </span>
                    <span>{sub.entry_count.toLocaleString()} entries</span>
                    <span>Last: {timeAgo(sub.last_activity_at)}</span>
                    <span>Added: {timeAgo(sub.inserted_at)}</span>
                  </div>
                  {sub.error_message && (
                    <p className="text-xs" style={{ color: "var(--danger, #dc2626)", margin: "4px 0 0" }}>
                      {sub.error_message}
                    </p>
                  )}
                </div>

                <div className="admin-action-row">
                  {sub.status === "active" && (
                    <button onClick={() => handlePause(sub.id)} className="admin-btn admin-btn--outline admin-btn--sm">
                      Pause
                    </button>
                  )}
                  {sub.status === "paused" && (
                    <button onClick={() => handleResume(sub.id)} className="admin-btn admin-btn--outline admin-btn--sm">
                      Resume
                    </button>
                  )}
                  <button onClick={() => handleRemove(sub.id, sub.relay_domain)} className="admin-btn admin-btn--danger admin-btn--sm">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
