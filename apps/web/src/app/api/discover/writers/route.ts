import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

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
