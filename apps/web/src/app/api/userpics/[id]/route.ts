import { NextRequest, NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

// A userpic picture. The API serves it immutably (a picture never changes
// under its id), so it is cached here and in the browser for a year.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let res: Response;
  try {
    res = await fetch(`${SERVER_API}/api/userpics/${encodeURIComponent(id)}`, { cache: "force-cache" });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
  if (!res.ok) return new NextResponse(null, { status: res.status });

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
