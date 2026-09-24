import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";
import { KNOWN_HOSTS, writerSubdomain } from "@/lib/hosts";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  encodeAttribution,
  firstVisitAttribution,
} from "@/lib/attribution";

// "/welcome" is here because onboarding only works signed in: every step
// saves through an authenticated endpoint. A signed-out visitor who landed
// on it (a bookmark, the back button after signing out, a shared link) got
// the whole wizard, filled it in, and only found out at "Finish setup" that
// nothing could be saved.
const PROTECTED = ["/feed", "/editor", "/drafts", "/admin", "/letters", "/saved", "/settings", "/manage", "/welcome", "/readers"];
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// ── Custom domain detection ─────────────────────────────────────────────────

// App routes that should redirect to inkwell.social (not served on custom domains)
const APP_ROUTES = [
  "/feed", "/editor", "/drafts", "/admin", "/letters", "/saved",
  "/settings", "/login", "/get-started", "/welcome", "/explore",
  "/search", "/notifications", "/roadmap", "/polls", "/circles",
  "/pen-pals", "/developers", "/category", "/tag", "/manage", "/fediverse",
  "/help", "/ai", "/gazette", "/switch", "/readers", "/whats-new",
];

// In-memory cache for custom domain resolution.
// Positive results (real custom domain → username) cached for 5 minutes.
// Negative results (unknown host or API failure) cached for 60 seconds so
// crawlers / scanners hammering bogus hostnames don't all hit the API on
// each request. Without negative caching, a botnet probing arbitrary Host
// headers can saturate the API in a few seconds.
const domainCache = new Map<string, { username: string | null; expiry: number }>();
const POSITIVE_TTL = 5 * 60_000; // 5 minutes
const NEGATIVE_TTL = 60_000;      // 1 minute

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const now = Date.now();
  const cached = domainCache.get(hostname);
  if (cached && cached.expiry > now) return cached.username;

  try {
    const res = await fetch(
      `${API_URL}/api/custom-domain/resolve?hostname=${encodeURIComponent(hostname)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2500) }
    );
    if (res.ok) {
      const data = await res.json();
      const username = data.found ? data.username : null;
      const ttl = username ? POSITIVE_TTL : NEGATIVE_TTL;
      domainCache.set(hostname, { username, expiry: now + ttl });
      return username;
    }
  } catch {
    // API unreachable or timed out — cache the negative briefly so we don't
    // pile on while it recovers. A failing custom-domain check shouldn't be
    // able to take down the entire web tier.
    domainCache.set(hostname, { username: null, expiry: now + NEGATIVE_TTL });
  }
  return null;
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Custom domain detection (before auth logic) ───────────────────────
  const host = request.headers.get("host")?.replace(/:\d+$/, "") ?? "";

  // ── www is not a second site ──────────────────────────────────────────
  // The session cookie is host-only on inkwell.social, so anything served
  // on www would render signed out for everyone who is in fact signed in.
  // Redirect instead. This runs whatever DNS says, so pointing www at Fly
  // can never quietly turn into a cookie-less copy of the app; www stays in
  // KNOWN_HOSTS so it is never mistaken for someone's custom domain either.
  if (host === "www.inkwell.social") {
    return NextResponse.redirect(
      new URL(pathname + request.nextUrl.search, "https://inkwell.social"),
      308
    );
  }

  // ── alice.inkwell.social → inkwell.social/alice ───────────────────────
  // These hosts exist for Bluesky handles (see writerSubdomain); the handle
  // check itself is a /.well-known route, which this middleware never sees.
  const subdomainUser = writerSubdomain(host);
  if (subdomainUser) {
    const path = pathname === "/" ? "" : pathname;
    return NextResponse.redirect(
      new URL(`/${subdomainUser}${path}${request.nextUrl.search}`, "https://inkwell.social"),
      308
    );
  }

  if (host && !KNOWN_HOSTS.has(host)) {
    const username = await resolveCustomDomain(host);

    if (!username) {
      // Domain points to us but isn't configured. Crawl directives still
      // have to be crawl directives — rewriting them onto the not-found
      // page would serve HTML for /robots.txt and an empty 200 for the
      // sitemap.
      if (pathname === "/robots.txt") {
        return new NextResponse("User-Agent: *\nDisallow: /\n", {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
      if (pathname === "/sitemap.xml") {
        return new NextResponse(null, { status: 404 });
      }

      // Otherwise show the not-found page
      const url = request.nextUrl.clone();
      url.pathname = "/custom-domain-not-found";
      const response = NextResponse.rewrite(url);
      response.headers.set("x-custom-domain", host);
      return response;
    }

    // Passthrough routes: API proxies, Next.js internals, static assets
    if (
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname.startsWith("/stamps/") ||
      pathname.startsWith("/frames/") ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml" ||
      pathname === "/favicon.svg" ||
      pathname === "/favicon.ico" ||
      pathname === "/inkwell-logo.svg" ||
      pathname === "/sw.js" ||
      pathname === "/manifest.webmanifest" ||
      pathname.startsWith("/icons/")
    ) {
      return NextResponse.next();
    }

    // App routes → redirect to inkwell.social
    if (APP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
      return NextResponse.redirect(new URL(pathname, "https://inkwell.social"));
    }

    // Wildcard slug redirect: multi-segment paths on custom domains
    // (e.g., /2014/01/05/old-slug → /old-slug via 301)
    // Handles imported content from CMSes with date-based or category-based URLs.
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && !pathname.startsWith(`/${username}/`)) {
      const lastSegment = segments[segments.length - 1];
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/${lastSegment}`;
      return NextResponse.redirect(redirectUrl, 301);
    }

    // Rewrite: / → /[username] (profile page)
    // Rewrite: /some-slug → /[username]/some-slug (entry page)
    // Rewrite: /subscribe → /[username]/subscribe
    // If pathname already starts with /[username]/, pass through as-is
    // (links on profile pages are absolute like /username/slug)
    const url = request.nextUrl.clone();
    if (pathname === "/" || pathname === "") {
      url.pathname = `/${username}`;
    } else if (pathname === `/${username}` || pathname.startsWith(`/${username}/`)) {
      // Already has the username prefix — don't double it
      url.pathname = pathname;
    } else {
      url.pathname = `/${username}${pathname}`;
    }

    const response = NextResponse.rewrite(url);
    response.headers.set("x-custom-domain", host);
    response.headers.set("x-custom-domain-username", username);
    return response;
  }

  // ── ActivityPub content negotiation for entry slug URLs ──────────────
  // Mastodon sends Accept: application/activity+json when searching by URL.
  // Rewrite /:username/:slug AP requests to the proxy route since route.ts
  // and page.tsx can't coexist in Next.js.
  const accept = request.headers.get("accept") ?? "";
  const isApRequest =
    accept.includes("application/activity+json") ||
    accept.includes("application/ld+json");

  if (isApRequest) {
    const segments = pathname.split("/").filter(Boolean);
    if (
      segments.length === 2 &&
      segments[0] !== "entries" &&
      segments[0] !== "comments" &&
      !pathname.startsWith("/api/") &&
      !pathname.startsWith("/_next/") &&
      !pathname.startsWith("/stamps/") &&
      !pathname.startsWith("/frames/")
    ) {
      const [username, slug] = segments;
      const url = request.nextUrl.clone();
      url.pathname = `/api/ap/entry/${username}/${slug}`;
      return NextResponse.rewrite(url);
    }
  }

  // ── /search → /explore redirect (backward compat) ────────────────────
  if (pathname === "/search" || pathname.startsWith("/search/")) {
    const url = new URL("/explore", request.url);
    // Preserve any query params (e.g. ?q=...)
    request.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
    return NextResponse.redirect(url, 301);
  }

  // ── Standard inkwell.social logic ─────────────────────────────────────
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  // Signed-in users landing on "/" go straight to Feed (skip marketing page)
  if (pathname === "/" && token) {
    return NextResponse.redirect(new URL("/feed", request.url));
  }

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  // Sliding window: refresh cookie expiry on every page visit so active
  // users stay signed in indefinitely. The backend does the same for the
  // DB token, so both browser cookie and server token stay in sync.
  if (token) {
    response.cookies.set(TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });
  }

  // First visit of a signed-out visitor: remember where they came from so a
  // later signup can be attributed (see lib/attribution.ts). First touch wins.
  if (!token && !request.cookies.has(ATTRIBUTION_COOKIE)) {
    const attr = firstVisitAttribution(request);
    if (attr) {
      response.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(attr), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ATTRIBUTION_MAX_AGE,
        path: "/",
      });
    }
  }

  return response;
}

export const config = {
  // Run on all page routes, skip Next.js internals, API proxy routes, static files,
  // and ActivityPub federation endpoints (.well-known, /users, /inbox, /nodeinfo)
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icons/|stamps/|api/|\\.well-known/|users/|inbox$|nodeinfo/).*)",
  ],
};
