import Link from "next/link";

interface SeriesNavProps {
  series: {
    title: string;
    slug: string;
    status: string;
    entry_count: number;
    username: string;
    prev_entry?: { slug: string; title: string | null } | null;
    next_entry?: { slug: string; title: string | null } | null;
  };
  currentOrder: number;
}

export function SeriesNav({ series, currentOrder }: SeriesNavProps) {
  return (
    <div
      className="rounded-xl border p-4 mb-8"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Series info */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
          Part {currentOrder} of {series.entry_count}
        </span>
        <span aria-hidden="true" style={{ color: "var(--border)" }}>·</span>
        <Link
          href={`/${series.username}/series/${series.slug}`}
          className="text-sm font-medium hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {series.title}
        </Link>
        {series.status === "completed" && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: "var(--accent-light)", color: "var(--accent)" }}
          >
            Completed
          </span>
        )}
      </div>

      {/* Prev / Next navigation */}
      <div className="flex items-center justify-between gap-4">
        {series.prev_entry ? (
          <Link
            href={`/${series.username}/${series.prev_entry.slug}`}
            className="flex items-center gap-1.5 text-sm transition-colors hover:underline min-w-0"
            style={{ color: "var(--muted)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            <span className="truncate">{series.prev_entry.title || "Previous"}</span>
          </Link>
        ) : (
          <span />
        )}

        {series.next_entry ? (
          <Link
            href={`/${series.username}/${series.next_entry.slug}`}
            className="flex items-center gap-1.5 text-sm transition-colors hover:underline min-w-0 text-right"
            style={{ color: "var(--muted)" }}
          >
            <span className="truncate">{series.next_entry.title || "Next"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
