import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

// DELETE /api/admin/entries/:id — used by Admin → Reports ("warn and delete").
// This route was missing, so the page reported "entry deleted" while the
// request 404'd and the entry stayed up.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;

  try {
    const res = await fetch(`${SERVER_API}/api/admin/entries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
    }
  } catch {
    return NextResponse.json({ error: "Inkwell is briefly unavailable." }, { status: 503 });
  }
}
