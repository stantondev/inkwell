import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Undo a scheduled Plus cancel ("Keep my Plus" on the billing page).
export async function POST() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/billing/resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return proxyJson(res);
}
