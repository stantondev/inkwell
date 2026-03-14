import type { SearchTab } from "./search-tabs";

const SUGGESTION_TOPICS = [
  "poetry", "travel", "fiction", "tech", "music",
  "art", "philosophy", "food", "nature", "memoir",
];

interface SearchEmptyStateProps {
  tab: SearchTab;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: SearchTab) => void;
}

export function SearchEmptyState({ tab, onQueryChange, onTabChange }: SearchEmptyStateProps) {
  if (tab === "users") {
    return (
      <div className="catalog-empty">
        <div className="catalog-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <p className="catalog-empty-title">Who are you looking for?</p>
        <p className="catalog-empty-text">
          Search by name or username to find writers on Inkwell.
        </p>
        <p className="catalog-empty-text" style={{ marginTop: "0.75rem" }}>
          Looking for someone on Mastodon?{" "}
          <button
            onClick={() => onTabChange("fediverse")}
            style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px", fontSize: "inherit" }}
          >
            Try the Fediverse tab
          </button>
        </p>
      </div>
    );
  }

  if (tab === "entries") {
    return (
      <div className="catalog-empty">
        <div className="catalog-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <p className="catalog-empty-title">What are you reading today?</p>
        <p className="catalog-empty-text">
          Search for journal entries by title, content, or topic.
        </p>
        <div className="catalog-suggestions">
          {SUGGESTION_TOPICS.map((topic) => (
            <button
              key={topic}
              className="catalog-suggestion-pill"
              onClick={() => onQueryChange(topic)}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Fediverse tab
  return (
    <div className="catalog-empty">
      <div className="catalog-empty-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <p className="catalog-empty-title">Find writers across the open web</p>
      <p className="catalog-empty-text">
        Enter a handle like{" "}
        <code>user@mastodon.social</code>
        {" "}to find and follow people on Mastodon, Pixelfed, and other fediverse platforms.
      </p>
    </div>
  );
}
