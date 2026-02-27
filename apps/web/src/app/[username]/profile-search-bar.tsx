"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getCategoryLabel } from "@/lib/categories";
import type { ProfileStyles } from "@/lib/profile-styles";

export interface ProfileFilters {
  q: string;
  category: string | null;
  tag: string | null;
  year: number | null;
  sort: "newest" | "oldest";
}

interface TagMeta {
  tag: string;
  count: number;
}

interface CategoryMeta {
  category: string;
  count: number;
}

interface ProfileSearchBarProps {
  styles: ProfileStyles;
  entryYears: number[];
  entryTags: TagMeta[];
  entryCategories: CategoryMeta[];
  filters: ProfileFilters;
  onFiltersChange: (filters: ProfileFilters) => void;
  totalCount: number;
  isFiltering: boolean;
}

export function ProfileSearchBar({
  styles,
  entryYears,
  entryTags,
  entryCategories,
  filters,
  onFiltersChange,
  totalCount,
  isFiltering,
}: ProfileSearchBarProps) {
  const [searchInput, setSearchInput] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: value });
    }, 400);
  }, [filters, onFiltersChange]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters = filters.q || filters.category || filters.tag || filters.year || filters.sort !== "newest";

  function clearAll() {
    setSearchInput("");
    onFiltersChange({ q: "", category: null, tag: null, year: null, sort: "newest" });
  }

  // Top 10 tags
  const displayTags = entryTags.slice(0, 10);

  return (
    <div className="flex flex-col gap-3 mb-6">
      {/* Search input + sort */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: styles.muted }}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search entries..."
            className={`profile-widget-card w-full ${styles.borderRadius} border py-2 pl-9 pr-3 text-sm outline-none transition-colors`}
            style={{
              ...styles.surface,
              color: styles.foreground,
            }}
          />
          {searchInput && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:opacity-70"
              style={{ color: styles.muted }}
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort toggle */}
        <button
          onClick={() =>
            onFiltersChange({ ...filters, sort: filters.sort === "newest" ? "oldest" : "newest" })
          }
          className={`profile-widget-card ${styles.borderRadius} border px-3 py-2 text-xs font-medium shrink-0 transition-colors hover:opacity-80`}
          style={{
            ...styles.surface,
            color: filters.sort === "oldest" ? styles.accent : styles.muted,
          }}
          title={`Sort: ${filters.sort === "newest" ? "Newest first" : "Oldest first"}`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4" />
            </svg>
            {filters.sort === "newest" ? "Newest" : "Oldest"}
          </span>
        </button>
      </div>

      {/* Filter row: category dropdown + year dropdown + tag pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Category dropdown */}
        {entryCategories.length > 0 && (
          <select
            value={filters.category ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, category: e.target.value || null })
            }
            className={`profile-widget-card ${styles.borderRadius} border py-1.5 pl-2.5 pr-7 text-xs outline-none cursor-pointer`}
            style={{
              ...styles.surface,
              color: filters.category ? styles.accent : styles.muted,
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            <option value="">All categories</option>
            {entryCategories.map((c) => (
              <option key={c.category} value={c.category}>
                {getCategoryLabel(c.category)} ({c.count})
              </option>
            ))}
          </select>
        )}

        {/* Year dropdown */}
        {entryYears.length > 1 && (
          <select
            value={filters.year ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, year: e.target.value ? Number(e.target.value) : null })
            }
            className={`profile-widget-card ${styles.borderRadius} border py-1.5 pl-2.5 pr-7 text-xs outline-none cursor-pointer`}
            style={{
              ...styles.surface,
              color: filters.year ? styles.accent : styles.muted,
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
            }}
          >
            <option value="">All years</option>
            {entryYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}

        {/* Tag pills */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {displayTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() =>
                  onFiltersChange({ ...filters, tag: filters.tag === tag ? null : tag })
                }
                className={`profile-tag-chip text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  filters.tag === tag ? "font-medium" : ""
                }`}
                style={
                  filters.tag === tag
                    ? { background: styles.accent, borderColor: styles.accent, color: "#fff" }
                    : { borderColor: styles.border, color: styles.muted }
                }
              >
                #{tag}
                <span className="ml-0.5 opacity-60">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active filter indicators + result count */}
      {isFiltering && (
        <div className="flex items-center gap-2 text-xs" style={{ color: styles.muted }}>
          <span>
            {totalCount} {totalCount === 1 ? "result" : "results"}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 hover:underline"
              style={{ color: styles.accent }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
