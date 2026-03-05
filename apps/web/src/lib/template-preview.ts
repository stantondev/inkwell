/**
 * Builds a preview iframe srcdoc for the full-page custom profile editor.
 *
 * Replaces template tags with styled placeholder boxes so users can see
 * layout and positioning without needing live data or React hydration.
 */

import { TEMPLATE_TAGS, type TemplateTags } from "./template-tags";
import { TEMPLATE_TAG_DOCS } from "./template-tags";

const TAG_LABELS: Record<string, string> = {};
for (const doc of TEMPLATE_TAG_DOCS) {
  TAG_LABELS[doc.tag] = doc.label;
}

/** CSS variables from the user's current theme */
interface PreviewTheme {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  accent: string;
  border: string;
}

/**
 * Build the full srcdoc HTML for an iframe preview.
 *
 * Template tags are replaced with dashed-border placeholder boxes
 * labeled with the widget name. User CSS is scoped to the container.
 */
export function buildPreviewSrcdoc(
  html: string,
  css: string,
  theme: PreviewTheme,
  displayName: string,
  username: string,
): string {
  const scopeId = "preview-scope";

  // Replace template tags with visual placeholders
  const seenTags = new Set<string>();
  const processed = html.replace(/\{\{(\w+)\}\}/g, (_match, tagName: string) => {
    const tag = tagName.toLowerCase();

    if (!TEMPLATE_TAGS.includes(tag as TemplateTags)) {
      return `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace;">Unknown: {{${tagName}}}</span>`;
    }

    if (seenTags.has(tag)) {
      return `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:12px;font-family:monospace;text-decoration:line-through;">{{${tagName}}} (duplicate)</span>`;
    }
    seenTags.add(tag);

    const label = TAG_LABELS[tag] || tag;
    return `<div style="border:2px dashed ${theme.accent};border-radius:8px;padding:1.5rem 1rem;margin:0.5rem 0;text-align:center;color:${theme.accent};font-family:system-ui,sans-serif;">
      <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${label}</div>
      <div style="font-size:11px;color:${theme.muted};font-family:monospace;">{{${tag}}}</div>
    </div>`;
  });

  // Scope user CSS
  const scopedCss = css
    ? css.replace(
        /^(\s*)((?:(?!@)[^{}])+?)\s*\{/gm,
        (_match: string, indent: string, selectors: string) => {
          const trimmed = selectors.trim();
          if (/^\d+%$/.test(trimmed) || /^(from|to)$/.test(trimmed)) return _match;
          if (/^[\w-]+\s*:/.test(trimmed)) return _match;
          const scoped = trimmed
            .split(",")
            .map((s: string) => {
              const t = s.trim();
              if (!t) return s;
              return `#${scopeId} ${t}`;
            })
            .join(", ");
          return `${indent}${scoped} {`;
        }
      )
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: ${theme.background};
    color: ${theme.foreground};
    font-family: system-ui, -apple-system, sans-serif;
    --foreground: ${theme.foreground};
    --background: ${theme.background};
    --surface: ${theme.surface};
    --muted: ${theme.muted};
    --accent: ${theme.accent};
    --border: ${theme.border};
  }
  #${scopeId} {
    contain: layout style;
    position: relative;
    z-index: 0;
    overflow: hidden;
  }
  /* Basic responsive images */
  #${scopeId} img { max-width: 100%; height: auto; }
  /* Allow marquee */
  #${scopeId} marquee { display: block; }
  ${scopedCss}
</style>
</head>
<body>
<div id="${scopeId}">
${processed}
</div>
</body>
</html>`;
}
