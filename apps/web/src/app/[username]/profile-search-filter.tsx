"use client";

import { useState, useCallback } from "react";
import { ProfileSearchBar, type ProfileFilters } from "./profile-search-bar";
import { ProfileEntries } from "./profile-entries";
import type { ProfileStyles } from "@/lib/profile-styles";

interface ProfileEntry {
  id: string;
  slug: string;
  title: string | null;
  body_html: string;
  mood: string | null;
  music: string | null;
  tags: string[];
  stamps?: string[];
  comment_count?: number;
  published_at: string;
  word_count?: number;
  excerpt?: string | null;
  cover_image_id?: string | null;
  category?: string | null;
}

interface ProfileSearchFilterProps {
  username: string;
  displayMode: "full" | "cards" | "preview";
  initialEntries: ProfileEntry[];
  totalCount: number;
  styles: ProfileStyles;
  entryYears: number[];
  entryTags: { tag: string; count: number }[];
  entryCategories: { category: string; count: number }[];
}

export function ProfileSearchFilter({
  username,
  displayMode,
  initialEntries,
  totalCount,
  styles,
  entryYears,
  entryTags,
  entryCategories,
}: ProfileSearchFilterProps) {
  const [filters, setFilters] = useState<ProfileFilters>({
    q: "",
    category: null,
    tag: null,
    year: null,
    sort: "newest",
  });

  const isFiltering = !!(filters.q || filters.category || filters.tag || filters.year || filters.sort !== "newest");

  const handleFiltersChange = useCallback((newFilters: ProfileFilters) => {
    setFilters(newFilters);
  }, []);

  return (
    <>
      <ProfileSearchBar
        styles={styles}
        entryYears={entryYears}
        entryTags={entryTags}
        entryCategories={entryCategories}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={totalCount}
        isFiltering={isFiltering}
      />
      <ProfileEntries
        username={username}
        displayMode={displayMode}
        initialEntries={initialEntries}
        totalCount={totalCount}
        styles={styles}
        filters={filters}
      />
    </>
  );
}
