"use client";

import { useState, useEffect, useRef } from "react";
import { SearchInput } from "./search-input";
import { SearchTabs, type SearchTab } from "./search-tabs";
import { SearchEmptyState } from "./search-empty-state";
import { SearchLoading } from "./search-loading";
import { PeopleResults } from "./search-results-people";
import { EntryResults } from "./search-results-entries";
import { FediverseResults } from "./search-results-fediverse";

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame?: string | null;
  subscription_tier?: string;
  bio: string | null;
}

interface SearchEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  published_at: string;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface FediverseResult {
  id: string;
  username: string;
  domain: string;
  display_name: string;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
  relationship_status?: "pending" | "accepted" | null;
}

const PLACEHOLDERS: Record<SearchTab, string> = {
  users: "Search for a writer by name...",
  entries: "Search for journal entries...",
  fediverse: "user@mastodon.social",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("users");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [fediverseResult, setFediverseResult] = useState<FediverseResult | null>(null);
  const [fediverseError, setFediverseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Detect fediverse handle and auto-switch tab
  const isFediverseHandle = /^@?[^@\s]+@[^@\s]+\.[^@\s]+$/.test(query.trim());

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setUsers([]);
      setEntries([]);
      setFediverseResult(null);
      setFediverseError(null);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setFediverseError(null);
      setSearchError(false);
      try {
        if (tab === "fediverse") {
          const res = await fetch(`/api/search/fediverse?q=${encodeURIComponent(query.trim())}`);
          if (res.ok) {
            const data = await res.json();
            setFediverseResult(data.data ?? null);
          } else {
            const data = await res.json().catch(() => ({}));
            setFediverseResult(null);
            setFediverseError(data.error || "Not found");
          }
        } else {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&type=${tab}`);
          if (res.ok) {
            const data = await res.json();
            if (tab === "users") setUsers(data.data ?? []);
            else setEntries((data.data ?? []).filter((e: SearchEntry) => e.author));
          }
        }
      } catch {
        setSearchError(true);
      } finally {
        setLoading(false);
        setHasSearched(true);
      }
    }, tab === "fediverse" ? 600 : 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tab]);

  function handleQueryChange(value: string) {
    setQuery(value);
  }

  function handleTabChange(newTab: SearchTab) {
    setTab(newTab);
    setHasSearched(false);
    // Focus input on tab change
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleRetry() {
    setSearchError(false);
    // Re-trigger search by toggling query
    const q = query;
    setQuery("");
    setTimeout(() => setQuery(q), 10);
  }

  const showEmpty = !loading && !hasSearched && !query.trim() && !searchError;
  const showResults = !loading && !searchError && hasSearched;

  return (
    <div className="catalog-page">
      <div className="catalog-container">
        {/* Header */}
        <div className="catalog-header">
          <div className="catalog-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2" />
              <line x1="2" y1="8" x2="22" y2="8" />
              <line x1="8" y1="8" x2="8" y2="21" />
              <line x1="11" y1="12" x2="18" y2="12" />
              <line x1="11" y1="15.5" x2="16" y2="15.5" />
            </svg>
          </div>
          <h1 className="catalog-title">The Card Catalog</h1>
          <div className="catalog-ornament">
            <span className="catalog-ornament-flourish">❧</span>
          </div>
          <p className="catalog-subtitle">
            Browse the stacks — find journals, writers,<br className="hidden sm:inline" /> and voices from across the fediverse
          </p>
        </div>

        {/* Search input */}
        <SearchInput
          ref={inputRef}
          query={query}
          onChange={handleQueryChange}
          placeholder={PLACEHOLDERS[tab]}
          showGlobe={tab === "fediverse"}
        />

        {/* Auto-detect fediverse hint */}
        {isFediverseHandle && tab !== "fediverse" && (
          <button className="catalog-fediverse-hint" onClick={() => handleTabChange("fediverse")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            That looks like a fediverse handle — search for them?
          </button>
        )}

        {/* Tabs */}
        <SearchTabs tab={tab} onTabChange={handleTabChange} />

        {/* Loading */}
        {loading && <SearchLoading tab={tab} />}

        {/* Error */}
        {!loading && searchError && (
          <div className="catalog-error">
            <p className="catalog-error-title">Something spilled</p>
            <p className="catalog-error-text">
              The card catalog is momentarily out of service. Try again in a moment.
            </p>
            <button className="catalog-error-retry" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}

        {/* Empty states */}
        {showEmpty && (
          <SearchEmptyState tab={tab} onQueryChange={handleQueryChange} onTabChange={handleTabChange} />
        )}

        {/* Results */}
        {showResults && tab === "users" && (
          <PeopleResults
            users={users}
            query={query}
            hasSearched={hasSearched}
            onTabChange={handleTabChange}
          />
        )}

        {showResults && tab === "entries" && (
          <EntryResults entries={entries} query={query} hasSearched={hasSearched} />
        )}

        {showResults && tab === "fediverse" && (
          <FediverseResults
            result={fediverseResult}
            error={fediverseError}
            hasSearched={hasSearched}
            query={query}
          />
        )}
      </div>
    </div>
  );
}
