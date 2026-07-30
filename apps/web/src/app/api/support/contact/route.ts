import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

export async function POST(request: NextRequest) {
  const token = await getToken();
  const body = await request.json();

  // This route is rate-limited server-side (10 req/60s). Without a forwarded
  // client identity every submission shared one bucket keyed on this proxy,
  // so one sender could lock the contact form for everyone. See the API's
  // RateLimit plug for why Fly-Client-IP is the trustworthy signal here.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const forwardedFor =
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  if (forwardedFor) headers["X-Forwarded-For"] = forwardedFor;

  const clientIp =
    request.headers.get("fly-client-ip") ?? request.headers.get("x-real-ip");
  if (clientIp) headers["X-Inkwell-Client-IP"] = clientIp;

  const res = await fetch(`${SERVER_API}/api/support/contact`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true }, { status: res.status });
  }
}
