"use client";

import { useState, useCallback } from "react";

interface PollOption {
  id: string;
  label: string;
  position: number;
  vote_count: number;
  percentage: number;
}

export interface PollData {
  id: string;
  question: string;
  type: "platform" | "entry";
  status: "open" | "closed";
  max_choices: number;
  closes_at: string | null;
  closed_at: string | null;
  total_votes: number;
  options: PollOption[];
  my_vote: string | null;
  comment_count: number;
  creator: { id: string | null; username: string; display_name: string; avatar_url: string | null };
  entry_id: string | null;
  created_at: string;
}

interface PollWidgetProps {
  poll: PollData;
  compact?: boolean;
  isLoggedIn: boolean;
}

export function PollWidget({ poll: initialPoll, compact = false, isLoggedIn }: PollWidgetProps) {
  const [poll, setPoll] = useState(initialPoll);
  const [selected, setSelected] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute effective status (server may say open but closes_at could be past)
  const isOpen = poll.status === "open" && (!poll.closes_at || new Date(poll.closes_at) > new Date());
  const hasVoted = poll.my_vote != null;
  const showResults = hasVoted || !isOpen || !isLoggedIn;

  const handleVote = useCallback(async () => {
    if (!selected || voting) return;
    setVoting(true);
    setError(null);

    // Optimistic update
    const optimisticPoll = { ...poll };
    optimisticPoll.my_vote = selected;
    optimisticPoll.total_votes = poll.total_votes + 1;
    optimisticPoll.options = poll.options.map((opt) => {
      if (opt.id === selected) {
        const newCount = opt.vote_count + 1;
        return {
          ...opt,
          vote_count: newCount,
          percentage: Math.round((newCount / (poll.total_votes + 1)) * 100),
        };
      }
      return {
        ...opt,
        percentage: Math.round((opt.vote_count / (poll.total_votes + 1)) * 100),
      };
    });
    setPoll(optimisticPoll);

    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selected }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setPoll(data.data);
      } else {
        setError(data.error || "Failed to vote");
        setPoll(initialPoll);
      }
    } catch {
      setError("Failed to vote");
      setPoll(initialPoll);
    } finally {
      setVoting(false);
    }
  }, [selected, voting, poll, initialPoll]);

  // Time remaining for closing
  const closesAt = poll.closes_at ? new Date(poll.closes_at) : null;
  const closesLabel = closesAt
    ? isOpen
      ? `Closes ${formatTimeRemaining(closesAt)}`
      : `Closed ${formatTimeAgo(closesAt)}`
    : null;

  return (
    <div
      className={`poll-widget ${compact ? "poll-widget--compact" : ""}`}
      style={{
        borderRadius: "var(--radius, 12px)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        padding: compact ? "12px" : "16px 20px",
      }}
    >
      {/* Question */}
      <h3
        className="poll-widget-question"
        style={{
          fontFamily: "var(--font-lora, Georgia, serif)",
          fontSize: compact ? "14px" : "16px",
          fontWeight: 600,
          margin: "0 0 12px 0",
          lineHeight: 1.4,
          color: "var(--foreground)",
        }}
      >
        {poll.question}
      </h3>

      {/* Closed badge */}
      {!isOpen && (
        <div
          style={{
            display: "inline-block",
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "2px 8px",
            borderRadius: "4px",
            background: "var(--muted)",
            color: "white",
            marginBottom: "10px",
          }}
        >
          Poll closed
        </div>
      )}

      {/* Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? "6px" : "8px" }}>
        {poll.options.map((opt) =>
          showResults ? (
            <ResultBar
              key={opt.id}
              option={opt}
              isMyVote={poll.my_vote === opt.id}
              totalVotes={poll.total_votes}
              compact={compact}
            />
          ) : (
            <VoteOption
              key={opt.id}
              option={opt}
              selected={selected === opt.id}
              onSelect={() => setSelected(opt.id)}
              compact={compact}
            />
          )
        )}
      </div>

      {/* Vote button */}
      {!showResults && (
        <button
          onClick={handleVote}
          disabled={!selected || voting}
          className="poll-vote-btn"
          style={{
            marginTop: "12px",
            padding: "8px 24px",
            borderRadius: "999px",
            border: "none",
            background: selected ? "var(--accent)" : "var(--muted)",
            color: "white",
            fontWeight: 600,
            fontSize: "13px",
            cursor: selected ? "pointer" : "default",
            opacity: voting ? 0.6 : 1,
            transition: "background 0.15s, opacity 0.15s",
          }}
        >
          {voting ? "Voting..." : "Vote"}
        </button>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: "var(--danger, #dc2626)", fontSize: "12px", margin: "8px 0 0" }}>{error}</p>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: compact ? "8px" : "12px",
          fontSize: compact ? "11px" : "12px",
          color: "var(--muted)",
        }}
      >
        <span>{poll.total_votes} {poll.total_votes === 1 ? "vote" : "votes"}</span>
        {closesLabel && <span>{closesLabel}</span>}
      </div>
    </div>
  );
}

function VoteOption({
  option,
  selected,
  onSelect,
  compact,
}: {
  option: PollOption;
  selected: boolean;
  onSelect: () => void;
  compact: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: "8px",
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accent-light, rgba(45, 74, 138, 0.08))" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "border-color 0.15s, background 0.15s",
        fontSize: compact ? "13px" : "14px",
        color: "var(--foreground)",
      }}
    >
      {/* Radio circle */}
      <span
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          border: `2px solid ${selected ? "var(--accent)" : "var(--muted)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected && (
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--accent)",
            }}
          />
        )}
      </span>
      <span>{option.label}</span>
    </button>
  );
}

function ResultBar({
  option,
  isMyVote,
  totalVotes,
  compact,
}: {
  option: PollOption;
  isMyVote: boolean;
  totalVotes: number;
  compact: boolean;
}) {
  const pct = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "8px",
        overflow: "hidden",
        border: isMyVote ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
        background: "var(--background, var(--surface))",
      }}
    >
      {/* Progress bar background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: `${pct}%`,
          background: isMyVote
            ? "var(--accent-light, rgba(45, 74, 138, 0.15))"
            : "var(--surface-hover, rgba(0,0,0,0.04))",
          transition: "width 0.4s ease",
        }}
      />
      {/* Content */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: compact ? "6px 10px" : "10px 12px",
          fontSize: compact ? "13px" : "14px",
        }}
      >
        <span
          style={{
            fontWeight: isMyVote ? 600 : 400,
            color: "var(--foreground)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {isMyVote && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {option.label}
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: compact ? "12px" : "13px",
            color: isMyVote ? "var(--accent)" : "var(--muted)",
            flexShrink: 0,
            marginLeft: "8px",
          }}
        >
          {pct}%{!compact && <span style={{ fontWeight: 400, marginLeft: "4px", fontSize: "12px" }}>({option.vote_count})</span>}
        </span>
      </div>
    </div>
  );
}

function formatTimeRemaining(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "now";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `in ${days}d`;
  if (hours > 0) return `in ${hours}h`;
  const mins = Math.floor(diff / (1000 * 60));
  return `in ${mins}m`;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 0) return "just now";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m ago`;
}
