/**
 * POST /users/:username/inbox — Federation proxy (AP Inbox)
 *
 * Receives ActivityPub activities from remote servers and proxies
 * them to the Phoenix API for processing.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildFederationHeaders } from "@/lib/federation-proxy";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    const body = await request.text();

    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(username)}/inbox`,
      {
        method: "POST",
        headers: buildFederationHeaders(request),
        body,
      }
    );

    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
