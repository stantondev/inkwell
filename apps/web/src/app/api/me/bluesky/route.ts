import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// Share on Bluesky (Bridgy Fed): GET status, POST switch on, DELETE switch off.
async function forward(method: "GET" | "POST" | "DELETE") {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await upstreamFetch(`${SERVER_API}/api/me/bluesky`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: "{}" } : {}),
    cache: "no-store",
  });
  return proxyJson(res);
}

export const GET = () => forward("GET");
export const POST = () => forward("POST");
export const DELETE = () => forward("DELETE");
