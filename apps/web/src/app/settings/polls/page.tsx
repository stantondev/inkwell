"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface PollOption {
  id: string;
  label: string;
  vote_count: number;
  percentage: number;
}

interface PollEntry {
  id: string;
  title: string;
  slug: string;
}

interface UserPoll {
  id: string;
  question: string;
  type: "platform" | "entry";
  status: "open" | "closed";
  total_votes: number;
  closes_at: string | null;
  closed_at: string | null;
  options: PollOption[];
  entry: PollEntry | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MyPollsPage() {
  const [polls, setPolls] = useState<UserPoll[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolls = useCallback(async () => {
    try {
      const res = await fetch("/api/my-polls?per_page=50");
      const data = await res.json();
      if (data.data) setPolls(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  const handleClose = async (pollId: string) => {
    if (!confirm("Close this poll early? Voting will be disabled.")) return;
    const res = await fetch(`/api/polls/${pollId}/close-own`, { method: "POST" });
    if (res.ok) fetchPolls();
  };

  const handleDelete = async (pollId: string) => {
    if (!confirm("Delete this poll? This cannot be undone.")) return;
    const res = await fetch(`/api/polls/${pollId}`, { method: "DELETE" });
    if (res.ok) fetchPolls();
  };

  const getWinner = (options: PollOption[]) => {
    if (options.length === 0) return null;
    return options.reduce((max, opt) => opt.vote_count > max.vote_count ? opt : max, options[0]);
  };

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontSize: "22px",
            fontWeight: 700,
            margin: "0 0 6px 0",
          }}
        >
          My Polls
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "14px", margin: 0 }}>
          Manage polls you've created on your journal entries.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)" }}>
          Loading...
        </div>
      ) : polls.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            color: "var(--muted)",
            fontStyle: "italic",
          }}
        >
          <p style={{ margin: "0 0 12px 0" }}>You haven't created any polls yet.</p>
          <p style={{ margin: 0, fontSize: "13px" }}>
            Add a poll to any journal entry from the editor settings panel.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {polls.map((poll) => {
            const winner = poll.status === "closed" ? getWinner(poll.options) : null;

            return (
              <div
                key={poll.id}
                className="poll-card"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "var(--surface)",
                }}
              >
                {/* Question */}
                <h3
                  style={{
                    fontFamily: "var(--font-lora, Georgia, serif)",
                    fontSize: "16px",
                    fontWeight: 700,
                    margin: "0 0 8px 0",
                  }}
                >
                  {poll.question}
                </h3>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "center",
                    fontSize: "12px",
                    color: "var(--muted)",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: poll.status === "open" ? "var(--accent)" : "var(--border)",
                      color: poll.status === "open" ? "white" : "var(--muted)",
                    }}
                  >
                    {poll.status === "open" ? "Open" : "Sealed"}
                  </span>
                  <span>{poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}</span>
                  <span>{timeAgo(poll.created_at)}</span>
                  {poll.closes_at && (
                    <span>
                      {poll.status === "open" ? "Closes" : "Closed"}{" "}
                      {new Date(poll.closes_at).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Linked entry */}
                {poll.entry && (
                  <div
                    style={{
                      fontSize: "13px",
                      marginBottom: "12px",
                      color: "var(--muted)",
                    }}
                  >
                    Attached to:{" "}
                    <Link
                      href={`/editor?id=${poll.entry.id}`}
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      {poll.entry.title || "Untitled entry"}
                    </Link>
                  </div>
                )}

                {/* Compact results */}
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
                  {poll.options.map((opt) => (
                    <div key={opt.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          flex: 1,
                          height: "6px",
                          borderRadius: "3px",
                          background: "var(--border)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${opt.percentage}%`,
                            height: "100%",
                            borderRadius: "3px",
                            background:
                              winner && opt.id === winner.id
                                ? "var(--accent)"
                                : "var(--muted)",
                            transition: "width 0.4s ease",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "12px",
                          minWidth: "120px",
                          color:
                            winner && opt.id === winner.id
                              ? "var(--accent)"
                              : "var(--foreground)",
                          fontWeight: winner && opt.id === winner.id ? 700 : 400,
                        }}
                      >
                        {opt.label} ({opt.vote_count})
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <Link
                    href={`/polls/${poll.id}`}
                    style={{
                      fontSize: "13px",
                      color: "var(--accent)",
                      textDecoration: "none",
                    }}
                  >
                    View results
                  </Link>
                  {poll.status === "open" && (
                    <button
                      onClick={() => handleClose(poll.id)}
                      style={{
                        fontSize: "13px",
                        color: "var(--muted)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Close early
                    </button>
                  )}
                  {poll.total_votes === 0 && (
                    <button
                      onClick={() => handleDelete(poll.id)}
                      style={{
                        fontSize: "13px",
                        color: "var(--danger, #dc2626)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
