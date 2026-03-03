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

    // Build headers to forward. Node.js fetch() overrides the `Host` header
    // with the target URL's hostname, so we pass the original host via
    // X-Original-Host for HTTP Signature verification.
    const forwardHeaders: Record<string, string> = {
      "content-type":
        request.headers.get("content-type") ?? "application/activity+json",
    };
    const originalHost = request.headers.get("host");
    if (originalHost) forwardHeaders["x-original-host"] = originalHost;
    for (const h of ["signature", "date", "digest"]) {
      const v = request.headers.get(h);
      if (v) forwardHeaders[h] = v;
    }

    const res = await fetch(`${API_URL}/inbox`, {
      method: "POST",
      headers: forwardHeaders,
      body,
    });

    const data = await res.json().catch(() => ({ ok: true }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
