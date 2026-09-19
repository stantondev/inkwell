import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function POST(request: NextRequest) {
  try {
    const token = await getToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();

    const res = await upstreamFetch(`${SERVER_API}/api/auth/fediverse/link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    return proxyJson(res);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
