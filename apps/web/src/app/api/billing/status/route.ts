import { NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function GET() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const res = await fetch(`${SERVER_API}/api/billing/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  // The API runs on a single machine, so it returns HTML 502/503 from Fly during
  // every deploy and restart. res.json() throws on that, which took down this
  // whole route — and fetchStatus() on the billing page swallows the failure and
  // renders a real Plus member as free tier with no error shown.
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server response" },
      { status: res.status >= 400 ? res.status : 502 }
    );
  }
}
