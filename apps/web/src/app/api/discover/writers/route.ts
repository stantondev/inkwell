import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";
import { upstreamFetch } from "@/lib/proxy";

// Writers to follow (onboarding's "Discover writers", the empty Feed).
// Until 2026-09-25 this read a "session_token" cookie that Inkwell never set,
// so it returned an empty list to everyone since it was added in February.
export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  const first = request.nextUrl.searchParams.get("first");
  const qs = first && /^[A-Za-z0-9_]{1,30}$/.test(first) ? `?first=${first}` : "";
  const res = await upstreamFetch(`${SERVER_API}/api/discover/writers${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
