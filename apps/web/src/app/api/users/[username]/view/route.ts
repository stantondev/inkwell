import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

// POST /api/users/:username/view — increment profile visitor count (public, no auth)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const res = await fetch(`${SERVER_API}/api/users/${username}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
