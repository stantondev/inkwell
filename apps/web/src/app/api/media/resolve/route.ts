import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

// GET /api/media/resolve?url= — player for a PeerTube, Funkwhale, Castopod or Owncast link.
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const url = request.nextUrl.searchParams.get("url") ?? "";
  try {
    const res = await fetch(`${SERVER_API}/api/media/resolve?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      // The API gives up on slow servers after a few seconds per request.
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: "Server error" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Lookup timed out" }, { status: 504 });
  }
}
