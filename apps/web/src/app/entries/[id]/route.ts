/**
 * GET /entries/:id — Federation proxy (AP Entry object endpoint)
 *
 * Content-negotiated: ActivityPub requests are proxied to the Phoenix API.
 * Regular browser requests redirect to the entry page.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const accept = request.headers.get("accept") ?? "";

  const isApRequest =
    accept.includes("application/activity+json") ||
    accept.includes("application/ld+json");

  if (!isApRequest) {
    // Not an AP request — return 404 (entries are accessed via /username/slug)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const res = await fetch(`${API_URL}/entries/${encodeURIComponent(id)}`, {
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
