import type { SearchTab } from "./search-tabs";

interface SearchLoadingProps {
  tab: SearchTab;
}

function PersonSkeleton() {
  return (
    <div className="catalog-skeleton">
      <div className="catalog-skeleton-circle" />
      <div className="catalog-skeleton-lines">
        <div className="catalog-skeleton-line" />
        <div className="catalog-skeleton-line" />
        <div className="catalog-skeleton-line" />
      </div>
    </div>
  );
}

function EntrySkeleton() {
  return (
    <div className="catalog-skeleton catalog-skeleton-entry">
      <div className="catalog-skeleton-lines">
        <div className="catalog-skeleton-line" style={{ width: "35%" }} />
        <div className="catalog-skeleton-line" style={{ width: "60%" }} />
        <div className="catalog-skeleton-line" style={{ width: "90%" }} />
      </div>
    </div>
  );
}

export function SearchLoading({ tab }: SearchLoadingProps) {
  const text = tab === "fediverse"
    ? "Reaching across the open web..."
    : "Searching the stacks...";

  return (
    <div className="catalog-results">
      <p className="catalog-loading-text">{text}</p>
      {tab === "fediverse" ? (
        <PersonSkeleton />
      ) : tab === "users" ? (
        <>
          <PersonSkeleton />
          <PersonSkeleton />
          <PersonSkeleton />
        </>
      ) : (
        <>
          <EntrySkeleton />
          <EntrySkeleton />
          <EntrySkeleton />
        </>
      )}
    </div>
  );
}
