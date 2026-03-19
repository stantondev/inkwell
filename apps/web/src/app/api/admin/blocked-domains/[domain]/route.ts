import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { domain } = await params;
  const res = await fetch(`${SERVER_API}/api/admin/blocked-domains/${encodeURIComponent(domain)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
