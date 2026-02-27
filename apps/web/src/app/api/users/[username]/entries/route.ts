import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

// GET /api/users/:username/entries — list entries with pagination and filters
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  const token = await getToken();

  // Forward all query params (page, per_page, q, category, tag, year, sort, etc.)
  const url = new URL(request.url);
  const queryString = url.search;

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${SERVER_API}/api/users/${username}/entries${queryString}`, {
    cache: "no-store",
    headers,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
