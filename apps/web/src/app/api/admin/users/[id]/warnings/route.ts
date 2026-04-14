import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;

  const res = await fetch(`${SERVER_API}/api/admin/users/${id}/warnings`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Unexpected response from server", raw: text.slice(0, 200) },
      { status: res.status }
    );
  }
}
