/**
 * POST /api/entries  (Next.js route handler — authenticated proxy)
 *
 * The editor client cannot read the httpOnly session cookie via document.cookie,
 * so it calls this same-origin route handler instead. Here we have full server-side
 * access to the cookie, attach the Bearer token, and forward the request to Phoenix.
 */
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function POST(request: NextRequest) {
  const token = await getToken();

  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const res = await fetch(`${SERVER_API}/api/entries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/entries error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
