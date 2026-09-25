import type { JournalEntry } from "@/components/journal-entry-card";

/**
 * Estimate how "tall" an entry will render (arbitrary units, not pixels).
 * Short fediverse posts ≈ 1.5, medium posts ≈ 3, long posts with images ≈ 5+
 */
function estimateWeight(entry: JournalEntry): number {
  // Stickies are short and fixed-width: about three fit on a half-page.
  if (entry.kind === "sticky") {
    const len = entry.body_html ? entry.body_html.replace(/<[^>]+>/g, "").length : 0;
    return 1.6 + (len > 250 ? 0.6 : 0);
  }

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
  // Fediverse video/audio players
  weight += (entry.body_html?.match(/<video/gi) || []).length * 1.2;
  weight += (entry.body_html?.match(/<audio/gi) || []).length * 0.3;

  if (entry.tags && entry.tags.length > 3) weight += 0.3;
  if (entry.music) weight += 0.5;

  return weight;
}

/** Target weight per half-page — generous to pack more entries */
const PAGE_TARGET_WEIGHT = 6;

/**
 * Pack entries into half-pages using weight estimation, in reading order.
 * Short entries share a half-page; long ones may get a half-page alone.
 * JournalFeed pairs the halves into spreads, after any front pages (Explore's
 * "Writers to meet" and "Most inked this month").
 */
export function packEntriesIntoHalves(entries: JournalEntry[]): JournalEntry[][] {
  const halves: JournalEntry[][] = [];
  let i = 0;

  while (i < entries.length) {
    const half: JournalEntry[] = [];
    let weight = 0;
    while (i < entries.length && weight < PAGE_TARGET_WEIGHT) {
      const w = estimateWeight(entries[i]);
      if (half.length > 0 && weight + w > PAGE_TARGET_WEIGHT + 1) break;
      half.push(entries[i]);
      weight += w;
      i++;
    }
    halves.push(half);
  }

  return halves;
}
