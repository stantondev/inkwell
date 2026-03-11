import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API = process.env.API_URL || "http://localhost:4000";

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get("inkwell_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const res = await fetch(`${API}/api/embeds/fetch`, {
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
}
