import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") || "1";
    const res = await fetch(`${SERVER_API}/api/entries/${id}/versions?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/entries/:id/versions error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
