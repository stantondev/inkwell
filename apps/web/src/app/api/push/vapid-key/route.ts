import { NextResponse } from "next/server";
import { SERVER_API } from "@/lib/api";

export async function GET() {
  const res = await fetch(`${SERVER_API}/api/push/vapid-key`, {
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
