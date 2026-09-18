/**
 * GET /nodeinfo/2.1 — Federation proxy
 *
 * Proxies NodeInfo schema to the Phoenix API.
 */
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${API_URL}/nodeinfo/2.1`, {
      // The API refuses NodeInfo on members' custom domains (a custom
      // domain is one profile, not a separate server), so it needs the host
      // the crawler actually asked for.
      headers: {
        accept: "application/json",
        "x-original-host": request.headers.get("host") ?? "",
      },
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
