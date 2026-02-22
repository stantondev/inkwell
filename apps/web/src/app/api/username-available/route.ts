/**
 * GET /api/username-available  (Next.js route handler — unauthenticated proxy)
 *
 * Proxies username availability check to Phoenix server-side to avoid CORS.
 */
import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ available: false }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${SERVER_API}/api/username-available?username=${encodeURIComponent(username)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/username-available error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
