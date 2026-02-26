import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id } = await params;
  const res = await fetch(`${SERVER_API}/api/newsletter/sends/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
