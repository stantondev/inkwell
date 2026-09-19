"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import { EditorClient } from "./editor-client";
import { draftsCreatedHere } from "./created-here";

/**
 * Gives the editor a fresh instance whenever the writer opens a different
 * entry, or a new one, from the same page. The editor keeps its form in state,
 * so going from `/editor?edit=A` to `/editor` (the sidebar's Write link) used
 * to keep entry A loaded, and typing autosaved over A, including published
 * entries. The editor's own `?edit=<id>` update after creating a draft keeps
 * the same instance.
 */
export function EditorRoute() {
  const editId = useSearchParams().get("edit");
  const keyRef = useRef<string>(editId ?? "new");
  const lastEditIdRef = useRef<string | null>(editId);
  const newCounterRef = useRef(0);

  if (editId !== lastEditIdRef.current) {
    const createdByThisEditor = editId !== null && draftsCreatedHere.has(editId);
    if (!createdByThisEditor) {
      newCounterRef.current += 1;
      keyRef.current = editId ?? `new-${newCounterRef.current}`;
    }
    lastEditIdRef.current = editId;
  }

  return <EditorClient key={keyRef.current} />;
}
