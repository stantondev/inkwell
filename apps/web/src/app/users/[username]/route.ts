/**
 * GET /users/:username — Federation proxy (AP Actor endpoint)
 *
 * Content-negotiated: ActivityPub requests are proxied to the Phoenix API.
 * Regular browser requests redirect to the profile page (/{username}).
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const accept = request.headers.get("accept") ?? "";

  const isApRequest =
    accept.includes("application/activity+json") ||
    accept.includes("application/ld+json");

  if (!isApRequest) {
    // Browser request — redirect to profile page
    return NextResponse.redirect(new URL(`/${username}`, request.url));
  }

  try {
    const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}`, {
      headers: { accept: "application/activity+json" },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Not found" },
        { status: res.status }
      );
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
