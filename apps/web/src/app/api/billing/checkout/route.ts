import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function POST() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await fetch(`${SERVER_API}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // Guard against non-JSON (Fly returns HTML 502/503 while the single API
  // machine restarts). res.json() threw here, 500ing the route, and the
  // billing page's catch then showed a misleading "Network error."
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server response" },
      { status: res.status >= 400 ? res.status : 502 }
    );
  }
}
