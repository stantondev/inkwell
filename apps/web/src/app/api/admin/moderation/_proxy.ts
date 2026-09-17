import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

/** Shared admin proxy: forwards to Phoenix and never throws on non-JSON. */
export async function proxyAdmin(path: string, init: RequestInit = {}) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await fetch(`${SERVER_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Unexpected server response" }, { status: res.status >= 400 ? res.status : 502 });
  }
}
