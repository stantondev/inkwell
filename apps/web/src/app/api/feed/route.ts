import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const source = searchParams.get("source") || "";
  const sourceParam = source ? `&source=${source}` : "";

  try {
    const res = await fetch(`${SERVER_API}/api/feed?page=${page}${sourceParam}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/feed error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
