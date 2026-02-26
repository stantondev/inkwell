import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await fetch(`${SERVER_API}/api/newsletter/settings`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${SERVER_API}/api/newsletter/settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
