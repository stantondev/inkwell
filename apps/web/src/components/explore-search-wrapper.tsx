"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { ExploreSearchResults } from "@/components/explore-search-results";

interface ExploreSearchWrapperProps {
  children: React.ReactNode;
  /** Beside the search box: tabs, topics, sort. */
  controls?: React.ReactNode;
  /** One slim line under the row (signup, tips). */
  notice?: React.ReactNode;
}

// Explore's header: the search box and the controls share one row, with at
// most one notice line under it, so the book starts near the top of the page.
// While searching, results appear under the header and the book dims.
export function ExploreSearchWrapper({ children, controls, notice }: ExploreSearchWrapperProps) {
  const searchParams = useSearchParams();
  const [activeQuery, setActiveQuery] = useState(searchParams.get("q") || "");

  const isSearching = activeQuery.trim().length > 0;

  return (
    <>
      <div className="explore-top mx-auto max-w-7xl px-4">
        <div className="explore-top-row">
          <ExploreSearchBar
            initialQuery={searchParams.get("q") || ""}
            onQueryChange={setActiveQuery}
          />
          {controls && <div className="explore-top-controls">{controls}</div>}
        </div>
        {notice}
      </div>

      {/* Search results panel — slides in when query is active */}
      {isSearching && (
        <div className="mx-auto max-w-7xl px-4 pb-4">
          <ExploreSearchResults query={activeQuery} />
        </div>
      )}

      {/* Browsing content — dims when searching */}
      <div className={isSearching ? "explore-feed-dimmed" : ""}>
        {children}
      </div>
    </>
  );
}
