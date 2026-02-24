const statusConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
  new: { bg: "transparent", border: "var(--border)", text: "var(--muted)", label: "New" },
  under_review: { bg: "#DBEAFE", border: "#93C5FD", text: "#1D4ED8", label: "Under Review" },
  planned: { bg: "#e8eef7", border: "#93b4f0", text: "#2d4a8a", label: "Planned" },
  in_progress: { bg: "#FEF3C7", border: "#FCD34D", text: "#B45309", label: "In Progress" },
  done: { bg: "#D1FAE5", border: "#6EE7B7", text: "#047857", label: "Done" },
  declined: { bg: "#FEE2E2", border: "#FCA5A5", text: "#B91C1C", label: "Declined" },
};

const categoryConfig: Record<string, { border: string; text: string; label: string }> = {
  bug: { border: "#FCA5A5", text: "#B91C1C", label: "Bug" },
  feature: { border: "#93C5FD", text: "#1D4ED8", label: "Feature" },
  idea: { border: "#FCD34D", text: "#B45309", label: "Idea" },
  question: { border: "#6EE7B7", text: "#047857", label: "Question" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.new;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
      style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const cfg = categoryConfig[category] ?? categoryConfig.idea;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
      style={{ background: "transparent", borderColor: cfg.border, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: "#6B7280", label: "Low" },
  medium: { color: "#D97706", label: "Med" },
  high: { color: "#EA580C", label: "High" },
  critical: { color: "#DC2626", label: "Crit" },
};

export function ScoreBadge({
  score,
  priority,
}: {
  score: number | null;
  priority: string | null;
}) {
  if (score == null) return null;

  const pCfg = priority ? priorityConfig[priority] : null;
  const bgColor =
    score >= 70
      ? "#ECFDF5"
      : score >= 50
        ? "#FEF3C7"
        : "#F3F4F6";
  const borderColor =
    score >= 70
      ? "#6EE7B7"
      : score >= 50
        ? "#FCD34D"
        : "#D1D5DB";
  const textColor =
    score >= 70
      ? "#047857"
      : score >= 50
        ? "#B45309"
        : "#6B7280";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border tabular-nums"
      style={{ background: bgColor, borderColor, color: textColor }}
      title={`Score ${score}/100${pCfg ? ` · Priority: ${pCfg.label}` : ""}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      {score}
    </span>
  );
}
