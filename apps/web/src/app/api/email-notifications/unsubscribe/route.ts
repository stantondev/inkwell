import { NextRequest, NextResponse } from "next/server";

const API = process.env.API_URL ?? "http://localhost:4000";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API}/api/email-notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      { cache: "no-store" }
    );
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: true, message: "Unsubscribed" };
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true, message: "Unsubscribed" }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, message: "Missing token" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API}/api/email-notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: "POST", cache: "no-store" }
    );
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: true, message: "Unsubscribed" };
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true, message: "Unsubscribed" }, { status: 200 });
  }
}
