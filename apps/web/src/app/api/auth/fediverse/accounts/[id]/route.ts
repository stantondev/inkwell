import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";
import { getToken } from "@/lib/session";
import { proxyJson, upstreamFetch } from "@/lib/proxy";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = await getToken();
    if (!token) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const res = await upstreamFetch(
      `${SERVER_API}/api/auth/fediverse/accounts/${id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    return proxyJson(res);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
