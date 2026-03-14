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

  const res = await fetch(`${SERVER_API}/api/admin/entries?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
