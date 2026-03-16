"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSkeletonCards } from "../admin-skeleton";

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

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "platform" | "entry">("all");

  const fetchPolls = useCallback(async () => {
    try {
      const typeParam = typeFilter !== "all" ? `&type=${typeFilter}` : "";
      const res = await fetch(`/api/admin/polls?per_page=50${typeParam}`);
      const data = await res.json();
      if (data.data) setPolls(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, [typeFilter]);

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
    await fetch(`/api/admin/polls/${pollId}/close`, { method: "POST" });
    fetchPolls();
  };

  const handleDelete = async (pollId: string) => {
    if (!confirm("Delete this poll? This cannot be undone.")) return;
    await fetch(`/api/admin/polls/${pollId}`, { method: "DELETE" });
    fetchPolls();
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
    <div>
      {/* Create poll form */}
      <div className="admin-card admin-section">
        <h2 className="admin-card-header">Create Platform Poll</h2>

        <div style={{ marginBottom: "12px" }}>
          <label className="admin-label">Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What should we build next?"
            maxLength={500}
            className="admin-input"
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label className="admin-label">Options ({options.length}/10)</label>
          {options.map((opt, idx) => (
            <div key={idx} className="admin-form-row" style={{ marginBottom: "6px" }}>
              <input
                type="text"
                value={opt}
                onChange={(e) => updateOption(idx, e.target.value)}
                placeholder={`Option ${idx + 1}`}
                maxLength={200}
                className="admin-input"
                style={{ flex: 1 }}
              />
              {options.length > 2 && (
                <button onClick={() => removeOption(idx)} className="admin-btn admin-btn--outline admin-btn--sm">
                  &times;
                </button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <button onClick={addOption} className="admin-btn admin-btn--outline" style={{ width: "100%", borderStyle: "dashed" }}>
              + Add option
            </button>
          )}
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label className="admin-label">Close date (optional)</label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="admin-input"
            style={{ width: "100%" }}
          />
        </div>

        {createError && (
          <p style={{ color: "var(--danger, #dc2626)", fontSize: "13px", margin: "0 0 12px" }}>{createError}</p>
        )}

        <button onClick={handleCreate} disabled={creating} className="admin-btn admin-btn--primary">
          {creating ? "Creating..." : "Create Poll"}
        </button>
      </div>

      {/* Poll list */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h2 className="admin-card-header" style={{ margin: 0 }}>All Polls</h2>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["all", "platform", "entry"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setLoading(true); }}
              className={`admin-btn admin-btn--sm ${typeFilter === t ? "admin-btn--primary" : "admin-btn--outline"}`}
            >
              {t === "all" ? "All" : t === "platform" ? "Platform" : "Entry"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <AdminSkeletonCards count={3} />
      ) : polls.length === 0 ? (
        <div className="admin-empty"><p>No polls yet.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {polls.map((poll) => (
            <div key={poll.id} className="admin-item-card">
              <div className="admin-item-card-layout">
                <div className="admin-item-card-content">
                  <h3 className="admin-item-card-title">{poll.question}</h3>
                  <div className="admin-item-card-meta">
                    <span className={`admin-badge ${poll.type === "platform" ? "admin-badge--accent" : "admin-badge--muted"}`}>
                      {poll.type}
                    </span>
                    <span className={`admin-badge ${poll.status === "open" ? "admin-badge--success" : "admin-badge--muted"}`}>
                      {poll.status}
                    </span>
                    <span>{poll.total_votes} votes</span>
                    <span>{poll.options.length} options</span>
                    <span>{timeAgo(poll.created_at)}</span>
                    {poll.creator && <span>by @{poll.creator.username}</span>}
                  </div>
                </div>

                <div className="admin-action-row">
                  {poll.status === "open" && (
                    <button onClick={() => handleClose(poll.id)} className="admin-btn admin-btn--outline admin-btn--sm">
                      Close
                    </button>
                  )}
                  <button onClick={() => handleDelete(poll.id)} className="admin-btn admin-btn--danger admin-btn--sm">
                    Delete
                  </button>
                </div>
              </div>

              {/* Options summary */}
              <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {poll.options.map((opt) => (
                  <span key={opt.id} className="admin-badge admin-badge--muted">
                    {opt.label} ({opt.vote_count})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
