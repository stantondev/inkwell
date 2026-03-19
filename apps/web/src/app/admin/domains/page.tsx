"use client";

import { useState, useEffect } from "react";

interface BlockedDomain {
  id: string;
  domain: string;
  reason: string | null;
  blocked_at: string;
}

export default function AdminDomainsPage() {
  const [domains, setDomains] = useState<BlockedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDomains() {
      try {
        const res = await fetch("/api/admin/blocked-domains");
        if (res.ok) {
          const data = await res.json();
          setDomains(data.data ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchDomains();
  }, []);

  async function handleAdd() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/blocked-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, reason: newReason.trim() || null }),
      });
      if (res.ok) {
        setDomains((prev) => [
          { id: crypto.randomUUID(), domain, reason: newReason.trim() || null, blocked_at: new Date().toISOString() },
          ...prev,
        ]);
        setNewDomain("");
        setNewReason("");
      }
    } catch { /* ignore */ }
    setAdding(false);
  }

  async function handleRemove(domain: string) {
    setRemoving(domain);
    try {
      const res = await fetch(`/api/admin/blocked-domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
      if (res.ok) {
        setDomains((prev) => prev.filter((d) => d.domain !== domain));
      }
    } catch { /* ignore */ }
    setRemoving(null);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Domain Defederation</h2>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Defederated domains are blocked for <strong>all users</strong>. Inbound activities from these domains will be
        silently dropped. Relay content from these domains will not be stored. Existing content from defederated domains
        will be hidden from explore and feeds.
      </p>

      <div
        className="rounded-xl border p-4 mb-6"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="badinstance.example"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newDomain.trim()}
            className="rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50 shrink-0"
            style={{ background: "var(--danger, #dc2626)" }}
          >
            {adding ? "..." : "Defederate"}
          </button>
        </div>
        <input
          type="text"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>
      ) : domains.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <p className="text-sm" style={{ color: "var(--muted)" }}>No defederated domains.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {domains.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ background: "rgba(220, 38, 38, 0.1)", color: "var(--danger, #dc2626)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{d.domain}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {d.reason ? `${d.reason} — ` : ""}
                  Defederated {new Date(d.blocked_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRemove(d.domain)}
                disabled={removing === d.domain}
                className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {removing === d.domain ? "..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
