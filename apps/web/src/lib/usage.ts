/**
 * Feature usage: which features people use, so the ones nobody uses can be
 * retired. Counts use, not people: see Inkwell.Usage on the API (daily
 * totals, each member's first and last day per feature, signed-out visitors
 * counted once a day by a hash that's never stored) and Privacy §1.3.
 *
 * Call `trackFeature("gazette")` when someone uses a feature that leaves no
 * trace of its own (a page, a toggle, a client-only action). Things that
 * already save something (an entry, a stamp, a letter) are counted from the
 * database; don't track them again. Each browser reports a feature at most
 * once a day, so calling it on every render or page view is fine.
 *
 * **These keys must match the `:tracked` features in
 * `apps/api/lib/inkwell/usage/catalog.ex`** (a test checks). Never rename one.
 */
export const FEATURES = [
  "scheduled_posts",
  "drafts_page",
  "posts_bulk",
  "posts_export",
  "version_history",
  "translate",
  "stamp_album",
  "reader_stats",
  "share",
  "circles",
  "gazette",
  "arrange",
  "site_export",
  "feed",
  "explore",
  "explore_fediverse",
  "explore_waiting",
  "explore_ribbon",
  "search",
  "help",
  "whats_new",
  "play",
] as const;

export type Feature = (typeof FEATURES)[number];

/** Steps a feature may report, beyond "used it". Only these are counted. */
export type FeatureAction = {
  play: "opened" | "letter_started" | "letter_delivered" | "writer_named";
};

/** Details a feature may add to a step (the game: its level). */
export type FeatureDetail = {
  play: "easy" | "medium" | "hard";
};

const STORAGE_KEY = "inkwell-usage-sent";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Which feature/action pairs this browser already reported today.
function sentToday(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (raw && raw.day === today() && Array.isArray(raw.keys)) return new Set(raw.keys);
  } catch {
    /* storage blocked or unreadable: we'll just send */
  }
  return new Set();
}

function remember(keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: today(), keys: [...keys] }));
  } catch {
    /* private mode: the server dedupes the day anyway */
  }
}

// Within one page load, even without storage.
const sentThisPage = new Set<string>();

/**
 * Record that this feature was used (once a day per browser), or that a step
 * happened (every call: the game's `trackFeature("play", "letter_delivered",
 * "hard")`, so call it once per letter, not on every render). Never throws,
 * never blocks.
 */
export function trackFeature<F extends Feature>(
  feature: F,
  action?: F extends keyof FeatureAction ? FeatureAction[F] : never,
  detail?: F extends keyof FeatureDetail ? FeatureDetail[F] : never
): void {
  if (typeof window === "undefined") return;

  // Plain "used it" is sent once a day per browser. Steps (the game's
  // letters) are sent every time: each one is something that happened, and
  // the server counts them per member ("delivered 14 letters").
  if (!action) {
    if (sentThisPage.has(feature)) return;
    sentThisPage.add(feature);

    const sent = sentToday();
    if (sent.has(feature)) return;
    sent.add(feature);
    remember(sent);
  }

  try {
    fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature, action, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let counting break a page */
  }
}
