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

  const isOpen = poll.status === "open" && (!poll.closes_at || new Date(poll.closes_at) > new Date());
  const hasVoted = poll.my_vote != null;
  const showResults = hasVoted || !isOpen || !isLoggedIn;

  // Find the leading option for winner highlighting
  const maxVotes = Math.max(...poll.options.map((o) => o.vote_count));
  const leadingId = poll.total_votes > 0 ? poll.options.find((o) => o.vote_count === maxVotes)?.id : null;

  const handleVote = useCallback(async () => {
    if (!selected || voting) return;
    setVoting(true);
    setError(null);

    const optimisticPoll = { ...poll };
    optimisticPoll.my_vote = selected;
    optimisticPoll.total_votes = poll.total_votes + 1;
    optimisticPoll.options = poll.options.map((opt) => {
      if (opt.id === selected) {
        const newCount = opt.vote_count + 1;
        return { ...opt, vote_count: newCount, percentage: Math.round((newCount / (poll.total_votes + 1)) * 100) };
      }
      return { ...opt, percentage: Math.round((opt.vote_count / (poll.total_votes + 1)) * 100) };
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

  const closesAt = poll.closes_at ? new Date(poll.closes_at) : null;
  const closesLabel = closesAt
    ? isOpen
      ? `Closes ${formatTimeRemaining(closesAt)}`
      : `Sealed ${formatTimeAgo(closesAt)}`
    : null;

  return (
    <div className={`poll-card ${compact ? "poll-card--compact" : ""}`}>
      {/* Paper texture overlay */}
      <svg className="poll-card-texture" aria-hidden="true">
        <filter id="pollPaperNoise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#pollPaperNoise)" opacity="0.03" />
      </svg>

      {/* Status badge */}
      {!isOpen && (
        <div className="poll-sealed-badge">Sealed</div>
      )}

      {showResults && isOpen && hasVoted && (
        <div className="poll-voted-badge">Voted</div>
      )}

      {/* Question */}
      <h3 className={`poll-question ${compact ? "poll-question--compact" : ""}`}>
        {poll.question}
      </h3>

      {/* Section header for results */}
      {showResults && !isOpen && !compact && (
        <>
          <div className="poll-ornament" aria-hidden="true"><span>· · ·</span></div>
          <div className="poll-final-results">Final Results</div>
        </>
      )}

      {/* Options */}
      <div className={`poll-options ${compact ? "poll-options--compact" : ""}`}>
        {poll.options.map((opt) =>
          showResults ? (
            <ResultBar
              key={opt.id}
              option={opt}
              isMyVote={poll.my_vote === opt.id}
              isLeading={opt.id === leadingId}
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

      {/* Vote CTA */}
      {!showResults && (
        <button
          onClick={handleVote}
          disabled={!selected || voting}
          className="poll-vote-cta"
        >
          {voting ? "Casting..." : "Cast your vote"}
        </button>
      )}

      {/* Error */}
      {error && (
        <p className="poll-error">{error}</p>
      )}

      {/* Join CTA */}
      {!isLoggedIn && isOpen && (
        <p className="poll-join-cta">
          <a href="/get-started">Join Inkwell</a> to have your say.
        </p>
      )}

      {/* Footer */}
      <div className={`poll-footer ${compact ? "poll-footer--compact" : ""}`}>
        <span className="poll-footer-votes">
          {poll.total_votes} {poll.total_votes === 1 ? "vote" : "votes"} cast
        </span>
        {closesLabel && <span className="poll-footer-time">{closesLabel}</span>}
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
      className={`poll-vote-option ${selected ? "poll-vote-option--selected" : ""} ${compact ? "poll-vote-option--compact" : ""}`}
    >
      <span className={`poll-radio ${selected ? "poll-radio--selected" : ""}`}>
        {selected && <span className="poll-radio-dot" />}
      </span>
      <span>{option.label}</span>
    </button>
  );
}

function ResultBar({
  option,
  isMyVote,
  isLeading,
  totalVotes,
  compact,
}: {
  option: PollOption;
  isMyVote: boolean;
  isLeading: boolean;
  totalVotes: number;
  compact: boolean;
}) {
  const pct = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;

  return (
    <div className={`poll-result ${isMyVote ? "poll-result--mine" : ""} ${isLeading ? "poll-result--leading" : ""} ${compact ? "poll-result--compact" : ""}`}>
      <div className="poll-result-fill" style={{ width: `${pct}%` }} />
      <div className="poll-result-content">
        <span className="poll-result-label">
          {isMyVote && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {option.label}
          {isLeading && !compact && <span className="poll-result-leading-tag">Leading</span>}
        </span>
        <span className={`poll-result-pct ${isLeading ? "poll-result-pct--leading" : ""}`}>
          {pct}%{!compact && <span className="poll-result-count">({option.vote_count})</span>}
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
