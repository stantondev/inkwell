/**
 * GET /.well-known/nodeinfo — Federation proxy
 *
 * Proxies NodeInfo discovery to the Phoenix API so remote servers
 * can identify Inkwell as an ActivityPub-compatible server.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/.well-known/nodeinfo`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
