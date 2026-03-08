"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface MemberUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
}

interface Member {
  id: string;
  role: string;
  joined_at: string;
  user: MemberUser | null;
}

export default function MembersSection({
  circleId,
  isOwner,
  memberCount,
  onMemberCountChange,
}: {
  circleId: string;
  isOwner: boolean;
  memberCount: number;
  onMemberCountChange: (fn: (c: number) => number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const fetchMembers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/circles/${circleId}/members?page=${p}&per_page=30`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.data || []);
        setTotal(data.pagination?.total || 0);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [circleId]);

  useEffect(() => {
    if (expanded) fetchMembers(page);
  }, [expanded, page, fetchMembers]);

  const handleRoleChange = async (userId: string, newRole: "moderator" | "member") => {
    setActing(userId);
    try {
      const res = await fetch(`/api/circles/${circleId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((prev) =>
          prev.map((m) =>
            m.user?.id === userId ? { ...m, role: data.data.role } : m
          )
        );
      }
    } catch {
      // ignore
    }
    setActing(null);
  };

  const handleRemove = async (userId: string) => {
    setActing(userId);
    try {
      const res = await fetch(`/api/circles/${circleId}/members/${userId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.user?.id !== userId));
        setTotal((t) => Math.max(0, t - 1));
        onMemberCountChange((c: number) => Math.max(0, c - 1));
      }
    } catch {
      // ignore
    }
    setActing(null);
    setConfirmRemove(null);
  };

  const totalPages = Math.ceil(total / 30);

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="circle-members-toggle"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{expanded ? "Hide Members" : `Members (${memberCount})`}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="circle-members-list">
          {loading && members.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", fontSize: "0.875rem", padding: "0.75rem 0" }}>
              Loading members...
            </p>
          ) : (
            <>
              {members.map((m) => {
                if (!m.user) return null;
                const isTarget = acting === m.user.id;
                return (
                  <div key={m.id} className="circle-member-card">
                    <Link href={`/${m.user.username}`} className="circle-member-info">
                      <img
                        src={m.user.avatar_url || `/api/avatars/${m.user.username}`}
                        alt={m.user.display_name || m.user.username}
                        className="circle-member-avatar"
                      />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span className="circle-member-name">
                            {m.user.display_name || m.user.username}
                          </span>
                          {m.role === "owner" && (
                            <span className="circle-role-badge circle-role-badge--owner">Owner</span>
                          )}
                          {m.role === "moderator" && (
                            <span className="circle-role-badge circle-role-badge--mod">Mod</span>
                          )}
                        </div>
                        <span className="circle-member-username">@{m.user.username}</span>
                      </div>
                    </Link>

                    {isOwner && m.role !== "owner" && (
                      <div className="circle-member-actions">
                        {confirmRemove === m.user.id ? (
                          <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Remove?</span>
                            <button
                              onClick={() => handleRemove(m.user!.id)}
                              disabled={isTarget}
                              className="circle-member-btn circle-member-btn--remove"
                            >
                              {isTarget ? "..." : "Yes"}
                            </button>
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="circle-member-btn"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            {m.role === "member" ? (
                              <button
                                onClick={() => handleRoleChange(m.user!.id, "moderator")}
                                disabled={isTarget}
                                className="circle-member-btn circle-member-btn--promote"
                                title="Promote to Moderator"
                              >
                                {isTarget ? "..." : "Promote"}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRoleChange(m.user!.id, "member")}
                                disabled={isTarget}
                                className="circle-member-btn circle-member-btn--demote"
                                title="Demote to Member"
                              >
                                {isTarget ? "..." : "Demote"}
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmRemove(m.user!.id)}
                              className="circle-member-btn circle-member-btn--remove"
                              title="Remove from circle"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`circle-member-page-btn${p === page ? " circle-member-page-btn--active" : ""}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
