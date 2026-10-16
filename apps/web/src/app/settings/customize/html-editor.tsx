"use client";

import { useEffect, useState } from "react";
import { validateHtml, validateCss, type ValidationMessage } from "@/lib/custom-html-validation";

// Custom CSS restyles the whole profile; custom HTML is one card on it.
// (Full-page HTML, which replaced the whole page with the writer's own
// markup, was retired on 2026-10-16: nobody used it, and the page builder
// does the same job without the risk of an unreadable page.)

interface HtmlEditorProps {
  html: string;
  css: string;
  onHtmlChange: (html: string) => void;
  onCssChange: (css: string) => void;
}

function SeverityIcon({ severity }: { severity: ValidationMessage["severity"] }) {
  if (severity === "error") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function HtmlEditor({ html, css, onHtmlChange, onCssChange }: HtmlEditorProps) {
  const [messages, setMessages] = useState<ValidationMessage[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setMessages([...validateHtml(html), ...validateCss(css)]), 300);
    return () => clearTimeout(t);
  }, [html, css]);

  const fieldStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="profile-css" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Custom CSS
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Restyles your whole profile page. It only ever applies inside your page.
        </p>
        <textarea
          id="profile-css"
          value={css}
          onChange={(e) => onCssChange(e.target.value)}
          placeholder={`.profile-header-card {\n  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);\n}`}
          rows={8}
          className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y"
          style={fieldStyle}
          spellCheck={false}
        />
        <div className="text-xs text-right" style={{ color: "var(--muted)" }}>
          {css.length.toLocaleString()} / 100,000
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="profile-html" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Custom HTML
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Appears as a card among your profile&apos;s widgets.
        </p>
        <textarea
          id="profile-html"
          value={html}
          onChange={(e) => onHtmlChange(e.target.value)}
          placeholder={`<div class="custom-section">\n  <h3>About My Journal</h3>\n  <p>Welcome to my corner!</p>\n</div>`}
          rows={8}
          className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y"
          style={fieldStyle}
          spellCheck={false}
        />
        <div className="text-xs text-right" style={{ color: "var(--muted)" }}>
          {html.length.toLocaleString()} / 50,000
        </div>
      </div>

      {messages.length > 0 && (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }} role="status">
          {messages.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <SeverityIcon severity={msg.severity} />
              <span style={{ color: "var(--foreground)" }}>
                {msg.message}
                {msg.line && <span style={{ color: "var(--muted)" }}> (line {msg.line})</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
