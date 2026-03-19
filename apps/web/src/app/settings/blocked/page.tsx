"use client";

import { useState, useEffect } from "react";
import { AvatarWithFrame } from "@/components/avatar-with-frame";
import Link from "next/link";

interface BlockedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  subscription_tier?: string;
}

interface BlockedRemoteActor {
  id: string;
  remote_actor_id: string;
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  ap_id: string;
  blocked_at: string;
}

interface BlockedDomain {
  id: string;
  domain: string;
  reason: string | null;
  blocked_at: string;
}

export default function BlockedUsersPage() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [remoteActors, setRemoteActors] = useState<BlockedRemoteActor[]>([]);
  const [domains, setDomains] = useState<BlockedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newDomainReason, setNewDomainReason] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [usersRes, actorsRes, domainsRes] = await Promise.all([
          fetch("/api/blocked-users"),
          fetch("/api/fediverse-blocks/actors"),
          fetch("/api/fediverse-blocks/domains"),
        ]);

        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.data ?? []);
        }
        if (actorsRes.ok) {
          const data = await actorsRes.json();
          setRemoteActors(data.data ?? []);
        }
        if (domainsRes.ok) {
          const data = await domainsRes.json();
          setDomains(data.data ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchAll();
  }, []);

  async function handleUnblockUser(username: string) {
    setUnblocking(`user-${username}`);
    try {
      const res = await fetch(`/api/block/${username}`, { method: "DELETE" });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.username !== username));
    } catch { /* ignore */ }
    setUnblocking(null);
  }

  async function handleUnblockActor(remoteActorId: string) {
    setUnblocking(`actor-${remoteActorId}`);
    try {
      const res = await fetch(`/api/fediverse-blocks/actors/${remoteActorId}`, { method: "DELETE" });
      if (res.ok) setRemoteActors((prev) => prev.filter((a) => a.remote_actor_id !== remoteActorId));
    } catch { /* ignore */ }
    setUnblocking(null);
  }

  async function handleUnblockDomain(domain: string) {
    setUnblocking(`domain-${domain}`);
    try {
      const res = await fetch(`/api/fediverse-blocks/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
      if (res.ok) setDomains((prev) => prev.filter((d) => d.domain !== domain));
    } catch { /* ignore */ }
    setUnblocking(null);
  }

  async function handleAddDomain() {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setAddingDomain(true);
    try {
      const res = await fetch("/api/fediverse-blocks/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, reason: newDomainReason.trim() || null }),
      });
      if (res.ok) {
        setDomains((prev) => [{ id: crypto.randomUUID(), domain, reason: newDomainReason.trim() || null, blocked_at: new Date().toISOString() }, ...prev]);
        setNewDomain("");
        setNewDomainReason("");
      }
    } catch { /* ignore */ }
    setAddingDomain(false);
  }

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Local Users */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Blocked Inkwell Users</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Blocked users can&apos;t see your entries, send you messages, or interact with your content.
        </p>

        {users.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>No blocked users.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <Link href={`/${user.username}`}>
                  <AvatarWithFrame url={user.avatar_url} name={user.display_name} size={40} frame={user.avatar_frame} subscriptionTier={user.subscription_tier} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/${user.username}`} className="text-sm font-medium hover:underline" style={{ color: "var(--foreground)" }}>
                    {user.display_name}
                  </Link>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>@{user.username}</p>
                </div>
                <button
                  onClick={() => handleUnblockUser(user.username)}
                  disabled={unblocking === `user-${user.username}`}
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {unblocking === `user-${user.username}` ? "..." : "Unblock"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Remote Fediverse Actors */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Blocked Fediverse Users</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          Users from other fediverse instances (Mastodon, etc.) that you&apos;ve blocked. Their activities will be silently dropped.
        </p>

        {remoteActors.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>No blocked fediverse users.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {remoteActors.map((actor) => (
              <div key={actor.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                {actor.avatar_url ? (
                  <img src={actor.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                    {(actor.display_name || actor.username || "?")[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    {actor.display_name || actor.username}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    🌐 @{actor.username}@{actor.domain}
                  </p>
                </div>
                <button
                  onClick={() => handleUnblockActor(actor.remote_actor_id)}
                  disabled={unblocking === `actor-${actor.remote_actor_id}`}
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {unblocking === `actor-${actor.remote_actor_id}` ? "..." : "Unblock"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Blocked Domains */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Blocked Domains</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          All content from blocked domains will be hidden from your feed and explore. Inbound activities from these instances will be dropped.
        </p>

        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
            />
            <button
              onClick={handleAddDomain}
              disabled={addingDomain || !newDomain.trim()}
              className="rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50 shrink-0"
              style={{ background: "var(--accent)" }}
            >
              {addingDomain ? "..." : "Block Domain"}
            </button>
          </div>
          <input
            type="text"
            value={newDomainReason}
            onChange={(e) => setNewDomainReason(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
            onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
          />
        </div>

        {domains.length === 0 ? (
          <div className="rounded-xl border p-6 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>No blocked domains.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {domains.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                  🌐
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{d.domain}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {d.reason ? `${d.reason} · ` : ""}Blocked {new Date(d.blocked_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleUnblockDomain(d.domain)}
                  disabled={unblocking === `domain-${d.domain}`}
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {unblocking === `domain-${d.domain}` ? "..." : "Unblock"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
