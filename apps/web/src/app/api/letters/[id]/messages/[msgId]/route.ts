import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

// PATCH /api/letters/[id]/messages/[msgId] — edit a letter
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id, msgId } = await params;
  const body = await request.json();

  const res = await upstreamFetch(
    `${SERVER_API}/api/conversations/${id}/letters/${msgId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );
  return proxyJson(res);
}

// DELETE /api/letters/[id]/messages/[msgId] — soft-delete a letter
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { id, msgId } = await params;

  const res = await upstreamFetch(
    `${SERVER_API}/api/conversations/${id}/letters/${msgId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );
  return proxyJson(res);
}
