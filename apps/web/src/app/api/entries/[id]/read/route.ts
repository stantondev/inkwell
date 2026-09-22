import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { upstreamFetch } from "@/lib/proxy";

const SERVER_API = process.env.API_URL || "http://localhost:4000";

// Reader stats: the entry page calls this once someone has actually been
// reading for a while. The API needs the reader's IP and browser only to
// avoid counting the same person twice in a day (see Inkwell.Reads); the
// sign-in token lets it skip the writer's own reads.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();

  let referrer = "";
  try {
    const body = await request.json();
    if (typeof body?.referrer === "string") referrer = body.referrer.slice(0, 500);
  } catch {
    /* empty body is fine */
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": request.headers.get("user-agent") ?? "",
    "X-Forwarded-For":
      request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "",
    // Trusted client IP; see api/auth/magic-link/route.ts for why.
    "X-Inkwell-Client-IP":
      request.headers.get("fly-client-ip") ?? request.headers.get("x-real-ip") ?? "",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  await upstreamFetch(`${SERVER_API}/api/entries/${encodeURIComponent(id)}/read`, {
    method: "POST",
    headers,
    body: JSON.stringify({ referrer }),
    cache: "no-store",
  });

  // Nothing for the page to act on either way.
  return new NextResponse(null, { status: 204 });
}
