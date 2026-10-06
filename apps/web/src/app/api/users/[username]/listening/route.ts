import { NextRequest } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// GET /api/users/:username/listening — the profile's "Listening now" card (ListenBrainz).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const token = await getToken();
  const res = await upstreamFetch(`${SERVER_API}/api/users/${encodeURIComponent(username)}/listening`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
    // Up to two ListenBrainz requests (12s each) plus a MusicBrainz match.
    signal: AbortSignal.timeout(30_000),
  });
  return proxyJson(res);
}
