import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const token = await getToken();

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const topic = searchParams.get("topic");
  const perPage = searchParams.get("per_page");

  const params = new URLSearchParams({ page });
  if (topic) params.set("topic", topic);
  if (perPage) params.set("per_page", perPage);

  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${SERVER_API}/api/gazette?${params}`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/gazette error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
