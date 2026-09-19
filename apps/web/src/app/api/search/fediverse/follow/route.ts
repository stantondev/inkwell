/**
 * POST /api/search/fediverse/follow  (Next.js route handler — authenticated proxy)
 *
 * Proxies fediverse follow requests to Phoenix server-side to avoid CORS.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const res = await upstreamFetch(`${SERVER_API}/api/search/fediverse/follow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    return proxyJson(res);
  } catch (err) {
    console.error("Proxy /api/search/fediverse/follow error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
