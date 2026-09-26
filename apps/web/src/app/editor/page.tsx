import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorRoute } from "./editor-route";
import { requireSession } from "@/lib/require-session";

export const metadata: Metadata = {
  title: "New entry",
};

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The middleware only checks that a token cookie exists. With a dead one
  // the editor used to open anyway and every save failed; sign in first and
  // come back to the same editor link (?edit=, ?circle=, ?gazette=…).
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") qs.set(k, v);
  await requireSession(`/editor${qs.size ? `?${qs}` : ""}`);

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)", color: "var(--muted)" }}>
        <span className="text-sm">Loading editor...</span>
      </div>
    }>
      <EditorRoute />
    </Suspense>
  );
}
