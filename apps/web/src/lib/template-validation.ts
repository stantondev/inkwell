/**
 * Real-time validation for full-page custom HTML profiles.
 *
 * Provides three severity levels:
 * - Error (red): security issues that will be stripped
 * - Warning (amber): likely mistakes or risky patterns
 * - Info (blue): helpful suggestions for missing recommended content
 */

import { TEMPLATE_TAGS, type TemplateTags } from "./template-tags";

export interface ValidationMessage {
  severity: "error" | "warning" | "info";
  message: string;
  line?: number;
}

/**
 * Levenshtein distance for "Did you mean?" suggestions
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

/**
 * Find the closest matching template tag name
 */
function findClosestTag(input: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;

  for (const tag of TEMPLATE_TAGS) {
    const dist = levenshtein(input.toLowerCase(), tag);
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = tag;
    }
  }

  return best;
}

/**
 * Validate custom HTML for the full-page profile editor.
 * Returns an array of validation messages sorted by severity.
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

  // === WARNINGS: Likely mistakes or risky patterns ===

  // Check for unknown template tags with "Did you mean?" suggestions
  const tagPattern = /\{\{(\w+)\}\}/g;
  let match;
  const seenTags = new Set<string>();

  while ((match = tagPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();

    if (!TEMPLATE_TAGS.includes(tagName as TemplateTags)) {
      const closest = findClosestTag(tagName);
      const lineNum = html.substring(0, match.index).split("\n").length;
      messages.push({
        severity: "warning",
        message: closest
          ? `Unknown template tag {{${match[1]}}}. Did you mean {{${closest}}}?`
          : `Unknown template tag {{${match[1]}}}`,
        line: lineNum,
      });
    } else {
      // Check for duplicate tags
      if (seenTags.has(tagName)) {
        const lineNum = html.substring(0, match.index).split("\n").length;
        messages.push({
          severity: "warning",
          message: `Duplicate {{${tagName}}} tag — only the first instance will be rendered`,
          line: lineNum,
        });
      }
      seenTags.add(tagName);
    }
  }

  // === INFO: Helpful suggestions ===

  // Check for missing recommended tags
  if (!seenTags.has("entries")) {
    messages.push({
      severity: "info",
      message:
        "Your HTML doesn't include {{entries}}. Visitors won't see your journal entries on your profile.",
    });
  }

  if (!seenTags.has("about") && !seenTags.has("display_name") && !seenTags.has("avatar")) {
    messages.push({
      severity: "info",
      message:
        "Consider adding {{about}} or {{display_name}} so visitors know whose profile this is.",
    });
  }

  // Sort: errors first, then warnings, then info
  const order = { error: 0, warning: 1, info: 2 };
  messages.sort((a, b) => order[a.severity] - order[b.severity]);

  return messages;
}

/**
 * Validate custom CSS for the full-page profile editor.
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

/**
 * Starter templates for the full-page HTML editor.
 */
export const STARTER_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  html: string;
  css: string;
}> = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean single-column layout with all essential widgets",
    html: `<div class="profile-page">
  <div class="profile-header">
    {{about}}
  </div>

  <div class="profile-content">
    {{entries}}
  </div>

  <div class="profile-sidebar">
    {{guestbook}}
  </div>
</div>`,
    css: `.profile-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.profile-header {
  margin-bottom: 2rem;
}

.profile-content {
  margin-bottom: 2rem;
}

.profile-sidebar {
  margin-bottom: 2rem;
}`,
  },
  {
    id: "two-column",
    name: "Two Column",
    description: "Classic blog layout with sidebar for widgets",
    html: `<div class="two-col">
  <div class="two-col-header">
    {{about}}
  </div>

  <div class="two-col-body">
    <main class="two-col-main">
      {{entries}}
    </main>

    <aside class="two-col-side">
      {{music}}
      {{tags}}
      {{top_pals}}
      {{newsletter}}
      {{guestbook}}
    </aside>
  </div>
</div>`,
    css: `.two-col {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.two-col-header {
  margin-bottom: 2rem;
}

.two-col-body {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 2rem;
  align-items: start;
}

.two-col-side {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .two-col-body {
    grid-template-columns: 1fr;
  }
}`,
  },
  {
    id: "creative",
    name: "Creative",
    description: "Bold retro-web layout with personality",
    html: `<div class="creative-page">
  <header class="creative-hero">
    <div class="creative-avatar">{{avatar}}</div>
    <h1 class="creative-title">{{display_name}}</h1>
    <p class="creative-handle">{{username}}</p>
    <p class="creative-bio">{{bio}}</p>
    <div class="creative-stats">{{stats}}</div>
    {{follow_button}}
  </header>

  <nav class="creative-nav">
    <span>Journal</span>
    <span>Guestbook</span>
    <span>Links</span>
  </nav>

  <section class="creative-section">
    <h2>Journal</h2>
    {{entries}}
  </section>

  <section class="creative-section">
    <h2>Music</h2>
    {{music}}
  </section>

  <div class="creative-grid">
    <section class="creative-card">
      <h3>Top Pals</h3>
      {{top_pals}}
    </section>

    <section class="creative-card">
      <h3>Tags</h3>
      {{tags}}
    </section>
  </div>

  <section class="creative-section">
    <h2>Guestbook</h2>
    {{guestbook}}
  </section>

  <footer class="creative-footer">
    {{rss}} &middot; {{support}}
  </footer>
</div>`,
    css: `.creative-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-family: Georgia, serif;
}

.creative-hero {
  text-align: center;
  padding: 3rem 1rem;
  margin-bottom: 2rem;
  border-bottom: 3px double var(--accent, #2d4a8a);
}

.creative-avatar {
  margin-bottom: 1rem;
  display: flex;
  justify-content: center;
}

.creative-title {
  font-size: 2.5rem;
  margin: 0;
}

.creative-handle {
  color: var(--muted, #888);
  margin: 0.25rem 0 1rem;
}

.creative-bio {
  max-width: 500px;
  margin: 0 auto 1rem;
  line-height: 1.6;
}

.creative-stats {
  font-size: 0.9rem;
  color: var(--muted, #888);
  margin-bottom: 1rem;
}

.creative-nav {
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1rem;
  margin-bottom: 2rem;
  font-weight: 600;
  color: var(--accent, #2d4a8a);
}

.creative-section {
  margin-bottom: 2.5rem;
}

.creative-section h2 {
  font-size: 1.5rem;
  border-bottom: 1px solid var(--border, #e5e5e5);
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

.creative-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}

.creative-card {
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 12px;
  padding: 1.25rem;
}

.creative-card h3 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.creative-footer {
  text-align: center;
  padding: 2rem;
  border-top: 1px solid var(--border, #e5e5e5);
  color: var(--muted, #888);
}

@media (max-width: 640px) {
  .creative-grid {
    grid-template-columns: 1fr;
  }

  .creative-title {
    font-size: 1.8rem;
  }
}`,
  },
];
