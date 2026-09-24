/**
 * GET /users/:username/guestbook — Federation proxy (FEP-400e collection)
 *
 * The guestbook as a publicly-appendable OrderedCollection: fediverse servers
 * read it here and sign it with a Create{Note} whose `target` is this URL.
 * Browsers are sent to the guestbook on the profile page.
 */
import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/fediverse";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const accept = request.headers.get("accept") ?? "";

  if (!accept.includes("application/activity+json") && !accept.includes("application/ld+json")) {
    return NextResponse.redirect(new URL(`/${username}#guestbook`, publicOrigin(request)));
  }

  const page = request.nextUrl.searchParams.get("page");
  const query = page ? `?page=${encodeURIComponent(page)}` : "";

  try {
    const res = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/guestbook${query}`, {
      headers: { accept: "application/activity+json" },
      cache: "no-store",
      redirect: "manual",
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Not found" }, { status: res.status === 404 ? 404 : 502 });
    }

    return NextResponse.json(await res.json(), {
      status: 200,
      headers: { "content-type": "application/activity+json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 502 });
  }
}
