import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// GET /api/entries/:id/margin-notes — public (optional auth)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const token = await getToken();

  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(
      `${SERVER_API}/api/entries/${id}/margin-notes`,
      { headers, cache: "no-store" },
    );
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream response" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("Proxy GET margin-notes error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/entries/:id/margin-notes — authenticated
export async function POST(req: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const body = await req.json();

  try {
    const res = await fetch(
      `${SERVER_API}/api/entries/${id}/margin-notes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream response" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("Proxy POST margin-notes error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
