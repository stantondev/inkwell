"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeAnchor, resolveAnchor } from "@/lib/marginalia/anchor";
import { wrapRange, unwrapMarks } from "@/lib/marginalia/wrap";
import type { AnchorData, ResolutionStatus } from "@/lib/marginalia/types";

/**
 * Render HTML into a div that React will NOT touch again on re-render.
 * Same pattern as EntryContent — memoized dangerouslySetInnerHTML so
 * React's reconciler skips re-setting innerHTML when bodyHtml is stable.
 */
function StableProse({
  html,
  innerRef,
  className,
  style,
}: {
  html: string;
  innerRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const lastSetRef = useRef<string>(html);
  const htmlProp = useMemo(() => ({ __html: html }), [html]);

  useEffect(() => {
    if (!innerRef.current) return;
    if (lastSetRef.current !== html) {
      innerRef.current.innerHTML = html;
      lastSetRef.current = html;
    }
  }, [html, innerRef]);

  return (
    <div
      ref={innerRef}
      className={className}
      style={style}
      suppressHydrationWarning
      dangerouslySetInnerHTML={htmlProp}
    />
  );
}

interface StoredAnchor extends AnchorData {
  id: string;
  lastStatus: ResolutionStatus["kind"] | "pending";
  similarity?: number;
}

export function MarginaliaTestHarness({ initialHtml }: { initialHtml: string }) {
  const proseRef = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<StoredAnchor[]>([]);
  const [html, setHtml] = useState(initialHtml);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string>("");

  function captureFromSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setMessage("No selection.");
      return;
    }
    const range = selection.getRangeAt(0);
    const root = proseRef.current;
    if (!root) return;

    if (!root.contains(range.commonAncestorContainer)) {
      setMessage("Selection must be inside the prose pane.");
      return;
    }

    const anchor = computeAnchor(root, range);
    const id = `anchor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const stored: StoredAnchor = { id, ...anchor, lastStatus: "pending" };
    setAnchors((prev) => [...prev, stored]);
    setMessage(`Captured anchor: "${anchor.quote_text.slice(0, 60)}…"`);
    selection.removeAllRanges();
  }

  async function resolveAll() {
    const root = proseRef.current;
    if (!root) return;

    // Clear existing marks
    unwrapMarks(root);

    const updated: StoredAnchor[] = [];
    for (const anchor of anchors) {
      const status = await resolveAnchor(root, anchor);
      if (status.kind === "exact" || status.kind === "fuzzy") {
        wrapRange(root, status.range, anchor.id);
      }
      updated.push({
        ...anchor,
        lastStatus: status.kind,
        similarity: status.kind === "fuzzy" ? status.similarity : undefined,
      });
    }
    setAnchors(updated);
    setMessage(`Resolved ${updated.length} anchor(s).`);
  }

  function clearAnchors() {
    const root = proseRef.current;
    if (root) unwrapMarks(root);
    setAnchors([]);
    setMessage("Cleared all anchors.");
  }

  function applyEdit() {
    setEditing(false);
    // Reset marks when the HTML changes
    setTimeout(() => {
      const root = proseRef.current;
      if (root) unwrapMarks(root);
    }, 0);
    setMessage("Body updated. Click Resolve to re-test the anchors.");
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "1.3fr 1fr" }}>
      <section>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={captureFromSelection}
            style={btnStyle("accent")}
            type="button"
          >
            Compute anchor from selection
          </button>
          <button onClick={resolveAll} style={btnStyle()} type="button">
            Resolve all anchors
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            style={btnStyle()}
            type="button"
          >
            {editing ? "Cancel edit" : "Edit body"}
          </button>
          <button onClick={clearAnchors} style={btnStyle("danger")} type="button">
            Clear anchors
          </button>
        </div>

        {editing ? (
          <div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={14}
              style={{
                width: "100%",
                fontFamily: "ui-monospace, monospace",
                fontSize: 13,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--foreground)",
              }}
            />
            <button onClick={applyEdit} style={btnStyle("accent")} type="button">
              Apply edit
            </button>
          </div>
        ) : (
          <StableProse
            html={html}
            innerRef={proseRef}
            className="prose-entry"
            style={{
              padding: "1.5rem",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--surface)",
              minHeight: 320,
              userSelect: "text",
            }}
          />
        )}
      </section>

      <aside>
        <div
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--surface)",
          }}
        >
          <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, marginTop: 0 }}>
            Anchors ({anchors.length})
          </h2>
          {message && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{message}</p>
          )}
          {anchors.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              No anchors yet. Select text and click <em>Compute anchor</em>.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {anchors.map((a) => (
                <li
                  key={a.id}
                  style={{
                    fontSize: 12,
                    borderLeft: `3px solid ${statusColor(a.lastStatus)}`,
                    paddingLeft: 10,
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
                    “{truncate(a.quote_text, 80)}”
                  </div>
                  <div style={{ color: "var(--muted)", marginTop: 4 }}>
                    status: <strong>{a.lastStatus}</strong>
                    {a.similarity != null && (
                      <> · sim {(a.similarity * 100).toFixed(0)}%</>
                    )}
                  </div>
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: "pointer", color: "var(--muted)" }}>raw</summary>
                    <pre
                      style={{
                        background: "var(--background)",
                        padding: 6,
                        borderRadius: 4,
                        overflow: "auto",
                        fontSize: 11,
                      }}
                    >
                      {JSON.stringify(
                        {
                          quote: a.quote_text,
                          prefix: a.quote_prefix,
                          suffix: a.quote_suffix,
                          start: a.text_position_start,
                          end: a.text_position_end,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function btnStyle(kind: "accent" | "danger" | "default" = "default"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "8px 14px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid var(--border)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
  if (kind === "accent") {
    return {
      ...base,
      background: "var(--accent)",
      color: "white",
      borderColor: "var(--accent)",
    };
  }
  if (kind === "danger") {
    return { ...base, background: "var(--surface)", color: "var(--danger, #b00020)" };
  }
  return { ...base, background: "var(--surface)", color: "var(--foreground)" };
}

function statusColor(status: StoredAnchor["lastStatus"]): string {
  switch (status) {
    case "exact":
      return "#2d7d2d";
    case "fuzzy":
      return "#b8860b";
    case "orphaned":
      return "#b00020";
    default:
      return "var(--border)";
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
