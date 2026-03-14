/**
 * GET /api/search/fediverse  (Next.js route handler — proxy)
 *
 * Proxies fediverse search to Phoenix server-side to avoid CORS.
 * Forwards auth token when available for relationship status.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const token = await getToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `${SERVER_API}/api/search/fediverse?q=${encodeURIComponent(q)}`,
      { cache: "no-store", headers }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/search/fediverse error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
