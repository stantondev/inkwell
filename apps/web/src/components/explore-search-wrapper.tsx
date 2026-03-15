"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExploreSearchBar } from "@/components/explore-search-bar";
import { ExploreSearchResults } from "@/components/explore-search-results";

interface ExploreSearchWrapperProps {
  children: React.ReactNode;
}

export function ExploreSearchWrapper({ children }: ExploreSearchWrapperProps) {
  const searchParams = useSearchParams();
  const [activeQuery, setActiveQuery] = useState(searchParams.get("q") || "");

  const isSearching = activeQuery.trim().length > 0;

  return (
    <>
      {/* Hero search bar */}
      <div className="mx-auto max-w-7xl px-4 pt-6 pb-3">
        <ExploreSearchBar
          initialQuery={searchParams.get("q") || ""}
          onQueryChange={setActiveQuery}
        />
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
