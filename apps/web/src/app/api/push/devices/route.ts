import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

/**
 * The Inkwell app's phone token for notifications (components/app-bridge.tsx).
 * Registered from inside the app's pages so it follows this sign-in session.
 */
async function forward(req: NextRequest, method: "POST" | "DELETE") {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const res = await upstreamFetch(`${SERVER_API}/api/push/devices`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return proxyJson(res);
}

export const POST = (req: NextRequest) => forward(req, "POST");
export const DELETE = (req: NextRequest) => forward(req, "DELETE");
