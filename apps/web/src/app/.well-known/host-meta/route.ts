/**
 * GET /.well-known/host-meta — Federation proxy
 *
 * Proxies XRD discovery to the Phoenix API. Some older Mastodon
 * clients and discovery tools probe host-meta before falling back
 * to /.well-known/webfinger directly.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/.well-known/host-meta`, {
      headers: { accept: "application/xrd+xml" },
      cache: "no-store",
    });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": "application/xrd+xml; charset=utf-8" },
    });
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }
}
