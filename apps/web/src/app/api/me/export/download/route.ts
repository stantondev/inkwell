import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET() {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );

  const res = await fetch(`${SERVER_API}/api/me/export/download`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // Stream the binary gzip response through
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition":
        res.headers.get("content-disposition") ||
        "attachment; filename=inkwell-export.json.gz",
    },
  });
}
