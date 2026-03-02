import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

export async function GET() {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${SERVER_API}/api/explore/trending`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy GET /api/explore/trending error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
