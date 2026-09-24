import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// GET /api/letters[?folder=inbox|requests|archived] — one Letterbox tab
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const folder = request.nextUrl.searchParams.get("folder");
  const query = folder && /^(inbox|requests|archived)$/.test(folder) ? `?folder=${folder}` : "";

  const res = await upstreamFetch(`${SERVER_API}/api/conversations${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}

// POST /api/letters — find or create a conversation with a pen pal
// Body: { username: string } for a member, or { remote_actor_id: string } for a
// fediverse account you follow or that follows you
export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json();
  const res = await upstreamFetch(`${SERVER_API}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return proxyJson(res);
}
