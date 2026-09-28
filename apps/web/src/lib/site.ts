/**
 * Which Inkwell this is: its public address, name and contact.
 *
 * inkwell.social sets nothing and gets its own values. A self-hosted server
 * sets SITE_URL (and usually INSTANCE_NAME, CONTACT_EMAIL and
 * INKWELL_SELF_HOSTED=true) on the web container. These are read at runtime,
 * not baked in at build time, so the one published image serves any domain.
 *
 * Works in server and client code alike: the root layout writes the values
 * into the page (`siteScript`) before anything else runs, and client code
 * reads them from there. Call `getSite()` inside functions and components,
 * not at module level.
 */
export interface Site {
  /** e.g. "https://inkwell.social" (no trailing slash) */
  url: string;
  /** e.g. "inkwell.social" — also the domain in members' fediverse handles */
  host: string;
  /** "Inkwell" on inkwell.social; the instance's own name elsewhere */
  name: string;
  /** True on a self-hosted server: no payments, no inkwell.social business */
  selfHosted: boolean;
  /** Where members write for help */
  contactEmail: string;
}

const INKWELL_SOCIAL: Site = {
  url: "https://inkwell.social",
  host: "inkwell.social",
  name: "Inkwell",
  selfHosted: false,
  contactEmail: "hello@inkwell.social",
};

declare global {
  interface Window {
    __INKWELL_SITE__?: Site;
  }
}

function fromEnv(): Site {
  const selfHosted = process.env.INKWELL_SELF_HOSTED === "true";
  const raw = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (!raw && !selfHosted) return INKWELL_SOCIAL;

  let url = INKWELL_SOCIAL.url;
  let host = INKWELL_SOCIAL.host;
  try {
    const parsed = new URL(raw || "http://localhost");
    url = parsed.origin;
    host = parsed.hostname;
  } catch {
    // A malformed SITE_URL keeps inkwell.social's values for url/host; the
    // API refuses to start without a valid one, so this is never live.
  }

  return {
    url,
    host,
    name: (process.env.INSTANCE_NAME || "").trim() || (selfHosted ? host : INKWELL_SOCIAL.name),
    selfHosted,
    // May be ADMIN_EMAIL's list ("a@x, b@y"); the first is the contact.
    contactEmail:
      (process.env.CONTACT_EMAIL || "").split(",")[0].trim() || (selfHosted ? `admin@${host}` : INKWELL_SOCIAL.contactEmail),
  };
}

export function getSite(): Site {
  if (typeof window !== "undefined") return window.__INKWELL_SITE__ ?? INKWELL_SOCIAL;
  return fromEnv();
}

/** True on inkwell.social itself (and in local development). */
export function isInkwellSocial(): boolean {
  return !getSite().selfHosted;
}

/** Absolute URL on this site for a path ("/alice" → "https://inkwell.social/alice"). */
export function siteUrl(path = "/"): string {
  return getSite().url + (path.startsWith("/") ? path : `/${path}`);
}

/** Inline script for the root layout that hands the server's values to client code. */
export function siteScript(): string {
  return `window.__INKWELL_SITE__=${JSON.stringify(fromEnv()).replace(/</g, "\\u003c")};`;
}

/**
 * Help and guideline text is written for inkwell.social ("@you@inkwell.social",
 * "email hello@inkwell.social"). On a self-hosted server, show this server's
 * handle domain and contact address instead. inkwell.social's text is unchanged.
 */
export function forThisSite(text: string): string {
  const site = getSite();
  if (!site.selfHosted) return text;
  return text
    .replaceAll("hello@inkwell.social", site.contactEmail)
    .replace(/@inkwell\.social\b/g, `@${site.host}`);
}

/** Help/FAQ sections about paying inkwell.social, which a self-hosted server doesn't take. */
export const BILLING_HELP_CATEGORY = "billing";
