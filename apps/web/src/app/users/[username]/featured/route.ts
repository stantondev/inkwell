/**
 * GET /users/:username/featured — Federation proxy (AP Featured Collection)
 *
 * Proxies featured collection requests to the Phoenix API to serve
 * a user's pinned posts as an ActivityPub OrderedCollection.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    const url = `${API_URL}/users/${encodeURIComponent(username)}/featured`;

    const res = await fetch(url, {
      headers: { accept: "application/activity+json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      status: 200,
      headers: { "content-type": "application/activity+json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
