/**
 * POST /inbox — Federation proxy (AP Shared Inbox)
 *
 * Receives ActivityPub activities addressed to the instance
 * (not a specific user) and proxies to the Phoenix API.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    const res = await fetch(`${API_URL}/inbox`, {
      method: "POST",
      headers: {
        "content-type": "application/activity+json",
        ...(request.headers.get("signature")
          ? { signature: request.headers.get("signature")! }
          : {}),
        ...(request.headers.get("date")
          ? { date: request.headers.get("date")! }
          : {}),
        ...(request.headers.get("digest")
          ? { digest: request.headers.get("digest")! }
          : {}),
      },
      body,
    });

    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
