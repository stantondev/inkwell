import type { JournalEntry } from "@/components/journal-entry-card";

/** A spread = left page + right page, each page holds 1+ entries */
export interface BookSpread {
  left: JournalEntry[];
  right: JournalEntry[];
}

/**
 * Estimate how "tall" an entry will render (arbitrary units, not pixels).
 * Short fediverse posts ≈ 1.5, medium posts ≈ 3, long posts with images ≈ 5+
 */
function estimateWeight(entry: JournalEntry): number {
  let weight = 1; // base: author row + date + actions

  if (entry.title) weight += 0.3;
  if (entry.cover_image_id) weight += 1.5;

  const textLen = entry.body_html
    ? entry.body_html.replace(/<[^>]+>/g, "").length
    : 0;

  if (textLen > 2000) weight += 4;
  else if (textLen > 1000) weight += 2.5;
  else if (textLen > 500) weight += 1.5;
  else if (textLen > 200) weight += 0.8;
  else weight += 0.3;

  // Uploaded images (not link preview embeds) — only count <img> inside entry content
  const imgCount = (entry.body_html?.match(/<img/gi) || []).length;
  weight += imgCount * 1;

  if (entry.tags && entry.tags.length > 3) weight += 0.3;
  if (entry.music) weight += 0.5;

  return weight;
}

/** Target weight per half-page — generous to pack more entries */
const PAGE_TARGET_WEIGHT = 6;

/**
 * Pack entries into book spreads using weight estimation.
 * Short entries get packed together, long entries may get a half-page alone.
 */
export function packEntriesIntoSpreads(entries: JournalEntry[]): BookSpread[] {
  const spreads: BookSpread[] = [];
  let i = 0;

  while (i < entries.length) {
    // Fill left page
    const left: JournalEntry[] = [];
    let leftWeight = 0;
    while (i < entries.length && leftWeight < PAGE_TARGET_WEIGHT) {
      const w = estimateWeight(entries[i]);
      if (left.length > 0 && leftWeight + w > PAGE_TARGET_WEIGHT + 1) break;
      left.push(entries[i]);
      leftWeight += w;
      i++;
    }

    // Fill right page
    const right: JournalEntry[] = [];
    let rightWeight = 0;
    while (i < entries.length && rightWeight < PAGE_TARGET_WEIGHT) {
      const w = estimateWeight(entries[i]);
      if (right.length > 0 && rightWeight + w > PAGE_TARGET_WEIGHT + 1) break;
      right.push(entries[i]);
      rightWeight += w;
      i++;
    }

    spreads.push({ left, right });
  }

  return spreads;
}
