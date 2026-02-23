import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SERVER_API = process.env.API_URL ?? "http://localhost:4000";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  const res = await fetch(`${SERVER_API}/api/discover/writers`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
