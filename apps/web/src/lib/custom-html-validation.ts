/**
 * Checks on a writer's custom profile HTML and CSS (Plus), shown in
 * Settings → Customize before saving. The server sanitises regardless
 * (Inkwell.HtmlSanitizer.sanitize_profile); this only says what will happen.
 */

export interface ValidationMessage {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
}

/**
 * Validate custom profile HTML. Returns messages, errors first.
 */
export function validateHtml(html: string): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const lines = html.split("\n");

  // === ERRORS: Security issues that will be stripped ===

  // Check for <script> tags
  if (/<script\b/i.test(html)) {
    const lineNum = lines.findIndex((l) => /<script\b/i.test(l));
    messages.push({
      severity: "error",
      message: "<script> tags are not allowed and will be removed",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for on* event handlers
  if (/\son\w+\s*=/i.test(html)) {
    const lineNum = lines.findIndex((l) => /\son\w+\s*=/i.test(l));
    messages.push({
      severity: "error",
      message: "Event handlers (onclick, onerror, etc.) are not allowed and will be removed",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for javascript: URLs
  if (/javascript:/i.test(html)) {
    const lineNum = lines.findIndex((l) => /javascript:/i.test(l));
    messages.push({
      severity: "error",
      message: "javascript: URLs are not allowed and will be removed",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for iframe/object/embed
  if (/<(iframe|object|embed|applet)\b/i.test(html)) {
    const lineNum = lines.findIndex((l) => /<(iframe|object|embed|applet)\b/i.test(l));
    messages.push({
      severity: "error",
      message: "<iframe>, <object>, <embed>, and <applet> tags are not allowed and will be removed",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for meta/link/base tags
  if (/<(meta|link|base)\b/i.test(html)) {
    const lineNum = lines.findIndex((l) => /<(meta|link|base)\b/i.test(l));
    messages.push({
      severity: "error",
      message: "<meta>, <link>, and <base> tags are not allowed and will be removed",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Sort: errors first, then warnings, then info
  const order = { error: 0, warning: 1, info: 2 };
  messages.sort((a, b) => order[a.severity] - order[b.severity]);

  return messages;
}

/**
 * Validate custom profile CSS.
 */
export function validateCss(css: string): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const lines = css.split("\n");

  // Check for position: fixed
  if (/position\s*:\s*fixed/i.test(css)) {
    const lineNum = lines.findIndex((l) => /position\s*:\s*fixed/i.test(l));
    messages.push({
      severity: "warning",
      message:
        "position: fixed may overlap site navigation. It will behave like position: absolute within your profile.",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for @import
  if (/@import\b/i.test(css)) {
    const lineNum = lines.findIndex((l) => /@import\b/i.test(l));
    messages.push({
      severity: "warning",
      message: "@import may slow page loading. Consider inlining your styles instead.",
      line: lineNum >= 0 ? lineNum + 1 : undefined,
    });
  }

  // Check for selectors targeting site elements
  const siteSelectors = ["body", "html", "#__next", ".app-content", ".sidebar", "nav", "header", "footer"];
  for (const sel of siteSelectors) {
    const pattern = new RegExp(`(?:^|[,{;])\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[{,]`, "im");
    if (pattern.test(css)) {
      messages.push({
        severity: "warning",
        message: `CSS targeting "${sel}" will be stripped to prevent affecting site navigation.`,
      });
    }
  }

  return messages;
}
