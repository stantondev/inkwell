"use client";

import { useState, useEffect, useRef } from "react";
import { EntryContent } from "@/components/entry-content";

interface EnrichableContentProps {
  entryId: string;
  initialHtml: string;
  enriching: boolean;
}

/**
 * Renders entry body HTML and re-fetches once after a short delay
 * when the backend signals it's enriching the content with a link preview.
 * Same pattern as the fediverse reply thread re-fetch.
 */
export function EnrichableContent({ entryId, initialHtml, enriching }: EnrichableContentProps) {
  const [html, setHtml] = useState(initialHtml);
  const fetched = useRef(false);

  useEffect(() => {
    if (!enriching || fetched.current) return;
    fetched.current = true;

    // Wait 3s for the LinkPreviewWorker to complete, then re-fetch
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/remote-entries/${entryId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data?.body_html && data.data.body_html !== html) {
            setHtml(data.data.body_html);
          }
        }
      } catch {
        // Silent — original content still displayed
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [enriching, entryId, html]);

  return (
    <EntryContent
      html={html}
      entryId={entryId}
      className="prose-entry"
    />
  );
}
