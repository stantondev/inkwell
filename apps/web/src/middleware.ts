import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

const PROTECTED = ["/feed", "/editor", "/drafts", "/admin", "/letters", "/saved", "/settings"];
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// ── Custom domain detection ─────────────────────────────────────────────────

const KNOWN_HOSTS = new Set([
  "inkwell.social",
  "www.inkwell.social",
  "inkwell-web.fly.dev",
  "localhost",
  "127.0.0.1",
]);

// App routes that should redirect to inkwell.social (not served on custom domains)
const APP_ROUTES = [
  "/feed", "/editor", "/drafts", "/admin", "/letters", "/saved",
  "/settings", "/login", "/get-started", "/welcome", "/explore",
  "/search", "/notifications", "/roadmap", "/polls", "/circles",
  "/pen-pals", "/developers", "/category", "/tag",
];

// In-memory cache for custom domain resolution (60-second TTL)
const domainCache = new Map<string, { username: string | null; expiry: number }>();
const CACHE_TTL = 60_000; // 60 seconds

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const now = Date.now();
  const cached = domainCache.get(hostname);
  if (cached && cached.expiry > now) return cached.username;

  try {
    const res = await fetch(
      `${API_URL}/api/custom-domain/resolve?hostname=${encodeURIComponent(hostname)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const username = data.found ? data.username : null;
      domainCache.set(hostname, { username, expiry: now + CACHE_TTL });
      return username;
    }
  } catch {
    // API unreachable — don't cache failure
  }
  return null;
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Custom domain detection (before auth logic) ───────────────────────
  const host = request.headers.get("host")?.replace(/:\d+$/, "") ?? "";

  if (host && !KNOWN_HOSTS.has(host)) {
    const username = await resolveCustomDomain(host);

    if (!username) {
      // Domain points to us but isn't configured — show not-found page
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

  // ── Standard inkwell.social logic ─────────────────────────────────────
  const token = request.cookies.get(TOKEN_COOKIE)?.value;

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
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });
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
