/**
 * Plain-English wording for Admin → Growth. The API (Inkwell.Growth) decides
 * each signup's source; this turns sources, landing pages and the raw
 * tracking fields into sentences.
 */

export interface Source {
  family: string;
  key: string;
  label: string;
}

export interface Recent {
  username: string;
  joined: string;
  source: Source;
  heard_from: string | null;
  heard_from_detail: string | null;
  referrer_host: string | null;
  ref: string | null;
  landing_path: string | null;
  invited: boolean;
  fediverse_login: boolean;
  limited: boolean;
  onboarded: boolean;
  wrote: boolean;
  trial: boolean;
  paying: boolean;
}

/** Chart colour per source family (CSS variables defined under `.gr-root`). */
export const FAMILY_COLOR: Record<string, string> = {
  ai: "var(--gr-ai)",
  search: "var(--gr-search)",
  social: "var(--gr-social)",
  people: "var(--gr-people)",
  writers: "var(--gr-writers)",
  campaign: "var(--gr-campaign)",
  other: "var(--gr-other)",
  direct: "var(--gr-direct)",
  before: "var(--gr-before)",
};

/** What each family means, for the legend's hover text and the glossary. */
export const FAMILY_HELP: Record<string, string> = {
  ai: "Clicked a link that ChatGPT, Perplexity, Claude or another AI assistant showed them — or told us an AI sent them.",
  search: "Came from Google, Bing, DuckDuckGo or another search engine.",
  social: "Came from Bluesky, Reddit, Mastodon or another social site, or signed in with a Mastodon account.",
  people: "Joined through a member's invite, or told us a friend sent them.",
  writers: "Landed straight on a writer's post or profile, or told us a writer's post brought them.",
  campaign: "Clicked a link with a tag you added yourself (?ref=something).",
  other: "A site we don't have a name for, an email, or an answer like “something else”.",
  direct: "Nothing told us where they came from: they typed the address, used a bookmark, or tapped a link in an app that hides it (email, Discord, iMessage and many phone apps do). Also people whose browser blocked the tracking cookie.",
  before: "Signed up before 19 September 2026, when Inkwell started recording where people come from.",
};

/** Families that mean "we know where they came from". */
export const KNOWN = (family: string) => family !== "direct" && family !== "before";

const SITE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
};

/** How they arrived, as the start of a sentence. */
export function arrival(r: Recent): string {
  const s = r.source;
  if (s.key === "invite") return "Joined from a member's invite";
  if (s.key === "chatgpt") return "Clicked a link in a ChatGPT answer";
  if (s.family === "ai" && !s.key.startsWith("said:")) return `Clicked a link in a ${s.label} answer`;
  if (s.key === "email") return "Clicked a link in an email";
  if (s.key.startsWith("ref:")) return `Clicked a link tagged “${r.ref}”`;
  if (s.key.startsWith("site:")) return `Came from ${s.label}`;
  if (s.key === "fediverse_login") return "Signed up with a Mastodon account";
  if (s.key.startsWith("said:")) return "No link told us where they came from";
  if (s.key === "writer_page") return "Arrived straight on a writer's page";
  if (s.key === "direct") return "Came straight to Inkwell (typed it, a bookmark, or an app that hides links)";
  if (s.key === "before") return "Joined before Inkwell tracked sources";
  if (s.key === "untracked") return "No tracking data (cookies blocked, or signed up without browsing first)";
  return `Came from ${SITE_NAMES[s.key] ?? s.label}`;
}

/** The first page someone saw, in words. */
export function landing(path: string | null): string | null {
  if (!path) return null;
  if (path === "/") return "the home page";
  const parts = path.split("/").filter(Boolean);
  const [first, second] = parts;
  const pages: Record<string, string> = {
    explore: "Explore",
    about: "the About page",
    "get-started": "the sign-up page",
    login: "the sign-in page",
    gazette: "the Gazette",
    circles: "Circles",
    "for-writers": "the For Writers page",
    transparency: "the Transparency page",
    founding: "the Founding Members page",
    roadmap: "the Roadmap",
    guide: "the Guide",
    help: "Help",
    fediverse: "a fediverse post",
    i: "an invite link",
  };
  if (first === "tag" && second) return `the #${decodeURIComponent(second)} tag page`;
  if (first === "category" && second) return `the ${second} category page`;
  if (first === "switch") return second ? `the “switch from ${second}” page` : "the Switch page";
  if (pages[first]) return pages[first];
  if (parts.length === 1) return `@${first}'s profile`;
  if (second === "subscribe") return `@${first}'s newsletter sign-up`;
  return `a post by @${first}`;
}

/** One line: how they arrived, what they saw first, what they told us. */
export function story(r: Recent): string {
  const bits = [arrival(r)];
  const land = landing(r.landing_path);
  if (land) bits.push(`first saw ${land}`);
  if (r.heard_from) {
    bits.push(`told us “${r.heard_from}${r.heard_from_detail ? ` — ${r.heard_from_detail}` : ""}”`);
  }
  if (r.fediverse_login && r.source.key !== "fediverse_login") bits.push("signed in with Mastodon");
  return bits.join(" · ");
}

/** The raw tracking fields, for hover text. */
export function rawFields(r: Recent): string {
  return [
    r.ref && `link tag: ${r.ref}`,
    r.referrer_host && `referring site: ${r.referrer_host}`,
    r.landing_path && `first page: ${r.landing_path}`,
  ]
    .filter(Boolean)
    .join(" · ") || "No tracking data";
}

/** "Sep 26" from a UTC date or timestamp. */
export function shortDate(iso: string): string {
  const d = new Date(/T/.test(iso) ? (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`) : `${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "–";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
