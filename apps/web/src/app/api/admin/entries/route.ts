import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET(request: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") ?? "1";
  const per_page = searchParams.get("per_page") ?? "50";

  const search = searchParams.get("search") ?? "";
  const filter = searchParams.get("filter") ?? "";
  const qs = new URLSearchParams({ page, per_page });
  if (search) qs.set("search", search);
  if (filter) qs.set("filter", filter);

  try {
    const res = await fetch(`${SERVER_API}/api/admin/entries?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      console.error("Admin entries: non-JSON response from API:", res.status, text.slice(0, 200));
      return NextResponse.json({ error: "Unexpected API response" }, { status: 500 });
    }
  } catch (err) {
    console.error("Admin entries: fetch error:", err);
    return NextResponse.json({ error: "Failed to reach API" }, { status: 500 });
  }
}
