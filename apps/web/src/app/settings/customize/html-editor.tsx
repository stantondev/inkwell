"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { validateHtml, validateCss, type ValidationMessage } from "@/lib/template-validation";
import { buildPreviewSrcdoc } from "@/lib/template-preview";
import { TEMPLATE_TAG_DOCS } from "@/lib/template-tags";
import { STARTER_TEMPLATES } from "@/lib/template-validation";

interface HtmlEditorProps {
  html: string;
  css: string;
  htmlMode: "widget" | "fullpage";
  onHtmlChange: (html: string) => void;
  onCssChange: (css: string) => void;
  onModeChange: (mode: "widget" | "fullpage") => void;
  theme: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
    border: string;
  };
  displayName: string;
  username: string;
}

function SeverityIcon({ severity }: { severity: ValidationMessage["severity"] }) {
  if (severity === "error") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function HtmlEditor({
  html,
  css,
  htmlMode,
  onHtmlChange,
  onCssChange,
  onModeChange,
  theme,
  displayName,
  username,
}: HtmlEditorProps) {
  const [activeTab, setActiveTab] = useState<"html" | "css">("html");
  const [showReference, setShowReference] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [messages, setMessages] = useState<ValidationMessage[]>([]);
  const [previewSrcdoc, setPreviewSrcdoc] = useState("");
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const cssRef = useRef<HTMLTextAreaElement>(null);
  const validationTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Validation with debounce
  const runValidation = useCallback(() => {
    if (validationTimer.current) clearTimeout(validationTimer.current);
    validationTimer.current = setTimeout(() => {
      const htmlMsgs = validateHtml(html);
      const cssMsgs = validateCss(css);
      setMessages([...htmlMsgs, ...cssMsgs]);
    }, 300);
  }, [html, css]);

  useEffect(() => {
    if (htmlMode === "fullpage") {
      runValidation();
    }
  }, [htmlMode, runValidation]);

  // Preview with debounce
  const updatePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      const srcdoc = buildPreviewSrcdoc(html, css, theme, displayName, username);
      setPreviewSrcdoc(srcdoc);
    }, 500);
  }, [html, css, theme, displayName, username]);

  useEffect(() => {
    if (showPreview && htmlMode === "fullpage") {
      updatePreview();
    }
  }, [showPreview, htmlMode, updatePreview]);

  function insertTagAtCursor(tag: string) {
    const textarea = activeTab === "html" ? htmlRef.current : cssRef.current;
    if (!textarea || activeTab !== "html") return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = `{{${tag}}}`;
    const newValue = html.substring(0, start) + text + html.substring(end);
    onHtmlChange(newValue);

    // Restore cursor position after state update
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      textarea.focus();
    });
  }

  function applyTemplate(template: (typeof STARTER_TEMPLATES)[number]) {
    if (html.trim() || css.trim()) {
      if (!confirm("This will replace your current HTML and CSS. Continue?")) return;
    }
    onHtmlChange(template.html);
    onCssChange(template.css);
    setShowTemplates(false);
  }

  function handleReset() {
    if (!confirm("This will clear all custom HTML and CSS and switch back to widget mode. Continue?")) return;
    onHtmlChange("");
    onCssChange("");
    onModeChange("widget");
  }

  // Widget mode — simple textareas
  if (htmlMode === "widget") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Custom HTML appears as a sidebar widget card on your profile.
          </p>
          <button
            type="button"
            onClick={() => onModeChange("fullpage")}
            className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          >
            Switch to Full-Page Mode
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Custom CSS
          </label>
          <textarea
            value={css}
            onChange={(e) => onCssChange(e.target.value)}
            placeholder={`.profile-header {\n  background: linear-gradient(45deg, #ff6b6b, #4ecdc4);\n}`}
            rows={6}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Custom HTML
          </label>
          <textarea
            value={html}
            onChange={(e) => onHtmlChange(e.target.value)}
            placeholder={`<div class="custom-section">\n  <h3>About My Journal</h3>\n  <p>Welcome to my corner!</p>\n</div>`}
            rows={6}
            className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-y"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--foreground)" }}
          />
        </div>
      </div>
    );
  }

  // Full-page mode — rich editor
  const errorCount = messages.filter((m) => m.severity === "error").length;
  const warnCount = messages.filter((m) => m.severity === "warning").length;
  const infoCount = messages.filter((m) => m.severity === "info").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Mode header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            Full-Page Mode
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Your HTML replaces the entire profile page
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange("widget")}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Switch to Widget Mode
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--danger, #ef4444)" }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Toolbar row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* HTML / CSS tabs */}
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => setActiveTab("html")}
            className="px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: activeTab === "html" ? "var(--accent)" : "var(--surface)",
              color: activeTab === "html" ? "#fff" : "var(--muted)",
            }}
          >
            HTML
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("css")}
            className="px-3 py-1.5 text-xs font-medium transition-colors border-l"
            style={{
              borderColor: "var(--border)",
              background: activeTab === "css" ? "var(--accent)" : "var(--surface)",
              color: activeTab === "css" ? "#fff" : "var(--muted)",
            }}
          >
            CSS
          </button>
        </div>

        {/* Reference toggle */}
        <button
          type="button"
          onClick={() => setShowReference(!showReference)}
          className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: showReference ? "var(--accent)" : "var(--border)",
            color: showReference ? "var(--accent)" : "var(--muted)",
            background: showReference ? "var(--accent-light, rgba(45,74,138,0.1))" : "transparent",
          }}
        >
          Template Tags
        </button>

        {/* Templates dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Starter Templates
          </button>
          {showTemplates && (
            <div
              className="absolute top-full left-0 mt-1 z-10 rounded-lg border shadow-lg overflow-hidden"
              style={{ background: "var(--surface)", borderColor: "var(--border)", minWidth: 240 }}
            >
              {STARTER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left px-4 py-3 text-sm transition-colors hover:bg-[var(--surface-hover)] border-b last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: showPreview ? "var(--accent)" : "var(--border)",
            color: showPreview ? "var(--accent)" : "var(--muted)",
            background: showPreview ? "var(--accent-light, rgba(45,74,138,0.1))" : "transparent",
          }}
        >
          Preview
        </button>
      </div>

      {/* Template tag reference panel */}
      {showReference && (
        <div
          className="rounded-lg border p-3 max-h-64 overflow-y-auto"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="grid gap-1">
            {TEMPLATE_TAG_DOCS.map((doc) => (
              <button
                key={doc.tag}
                type="button"
                onClick={() => insertTagAtCursor(doc.tag)}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
              >
                <code className="shrink-0 text-xs font-mono rounded px-1.5 py-0.5" style={{ background: "var(--accent-light, rgba(45,74,138,0.1))", color: "var(--accent)" }}>
                  {`{{${doc.tag}}}`}
                </code>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {doc.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Code editor */}
      <div className="relative">
        {activeTab === "html" ? (
          <textarea
            ref={htmlRef}
            value={html}
            onChange={(e) => onHtmlChange(e.target.value)}
            placeholder={`<div class="my-profile">\n  {{about}}\n\n  <div class="two-column">\n    <main>{{entries}}</main>\n    <aside>\n      {{guestbook}}\n      {{tags}}\n    </aside>\n  </div>\n</div>`}
            rows={18}
            className="w-full rounded-lg border px-4 py-3 text-sm font-mono resize-y leading-relaxed"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              tabSize: 2,
            }}
            spellCheck={false}
          />
        ) : (
          <textarea
            ref={cssRef}
            value={css}
            onChange={(e) => onCssChange(e.target.value)}
            placeholder={`.my-profile {\n  max-width: 900px;\n  margin: 0 auto;\n  padding: 2rem;\n}\n\n.two-column {\n  display: grid;\n  grid-template-columns: 1fr 300px;\n  gap: 2rem;\n}`}
            rows={18}
            className="w-full rounded-lg border px-4 py-3 text-sm font-mono resize-y leading-relaxed"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              tabSize: 2,
            }}
            spellCheck={false}
          />
        )}
        {/* Character count */}
        <div className="absolute bottom-2 right-3 text-xs" style={{ color: "var(--muted)" }}>
          {activeTab === "html"
            ? `${html.length.toLocaleString()} / 50,000`
            : `${css.length.toLocaleString()} / 100,000`}
        </div>
      </div>

      {/* Validation messages */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 text-xs mb-1" style={{ color: "var(--muted)" }}>
            {errorCount > 0 && <span style={{ color: "#ef4444" }}>{errorCount} error{errorCount !== 1 ? "s" : ""}</span>}
            {warnCount > 0 && <span style={{ color: "#f59e0b" }}>{warnCount} warning{warnCount !== 1 ? "s" : ""}</span>}
            {infoCount > 0 && <span style={{ color: "#3b82f6" }}>{infoCount} info</span>}
          </div>
          <div
            className="rounded-lg border overflow-hidden max-h-40 overflow-y-auto"
            style={{ borderColor: "var(--border)" }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-3 py-2 text-xs border-b last:border-b-0"
                style={{ borderColor: "var(--border)" }}
              >
                <SeverityIcon severity={msg.severity} />
                <span style={{ color: "var(--foreground)" }}>
                  {msg.message}
                  {msg.line && (
                    <span style={{ color: "var(--muted)" }}> (line {msg.line})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview iframe */}
      {showPreview && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Preview
            </span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Template tags shown as placeholders
            </span>
          </div>
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: "var(--border)", height: 400 }}
          >
            <iframe
              srcDoc={previewSrcdoc}
              sandbox="allow-same-origin"
              className="w-full h-full border-0"
              title="Profile preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}
