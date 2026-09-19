/**
 * GET /comments/:id — Federation proxy (AP Note for a comment written on Inkwell)
 *
 * These URLs are the ids of comments we federate, so remote servers look them
 * up to resolve reply threads. ActivityPub requests get the Note; people who
 * follow the link are sent to the conversation it belongs to.
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

  try {
    const res = await fetch(`${API_URL}/comments/${encodeURIComponent(id)}`, {
      headers: { accept: "application/activity+json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Not found" }, { status: res.status === 404 ? 404 : 502 });
    }

    const note = await res.json();

    if (!isApRequest) {
      return typeof note.url === "string"
        ? NextResponse.redirect(note.url, 302)
        : NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(note, {
      status: 200,
      headers: { "content-type": "application/activity+json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
