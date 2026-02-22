/**
 * POST /api/search/fediverse/follow  (Next.js route handler — authenticated proxy)
 *
 * Proxies fediverse follow requests to Phoenix server-side to avoid CORS.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function POST(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const res = await fetch(`${SERVER_API}/api/search/fediverse/follow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/search/fediverse/follow error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
