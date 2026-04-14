import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/session";
import { SERVER_API } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const body = await req.json();

  try {
    const res = await fetch(`${SERVER_API}/api/margin-notes/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream response" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("Proxy PATCH margin-note error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const token = await getToken();
  if (!token)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;

  try {
    const res = await fetch(`${SERVER_API}/api/margin-notes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const text = await res.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream response" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("Proxy DELETE margin-note error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
