/**
 * GET /nodeinfo/2.1 — Federation proxy
 *
 * Proxies NodeInfo schema to the Phoenix API.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(_request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/nodeinfo/2.1`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "content-type":
          'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
