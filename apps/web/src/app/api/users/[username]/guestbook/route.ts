import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

// GET /api/users/:username/guestbook — list entries (public)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const res = await fetch(`${SERVER_API}/api/users/${username}/guestbook`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// POST /api/users/:username/guestbook — sign guestbook (authenticated)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { username } = await params;
  const body = await request.json();
  const res = await fetch(`${SERVER_API}/api/users/${username}/guestbook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
