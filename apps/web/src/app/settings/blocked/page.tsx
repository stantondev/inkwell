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

export default function BlockedUsersPage() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBlocked() {
      try {
        const res = await fetch("/api/blocked-users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.data ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchBlocked();
  }, []);

  async function handleUnblock(username: string) {
    setUnblocking(username);
    try {
      const res = await fetch(`/api/block/${username}`, { method: "DELETE" });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.username !== username));
      }
    } catch { /* ignore */ }
    setUnblocking(null);
  }

  if (loading) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Blocked Users</h2>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
        Blocked users can&apos;t see your entries, send you messages, or interact with your content.
        You won&apos;t see their content either.
      </p>

      {users.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            You haven&apos;t blocked anyone.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            >
              <Link href={`/${user.username}`}>
                <AvatarWithFrame
                  url={user.avatar_url}
                  name={user.display_name}
                  size={40}
                  frame={user.avatar_frame}
                  subscriptionTier={user.subscription_tier}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/${user.username}`} className="text-sm font-medium hover:underline" style={{ color: "var(--foreground)" }}>
                  {user.display_name}
                </Link>
                <p className="text-xs" style={{ color: "var(--muted)" }}>@{user.username}</p>
              </div>
              <button
                onClick={() => handleUnblock(user.username)}
                disabled={unblocking === user.username}
                className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 shrink-0"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {unblocking === user.username ? "..." : "Unblock"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
