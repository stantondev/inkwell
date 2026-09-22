import type { ProfileFilters } from "@/app/[username]/profile-search-bar";

export const EMPTY_PROFILE_FILTERS: ProfileFilters = {
  q: "",
  category: null,
  tag: null,
  year: null,
  month: null,
  sort: "newest",
};

/**
 * Filters and page as they appear in the profile URL:
 * `?year=2004&month=12&page=3&sort=oldest&tag=…&category=…&q=…`.
 * Shared by the server (to render the right page) and the client.
 */
export function profileFiltersFromParams(params: Record<string, string | string[] | undefined>): {
  filters: ProfileFilters;
  page: number;
} {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const int = (k: string, min: number, max: number) => {
    const n = Number(one(k));
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const year = int("year", 1900, 3000);

  return {
    filters: {
      q: (one("q") ?? "").slice(0, 200),
      category: one("category") || null,
      tag: one("tag") || null,
      year,
      month: year ? int("month", 1, 12) : null,
      sort: one("sort") === "oldest" ? "oldest" : "newest",
    },
    page: int("page", 1, 100000) ?? 1,
  };
}


/** API query for one page of a profile's entries at this archive position. */
export function archiveQuery(a: { filters: ProfileFilters; page: number }, perPage: number): string {
  const p = new URLSearchParams();
  p.set("page", String(a.page));
  p.set("per_page", String(perPage));
  const f = a.filters;
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.tag) p.set("tag", f.tag);
  if (f.year) p.set("year", String(f.year));
  if (f.year && f.month) p.set("month", String(f.month));
  if (f.sort === "oldest") p.set("sort", "oldest");
  return p.toString();
}
