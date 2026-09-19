import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

/**
 * POST /api/auth/complete-handoff  { lsid, code }
 *
 * From the verify page, after this browser has signed in: hand a session to
 * the other screen that requested the link, if the code typed here matches the
 * one shown there.
 */
export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const res = await fetch(`${SERVER_API}/api/auth/complete-handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: "Inkwell is briefly unavailable. Try again." }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: "Inkwell is briefly unavailable. Try again." }, { status: 503 });
  }
}
