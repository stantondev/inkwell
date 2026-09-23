import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// GET /api/letters/[id] — load thread. ?since=<letterId> returns only newer
// letters (polling); ?before=<letterId> returns the 50 letters before it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const before = searchParams.get("before");
  const base = `${SERVER_API}/api/conversations/${encodeURIComponent(id)}`;

  const url = since
    ? `${base}?since=${encodeURIComponent(since)}`
    : before
      ? `${base}?before=${encodeURIComponent(before)}`
      : base;

  const res = await upstreamFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}

// POST /api/letters/[id] — send a letter
// Body: { body: string }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const res = await upstreamFetch(`${SERVER_API}/api/conversations/${id}/letters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return proxyJson(res);
}
