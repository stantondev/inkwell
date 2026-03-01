"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "../admin-nav";

interface PollOption {
  id: string;
  label: string;
  position: number;
  vote_count: number;
  percentage: number;
}

interface Poll {
  id: string;
  question: string;
  type: "platform" | "entry";
  status: "open" | "closed";
  total_votes: number;
  closes_at: string | null;
  closed_at: string | null;
  options: PollOption[];
  creator: { id: string | null; username: string; display_name: string } | null;
  entry_id: string | null;
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

export default function AdminPollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchPolls = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/polls?per_page=50");
      const data = await res.json();
      if (data.data) setPolls(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  const handleCreate = async () => {
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) { setCreateError("Question is required"); return; }
    if (trimmedOptions.length < 2) { setCreateError("At least 2 options are required"); return; }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/admin/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          options: trimmedOptions,
          closes_at: closesAt || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setQuestion("");
        setOptions(["", ""]);
        setClosesAt("");
        fetchPolls();
      } else {
        setCreateError(data.error || "Failed to create poll");
      }
    } catch {
      setCreateError("Failed to create poll");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = async (pollId: string) => {
    if (!confirm("Close this poll? Voting will be disabled.")) return;
    try {
      await fetch(`/api/admin/polls/${pollId}/close`, { method: "POST" });
      fetchPolls();
    } catch {}
  };

  const handleDelete = async (pollId: string) => {
    if (!confirm("Delete this poll? This cannot be undone.")) return;
    try {
      await fetch(`/api/admin/polls/${pollId}`, { method: "DELETE" });
      fetchPolls();
    } catch {}
  };

  const addOption = () => {
    if (options.length < 10) setOptions([...options, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, val: string) => {
    setOptions(options.map((o, i) => (i === idx ? val : o)));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontSize: "24px", fontWeight: 700, color: "var(--foreground)" }}>
          Admin
        </h1>
      </div>

      <AdminNav />

      <div className="mt-6" style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px" }}>
        {/* Create poll form */}
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
            Create Platform Poll
          </h2>

          {/* Question */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should we build next?"
              maxLength={500}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "14px",
              }}
            />
          </div>

          {/* Options */}
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
              Options ({options.length}/10)
            </label>
            {options.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  maxLength={200}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: "14px",
                  }}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(idx)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                onClick={addOption}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: "13px",
                  width: "100%",
                }}
              >
                + Add option
              </button>
            )}
          </div>

          {/* Close date */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
              Close date (optional)
            </label>
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "14px",
              }}
            />
          </div>

          {createError && (
            <p style={{ color: "var(--danger, #dc2626)", fontSize: "13px", margin: "0 0 12px" }}>{createError}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: "10px 24px",
              borderRadius: "999px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              fontWeight: 600,
              fontSize: "14px",
              cursor: creating ? "default" : "pointer",
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Creating..." : "Create Poll"}
          </button>
        </div>

        {/* Poll list */}
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
            All Polls
          </h2>

          {loading ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading...</p>
          ) : polls.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>No polls yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {polls.map((poll) => (
                <div
                  key={poll.id}
                  style={{
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: "var(--foreground)" }}>
                        {poll.question}
                      </h3>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", fontSize: "12px", color: "var(--muted)" }}>
                        {/* Type badge */}
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: poll.type === "platform" ? "var(--accent)" : "var(--surface-hover)",
                            color: poll.type === "platform" ? "white" : "var(--foreground)",
                            fontWeight: 600,
                            fontSize: "11px",
                            textTransform: "uppercase",
                          }}
                        >
                          {poll.type}
                        </span>
                        {/* Status badge */}
                        <span
                          style={{
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: poll.status === "open" ? "#16a34a" : "var(--muted)",
                            color: "white",
                            fontWeight: 600,
                            fontSize: "11px",
                            textTransform: "uppercase",
                          }}
                        >
                          {poll.status}
                        </span>
                        <span>{poll.total_votes} votes</span>
                        <span>{poll.options.length} options</span>
                        <span>{timeAgo(poll.created_at)}</span>
                        {poll.creator && <span>by @{poll.creator.username}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                      {poll.status === "open" && (
                        <button
                          onClick={() => handleClose(poll.id)}
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
                          Close
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(poll.id)}
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
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Options summary */}
                  <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {poll.options.map((opt) => (
                      <span
                        key={opt.id}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "var(--surface-hover, rgba(0,0,0,0.04))",
                          fontSize: "12px",
                          color: "var(--foreground)",
                        }}
                      >
                        {opt.label} ({opt.vote_count})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
