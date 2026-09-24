/**
 * GET /.well-known/atproto-did — Bluesky handles for bridged writers
 *
 * On `alice.inkwell.social`, redirects to Bridgy Fed with Alice's actor id so
 * a writer bridged to Bluesky can be `@alice.inkwell.social` there instead of
 * `@alice.inkwell.social.ap.brid.gy`. This is Bridgy Fed's documented setup for
 * server admins (fed.brid.gy/docs, "custom domain handles"). The actor id comes
 * from our own WebFinger so it carries the username's exact case. Anywhere else,
 * or for someone who isn't a writer here, it's a 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { writerSubdomain } from "@/lib/hosts";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

function notFound() {
  return new NextResponse("Not found\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const username = writerSubdomain(request.headers.get("host"));
  if (!username) return notFound();

  try {
    const res = await fetch(
      `${API_URL}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${username}@inkwell.social`)}`,
      { headers: { accept: "application/jrd+json" }, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return notFound();
    const jrd = (await res.json()) as { links?: { rel?: string; type?: string; href?: string }[] };
    const actorId = jrd.links?.find(
      (l) => l.rel === "self" && l.type?.includes("activity+json")
    )?.href;
    if (!actorId) return notFound();

    const target = new URL("https://fed.brid.gy/.well-known/atproto-did");
    target.searchParams.set("protocol", "ap");
    target.searchParams.set("id", actorId);
    return NextResponse.redirect(target, 302);
  } catch {
    return new NextResponse("Unavailable\n", { status: 503 });
  }
}
