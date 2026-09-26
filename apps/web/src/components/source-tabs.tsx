import { FilterLink } from "@/components/filter-link";

export type FeedSource = "inkwell" | "fediverse";

/**
 * Inkwell | Fediverse switch for tag and topic pages, drawn like Explore's.
 *
 * These pages list Inkwell writing by default and keep fediverse posts on
 * their own tab, which is noindex: those posts belong to other servers, and
 * many of their writers haven't opted in to search (Mastodon's "indexable"),
 * which a mixed page can't honour post by post.
 */
export function SourceTabs({
  active,
  hrefFor,
  label,
}: {
  active: FeedSource;
  hrefFor: (source: FeedSource) => string;
  label: string;
}) {
  return (
    <nav className="explore-controls-source explore-tabs" aria-label={label}>
      {([
        { label: "Inkwell", value: "inkwell" },
        { label: "Fediverse", value: "fediverse" },
      ] as const).map((s) => (
        <FilterLink
          key={s.value}
          href={hrefFor(s.value)}
          className={`explore-controls-source-segment${active === s.value ? " active" : ""}`}
          aria-current={active === s.value ? "page" : undefined}
        >
          {s.value === "inkwell" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          )}
          <span>{s.label}</span>
        </FilterLink>
      ))}
    </nav>
  );
}
