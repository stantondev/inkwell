/**
 * POST /api/auth/magic-link  (Next.js route handler — unauthenticated proxy)
 *
 * Proxies the magic-link request to Phoenix server-side so the browser
 * never makes a cross-origin request (avoids CORS entirely).
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { HANDOFF_COOKIE } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const res = await fetch(`${SERVER_API}/api/auth/magic-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For":
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip") ??
          "unknown",
        // Fly sets Fly-Client-IP to the actual connecting peer and it is not
        // client-controllable, unlike X-Forwarded-For (a forged XFF prepends,
        // so its first entry can be anything the caller wants). Forward it
        // under our own name so the API can rate-limit on a trustworthy client
        // identity. The API only honours this header when the request's own
        // immediate peer is internal, i.e. it really came from this proxy.
        "X-Inkwell-Client-IP":
          request.headers.get("fly-client-ip") ??
          request.headers.get("x-real-ip") ??
          "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Inkwell is briefly unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }

    const response = NextResponse.json(data, { status: res.status });

    // Remember which browser asked for this link. If the link is opened in the
    // same browser, /api/auth/verify sees this cookie and skips the "enter the
    // code from your other screen" step, since nothing needs handing over.
    if (res.ok && typeof data.login_session_id === "string") {
      response.cookies.set(HANDOFF_COOKIE, data.login_session_id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60,
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("Proxy /api/auth/magic-link error:", err);
    return NextResponse.json(
      { error: "Could not reach the server. Please try again later." },
      { status: 502 }
    );
  }
}
