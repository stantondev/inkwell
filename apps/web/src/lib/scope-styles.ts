/**
 * Scopes entry HTML so custom <style> tags only affect their own entry,
 * and dangerous content (scripts, event handlers) is stripped.
 *
 * This is what lets users write fun LiveJournal/MySpace-era HTML+CSS
 * (<marquee>, CSS animations, custom colors, gradients, etc.)
 * without breaking the rest of the page.
 */

/** Prefix all top-level CSS selectors with the scoped container ID */
function scopeCss(css: string, scopeId: string): string {
  const scope = `#${scopeId}`;

  // Remove CSS comments
  let cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");

  // Make @keyframes names unique to this entry to prevent conflicts
  const keyframeNames: string[] = [];
  cleaned = cleaned.replace(/@keyframes\s+([\w-]+)/g, (_match, name) => {
    keyframeNames.push(name);
    return `@keyframes ${scopeId}--${name}`;
  });

  // Update animation references to use the scoped keyframe names
  for (const name of keyframeNames) {
    const re = new RegExp(`(animation(?:-name)?\\s*:[^;{}]*?)\\b${name}\\b`, "g");
    cleaned = cleaned.replace(re, `$1${scopeId}--${name}`);
  }

  // Process rule selectors — prefix non-@ selectors with the scope
  // We use a simple state machine to track brace depth
  let result = "";
  let depth = 0;
  let i = 0;
  let inAtRule = false;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (ch === "{") {
      // Everything before this brace (since last brace or start) is a selector
      const beforeBrace = result.lastIndexOf("}");
      const lastSemicolon = result.lastIndexOf(";");
      const lastClose = Math.max(beforeBrace, lastSemicolon, 0);
      // Actually, let's use a different approach — find the selector text
      depth++;
      result += ch;
      i++;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) inAtRule = false;
      result += ch;
      i++;
    } else {
      result += ch;
      i++;
    }
  }

  // Simpler approach: regex-replace selectors before opening braces
  // Reset and use regex
  result = cleaned;

  // Process each rule block. We find selector { ... } patterns
  // and prefix selectors, but skip @keyframes internals and @-rules
  const lines = result.split("\n");
  const output: string[] = [];
  let insideKeyframes = false;
  let braceCount = 0;
  let keyframesBraceStart = 0;

  for (const line of lines) {
    let processedLine = line;

    // Track @keyframes blocks (don't scope their inner selectors like "from", "to", "50%")
    if (/@keyframes\s/.test(line)) {
      insideKeyframes = true;
      keyframesBraceStart = braceCount;
    }

    // Count braces
    for (const c of line) {
      if (c === "{") braceCount++;
      if (c === "}") braceCount--;
    }

    if (insideKeyframes && braceCount <= keyframesBraceStart) {
      insideKeyframes = false;
    }

    // Only scope top-level selectors (not inside @keyframes)
    if (!insideKeyframes) {
      // Match lines that contain a selector followed by {
      processedLine = processedLine.replace(
        /^(\s*)((?:(?!@)[^{}])+?)\s*\{/gm,
        (_match, indent, selectors) => {
          const trimmed = selectors.trim();
          // Skip percentages (from keyframes that slip through), from/to
          if (/^\d+%$/.test(trimmed) || /^(from|to)$/.test(trimmed)) return _match;
          // Skip if it looks like a property: value (no valid selector chars)
          if (/^[\w-]+\s*:/.test(trimmed)) return _match;

          const scoped = trimmed
            .split(",")
            .map((s: string) => {
              const t = s.trim();
              if (!t) return s;
              return `${scope} ${t}`;
            })
            .join(", ");
          return `${indent}${scoped} {`;
        }
      );
    }

    output.push(processedLine);
  }

  return output.join("\n");
}

/** Strip dangerous HTML: <script>, on* event handlers, javascript: URLs */
function sanitizeHtml(html: string): string {
  let safe = html;

  // Strip <script> tags and their content
  safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  // Strip self-closing script tags
  safe = safe.replace(/<script\b[^>]*\/?\s*>/gi, "");

  // Strip on* event handler attributes (onclick, onerror, onload, etc.)
  safe = safe.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Strip javascript: URLs in href, src, action attributes
  safe = safe.replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "$1=\"\"");

  // Strip <iframe> tags (prevent embedding external content)
  safe = safe.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  safe = safe.replace(/<iframe\b[^>]*\/?\s*>/gi, "");

  // Strip <object>, <embed>, <applet> tags
  safe = safe.replace(/<(object|embed|applet)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "");
  safe = safe.replace(/<(object|embed|applet)\b[^>]*\/?\s*>/gi, "");

  return safe;
}

/**
 * Process entry HTML for safe rendering:
 * 1. Sanitizes dangerous content (scripts, event handlers)
 * 2. Extracts <style> tags and scopes their selectors to the entry container
 * 3. Returns clean body HTML + scoped style string
 */
export function scopeEntryHtml(
  html: string,
  scopeId: string
): { bodyHtml: string; scopedStyles: string } {
  if (!html) return { bodyHtml: "", scopedStyles: "" };

  // Sanitize first
  let safe = sanitizeHtml(html);

  // Extract <style> tags
  const styleBlocks: string[] = [];
  safe = safe.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css) => {
    styleBlocks.push(css);
    return ""; // Remove from body HTML
  });

  // Scope extracted styles
  const scopedStyles = styleBlocks
    .map((css) => scopeCss(css, scopeId))
    .join("\n");

  return { bodyHtml: safe.trim(), scopedStyles };
}
