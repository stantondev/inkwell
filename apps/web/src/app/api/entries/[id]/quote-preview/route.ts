import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  if (!token)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const res = await fetch(`${SERVER_API}/api/entries/${id}/quote-preview`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy GET /api/entries/:id/quote-preview error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
