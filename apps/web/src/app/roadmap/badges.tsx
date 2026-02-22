const statusConfig: Record<string, { bg: string; border: string; text: string; label: string }> = {
  new: { bg: "transparent", border: "var(--border)", text: "var(--muted)", label: "New" },
  under_review: { bg: "#DBEAFE", border: "#93C5FD", text: "#1D4ED8", label: "Under Review" },
  planned: { bg: "#EDE9FE", border: "#C4B5FD", text: "#6D28D9", label: "Planned" },
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
