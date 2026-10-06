import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// GET /api/me/listenbrainz[?username=] — what the writer is playing on ListenBrainz.
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const username = request.nextUrl.searchParams.get("username");
  const query = username ? `?username=${encodeURIComponent(username)}` : "";
  const res = await upstreamFetch(`${SERVER_API}/api/me/listenbrainz${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    // Up to two ListenBrainz requests (12s each) plus a MusicBrainz match.
    signal: AbortSignal.timeout(30_000),
  });
  return proxyJson(res);
}
