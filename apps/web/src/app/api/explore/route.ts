import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const token = await getToken();

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const sort = searchParams.get("sort");
  const source = searchParams.get("source");

  const params = new URLSearchParams({ page });
  if (category) params.set("category", category);
  if (tag) params.set("tag", tag);
  if (sort) params.set("sort", sort);
  if (source) params.set("source", source);

  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${SERVER_API}/api/explore?${params}`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Proxy /api/explore error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
