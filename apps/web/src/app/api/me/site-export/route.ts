import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildSiteExport } from "@/lib/site-export/build";

export const dynamic = "force-dynamic";

// One export at a time per writer, and a few at once per server: each one
// draws the page and copies every picture.
const running = new Set<string>();
const MAX_AT_ONCE = 3;

// GET /api/me/site-export — the signed-in writer's page as a website (.zip).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to download your page." }, { status: 401 });
  const { username, display_name } = session.user;

  if (running.has(username)) {
    return NextResponse.json({ error: "Your page is already being packed. It'll download in a moment." }, { status: 429 });
  }
  if (running.size >= MAX_AT_ONCE) {
    return NextResponse.json({ error: "A few pages are being packed right now. Try again in a minute." }, { status: 503 });
  }

  running.add(username);
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await buildSiteExport(username, display_name || username);
  } catch (err) {
    running.delete(username);
    console.error("[site-export]", username, err);
    return NextResponse.json({ error: "Couldn't pack your page right now. Try again in a minute." }, { status: 503 });
  }

  // Free the slot when the download finishes or is abandoned.
  const done = () => running.delete(username);
  const reader = stream.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done: finished } = await reader.read();
        if (finished) {
          done();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        done();
        controller.error(err);
      }
    },
    cancel(reason) {
      done();
      return reader.cancel(reason);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${username}-inkwell-site.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
