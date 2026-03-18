import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const token = await getToken();
  const { id } = await params;

  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${SERVER_API}/api/remote-entries/${id}`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy GET /api/remote-entries/:id error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
