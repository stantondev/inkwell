import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorClient } from "./editor-client";

export const metadata: Metadata = {
  title: "New entry",
};

export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--background)", color: "var(--muted)" }}>
        <span className="text-sm">Loading editor...</span>
      </div>
    }>
      <EditorClient />
    </Suspense>
  );
}
