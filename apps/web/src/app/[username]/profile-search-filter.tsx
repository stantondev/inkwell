"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileSearchBar, type ProfileFilters } from "./profile-search-bar";
import { ProfileEntries, profileEntriesKey } from "./profile-entries";
import type { ArchiveMonth } from "./profile-archive";
import type { ProfileStyles } from "@/lib/profile-styles";
import { EMPTY_PROFILE_FILTERS } from "@/lib/profile-archive-params";

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

function archiveUrl(filters: ProfileFilters, page: number): string | null {
  const url = new URL(window.location.href);
  const set = (k: string, v: string | number | null | undefined) => {
    if (v === null || v === undefined || v === "") url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  };
  set("q", filters.q);
  set("category", filters.category);
  set("tag", filters.tag);
  set("year", filters.year);
  set("month", filters.year ? filters.month : null);
  set("sort", filters.sort === "oldest" ? "oldest" : null);
  set("page", page > 1 ? page : null);
  const next = url.pathname + (url.search ? url.search : "") + url.hash;
  return next !== window.location.pathname + window.location.search + window.location.hash ? next : null;
}

interface ProfileSearchFilterProps {
  username: string;
  displayMode: "full" | "cards" | "preview" | "magazine";
  initialEntries: ProfileEntry[];
  totalCount: number;
  styles: ProfileStyles;
  entryYears: number[];
  entryMonths?: ArchiveMonth[];
  entryTags: { tag: string; count: number }[];
  entryCategories: { category: string; count: number }[];
  perPage?: number;
  initialFilters?: ProfileFilters;
  initialPage?: number;
  /** Total the server returned for the initial filters/page. */
  initialFilteredTotal?: number;
}

export function ProfileSearchFilter({
  username,
  displayMode,
  initialEntries,
  totalCount,
  styles,
  entryYears,
  entryMonths = [],
  entryTags,
  entryCategories,
  perPage,
  initialFilters = EMPTY_PROFILE_FILTERS,
  initialPage = 1,
  initialFilteredTotal,
}: ProfileSearchFilterProps) {
  const [filters, setFilters] = useState<ProfileFilters>(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [resultCount, setResultCount] = useState(initialFilteredTotal ?? totalCount);
  const [initialKey] = useState(() => profileEntriesKey(initialFilters, initialPage));

  const isFiltering = !!(filters.q || filters.category || filters.tag || filters.year || filters.sort !== "newest");

  const handleFiltersChange = useCallback((newFilters: ProfileFilters) => {
    setFilters(newFilters);
    setPage(1);
  }, []);

  // Keep the archive position in the URL. Through Next's router (replace, not
  // push: Back should leave the profile, not step through every click), so
  // the page Next restores on Back is this one; a bare history.replaceState
  // left Next's saved copy at the old URL and Back reset to page 1.
  const router = useRouter();
  useEffect(() => {
    const next = archiveUrl(filters, page);
    if (next) router.replace(next, { scroll: false });
  }, [filters, page, router]);

  return (
    <>
      <ProfileSearchBar
        styles={styles}
        entryYears={entryYears}
        entryMonths={entryMonths}
        entryTags={entryTags}
        entryCategories={entryCategories}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        totalCount={resultCount}
        isFiltering={isFiltering}
      />
      <ProfileEntries
        username={username}
        displayMode={displayMode}
        initialEntries={initialEntries}
        totalCount={initialFilteredTotal ?? totalCount}
        styles={styles}
        filters={filters}
        perPage={perPage}
        page={page}
        onPageChange={setPage}
        onTotalChange={setResultCount}
        initialKey={initialKey}
      />
    </>
  );
}
