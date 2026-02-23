/**
 * GET /.well-known/webfinger — Federation proxy
 *
 * Proxies WebFinger requests to the Phoenix API so remote servers
 * can discover users at @user@inkwell.social.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource") ?? "";

  try {
    const res = await fetch(
      `${API_URL}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
      {
        headers: { accept: "application/jrd+json, application/json" },
        cache: "no-store",
      }
    );
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: { "content-type": "application/jrd+json; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
