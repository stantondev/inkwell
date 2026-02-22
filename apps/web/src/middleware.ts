import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

const PROTECTED = ["/feed", "/editor", "/drafts"];
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  // Run on all page routes, skip Next.js internals, API proxy routes, and static files
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|stamps/|api/).*)"],
};
