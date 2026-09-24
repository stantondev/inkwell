import { CATEGORIES } from "@/lib/categories";

/**
 * The one-line description shown on the phone "Filters" row. `defaultSource`
 * is what the page shows with no ?source= (Feed: everything; Explore: Inkwell).
 */
export function filterSummary(
  category: string | null | undefined,
  source: string | null,
  sort: string,
  defaultSource: string | null,
  defaultLabel: string,
): { summary: string; active: boolean } {
  const parts: string[] = [];
  if (category) parts.push(CATEGORIES.find((c) => c.value === category)?.label ?? category);
  if (source !== defaultSource) {
    parts.push(source === "inkwell" ? "Inkwell only" : source === "fediverse" ? "Fediverse only" : "Inkwell + fediverse");
  }
  if (sort === "most_inked") parts.push("Most inked");
  return parts.length ? { summary: parts.join(" · "), active: true } : { summary: defaultLabel, active: false };
}
