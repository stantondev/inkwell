import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Remove every fediverse follower that is a bot account.
export async function POST() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/fediverse-followers/bots/remove`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return proxyJson(res);
}
