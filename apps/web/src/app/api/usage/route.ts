import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

// Feature usage (Inkwell.Usage): `trackFeature()` in lib/usage.ts calls this.
// The API needs the IP and browser only to count a signed-out visitor once a
// day (a hash kept in memory until midnight UTC, never stored); the sign-in
// token makes it a member's use instead.
export async function POST(request: NextRequest) {
  const token = await getToken();

  let body: { feature?: unknown; action?: unknown; detail?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const pick = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : undefined);
  const feature = pick(body.feature);
  if (!feature) return new NextResponse(null, { status: 204 });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": request.headers.get("user-agent") ?? "",
    "X-Forwarded-For":
      request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "",
    // Trusted client IP; see api/auth/magic-link/route.ts for why.
    "X-Inkwell-Client-IP":
      request.headers.get("fly-client-ip") ?? request.headers.get("x-real-ip") ?? "",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  await upstreamFetch(`${SERVER_API}/api/usage`, {
    method: "POST",
    headers,
    body: JSON.stringify({ feature, action: pick(body.action), detail: pick(body.detail) }),
    cache: "no-store",
  });

  return new NextResponse(null, { status: 204 });
}
