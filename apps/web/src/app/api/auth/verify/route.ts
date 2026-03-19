import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/session";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * POST /api/auth/verify
 *
 * Verifies a magic link token against the Phoenix API.
 * Called from the client-side verify page (not directly from email links).
 * This is a POST to prevent email prefetchers from consuming one-time tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body.token;
    const lsid = body.lsid;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Forward lsid (login session ID) so Phoenix can complete the PWA handoff
    let verifyUrl = `${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`;
    if (lsid) {
      verifyUrl += `&lsid=${encodeURIComponent(lsid)}`;
    }

    const res = await fetch(verifyUrl, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Invalid or expired sign-in link. Please request a new one." },
        { status: 401 }
      );
    }

    const data: {
      ok: boolean;
      token: string;
      user?: { settings?: { onboarded?: boolean } };
    } = await res.json();

    const destination = data.user?.settings?.onboarded ? "/feed" : "/welcome";

    const response = NextResponse.json({ ok: true, destination });

    // Set the session cookie
    response.cookies.set(TOKEN_COOKIE, data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: TOKEN_MAX_AGE,
      path: "/",
    });

    // Clear invite cookie after successful authentication
    response.cookies.set("inkwell_invite", "", {
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
