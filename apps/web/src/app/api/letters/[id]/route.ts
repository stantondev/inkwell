import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

// GET /api/letters/[id] — load thread (with optional ?since=messageId for polling)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const page = searchParams.get("page") || "1";

  const url = since
    ? `${SERVER_API}/api/conversations/${id}?since=${encodeURIComponent(since)}`
    : `${SERVER_API}/api/conversations/${id}?page=${page}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
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

  const res = await fetch(`${SERVER_API}/api/conversations/${id}/letters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
