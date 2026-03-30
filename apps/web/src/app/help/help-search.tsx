"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { HELP_ENTRIES, type HelpEntry } from "@/lib/help-content";

export function HelpSearch() {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    return HELP_ENTRIES.filter((entry) => {
      const haystack = [
        entry.title,
        entry.snippet,
        ...entry.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((word) => haystack.includes(word));
    }).slice(0, 12);
  }, [query]);

  const showResults = query.trim().length >= 2;

  return (
    <div className="mb-8">
      <div
        className="relative rounded-xl border overflow-hidden"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {/* Search icon */}
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--muted)" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for answers..."
          className="w-full pl-11 pr-4 py-3 text-sm bg-transparent outline-none"
          style={{
            color: "var(--foreground)",
            fontFamily: "var(--font-lora, Georgia, serif)",
            fontStyle: "italic",
          }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-full"
            style={{ color: "var(--muted)", background: "var(--background)" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      {showResults && (
        <div className="mt-3 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
              No results found. Try a different search, or{" "}
              <Link href="/help/contact" className="underline" style={{ color: "var(--accent)" }}>
                contact us
              </Link>{" "}
              for help.
            </p>
          ) : (
            results.map((entry) => (
              <SearchResult key={entry.id} entry={entry} query={query} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SearchResult({ entry, query }: { entry: HelpEntry; query: string }) {
  return (
    <Link
      href={entry.href}
      className="help-search-result block rounded-lg border p-3 transition-colors"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <span
        className="block text-sm font-semibold mb-0.5"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        {entry.title}
      </span>
      <span className="block text-xs" style={{ color: "var(--muted)" }}>
        {entry.snippet}
      </span>
    </Link>
  );
}
