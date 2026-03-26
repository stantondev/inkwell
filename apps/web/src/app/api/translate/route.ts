import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SERVER_API } from "@/lib/api";

export async function POST(req: NextRequest) {
  console.log("[translate proxy] request received");

  const jar = await cookies();
  const token = jar.get("inkwell_token")?.value;
  if (!token) {
    console.log("[translate proxy] no token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    console.log("[translate proxy] forwarding to", `${SERVER_API}/api/translate`, "body:", JSON.stringify(body).slice(0, 200));

    const res = await fetch(`${SERVER_API}/api/translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    console.log("[translate proxy] API responded with status:", res.status);

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      console.error("[translate proxy] failed to parse response:", text.slice(0, 500));
      return NextResponse.json(
        { error: "Invalid response from API" },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error("[translate proxy] fetch failed:", err);
    return NextResponse.json(
      { error: "Translation service temporarily unavailable" },
      { status: 503 }
    );
  }
}
