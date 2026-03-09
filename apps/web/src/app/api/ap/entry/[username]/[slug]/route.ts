/**
 * GET /api/ap/entry/:username/:slug — AP Entry proxy (slug-based lookup)
 *
 * Middleware rewrites AP content-negotiated requests from /:username/:slug
 * to this route, which proxies to Phoenix for the Article object.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; slug: string }> }
) {
  const { username, slug } = await params;

  try {
    const res = await fetch(
      `${API_URL}/entries/by-slug/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
      {
        headers: { accept: "application/activity+json" },
        cache: "no-store",
      }
    );

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
