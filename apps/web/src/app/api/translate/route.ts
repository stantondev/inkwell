import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SERVER_API } from "@/lib/api";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get("inkwell_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const res = await fetch(`${SERVER_API}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Invalid response from API" },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Translation service temporarily unavailable" },
      { status: 503 }
    );
  }
}
