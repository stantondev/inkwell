/**
 * GET /nodeinfo/2.0 — Federation proxy
 *
 * Proxies NodeInfo 2.0 schema to the Phoenix API. Older fediverse
 * stats crawlers (fedidb, the-federation.info) only speak 2.0.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/nodeinfo/2.0`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "content-type":
          'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.0"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
