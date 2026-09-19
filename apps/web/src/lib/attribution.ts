/**
 * Signup attribution: where a visitor first arrived from.
 *
 * The middleware writes this cookie on a signed-out visitor's first page view
 * (first touch wins; it's never overwritten). The magic-link and fediverse
 * sign-in routes forward it to the API, which stores it once on a newly
 * created account (Inkwell.Growth). Host only, never the full referring URL.
 */
import type { NextRequest } from "next/server";

export const ATTRIBUTION_COOKIE = "inkwell_attr";
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export type Attribution = { host?: string; ref?: string; path?: string };

const OWN_HOSTS = new Set([
  "inkwell.social",
  "www.inkwell.social",
  "inkwell-web.fly.dev",
  "localhost",
  "127.0.0.1",
]);

const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|mastodon|pleroma|akkoma|misskey|gotosocial|curl|wget|python|go-http|headless/i;

/** Build the first-visit record for this request, or null if it shouldn't count. */
export function firstVisitAttribution(request: NextRequest): Attribution | null {
  if (request.method !== "GET") return null;
  // Next.js link prefetches aren't visits.
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch") return null;
  if (BOT_UA.test(request.headers.get("user-agent") ?? "")) return null;
  // Static files (logo, frames, robots.txt…) aren't a landing page.
  if (/\.[a-z0-9]{2,5}$/i.test(request.nextUrl.pathname)) return null;

  const attr: Attribution = { path: request.nextUrl.pathname.slice(0, 200) };

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (host && !OWN_HOSTS.has(host) && !host.endsWith(".inkwell.social")) attr.host = host;
    } catch {
      // unparseable referer: ignore
    }
  }

  const params = request.nextUrl.searchParams;
  const ref = (params.get("ref") ?? params.get("utm_source") ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 64);
  if (ref) attr.ref = ref;

  return attr;
}

export function encodeAttribution(attr: Attribution): string {
  return JSON.stringify(attr);
}

/** Read the cookie back; anything malformed is treated as absent. */
export function readAttribution(request: NextRequest): Attribution | undefined {
  const raw = request.cookies.get(ATTRIBUTION_COOKIE)?.value;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const out: Attribution = {};
    for (const k of ["host", "ref", "path"] as const) {
      if (typeof parsed[k] === "string") out[k] = parsed[k].slice(0, 253);
    }
    return out;
  } catch {
    return undefined;
  }
}
