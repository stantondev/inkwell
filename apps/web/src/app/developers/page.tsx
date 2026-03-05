import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Inkwell API",
  description: "Build integrations with Inkwell — API documentation for developers.",
  openGraph: {
    title: "Inkwell API — Developer Documentation",
    description: "Build integrations with Inkwell using the public API.",
    url: "https://inkwell.social/developers",
  },
  alternates: { canonical: "https://inkwell.social/developers" },
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      className="rounded-xl border p-4 text-sm overflow-x-auto"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--foreground)",
        fontFamily: "monospace",
      }}
    >
      {children}
    </pre>
  );
}

function Endpoint({ method, path, description, auth, scope }: {
  method: string;
  path: string;
  description: string;
  auth?: string;
  scope?: string;
}) {
  const methodColors: Record<string, string> = {
    GET: "#22c55e",
    POST: "#3b82f6",
    PATCH: "#f59e0b",
    DELETE: "#ef4444",
  };

  return (
    <div
      className="flex flex-wrap items-baseline gap-2 py-2 border-b last:border-0"
      style={{ borderColor: "var(--border)" }}
    >
      <code
        className="text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ color: methodColors[method] || "var(--accent)", fontFamily: "monospace" }}
      >
        {method}
      </code>
      <code className="text-sm" style={{ fontFamily: "monospace", color: "var(--foreground)" }}>
        {path}
      </code>
      <span className="text-sm" style={{ color: "var(--muted)" }}>
        — {description}
      </span>
      {scope && (
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--surface)", color: "var(--muted)" }}>
          {scope}
        </span>
      )}
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12"
      style={{ color: "var(--foreground)" }}
    >
      <h1
        className="text-3xl font-bold mb-2"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Inkwell API
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        Build integrations with your journal &middot; Base URL: <code style={{ fontFamily: "monospace" }}>https://api.inkwell.social</code>
      </p>

      <div className="flex flex-col gap-10 text-base leading-relaxed">

        {/* Authentication */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Authentication
          </h2>
          <p className="mb-3">
            Authenticate requests using an API key in the <code style={{ fontFamily: "monospace" }}>Authorization</code> header:
          </p>
          <CodeBlock>{`curl https://api.inkwell.social/api/me \\
  -H "Authorization: Bearer ink_your_key_here"`}</CodeBlock>
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            Create API keys in{" "}
            <Link href="/settings/api" className="underline" style={{ color: "var(--accent)" }}>
              Settings &rarr; API
            </Link>
            . Keys start with <code style={{ fontFamily: "monospace" }}>ink_</code> and are shown once at creation.
            Store them securely.
          </p>
        </section>

        {/* Scopes */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Scopes
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex gap-3 items-baseline">
              <code className="text-sm font-medium" style={{ fontFamily: "monospace", color: "var(--accent)" }}>read</code>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Access your own data and public data. Available to all users.
              </span>
            </div>
            <div className="flex gap-3 items-baseline">
              <code className="text-sm font-medium" style={{ fontFamily: "monospace", color: "var(--accent)" }}>write</code>
              <span className="text-sm" style={{ color: "var(--muted)" }}>
                Create, update, and delete entries and images. Requires{" "}
                <Link href="/settings/billing" className="underline">Plus subscription</Link>.
              </span>
            </div>
          </div>
        </section>

        {/* Rate Limits */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Rate Limits
          </h2>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface)" }}>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Tier</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Read (GET)</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Write (POST/PATCH/DELETE)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2">Free</td>
                  <td className="px-4 py-2">100 / 15 min</td>
                  <td className="px-4 py-2" style={{ color: "var(--muted)" }}>N/A</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2">Plus</td>
                  <td className="px-4 py-2">300 / 15 min</td>
                  <td className="px-4 py-2">60 / 15 min</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            Limits are per API key. Rate limit headers (<code style={{ fontFamily: "monospace" }}>X-RateLimit-Limit</code>,{" "}
            <code style={{ fontFamily: "monospace" }}>X-RateLimit-Remaining</code>) are included in every response.
          </p>
        </section>

        {/* Endpoints: Profile */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Profile
          </h2>
          <div className="flex flex-col">
            <Endpoint method="GET" path="/api/me" description="Get your profile and settings" auth="required" />
            <Endpoint method="PATCH" path="/api/me" description="Update your profile" auth="required" scope="write" />
          </div>
        </section>

        {/* Endpoints: Entries */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Entries
          </h2>
          <div className="flex flex-col">
            <Endpoint method="GET" path="/api/drafts" description="List your drafts" auth="required" />
            <Endpoint method="GET" path="/api/entries/:id" description="Get your own entry by ID" auth="required" />
            <Endpoint method="POST" path="/api/entries" description="Create an entry or draft" auth="required" scope="write" />
            <Endpoint method="PATCH" path="/api/entries/:id" description="Update an entry" auth="required" scope="write" />
            <Endpoint method="DELETE" path="/api/entries/:id" description="Delete an entry" auth="required" scope="write" />
            <Endpoint method="POST" path="/api/entries/:id/publish" description="Publish a draft" auth="required" scope="write" />
          </div>
        </section>

        {/* Create Entry Example */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Example: Create an Entry
          </h2>
          <CodeBlock>{`curl -X POST https://api.inkwell.social/api/entries \\
  -H "Authorization: Bearer ink_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My First API Post",
    "body_html": "<p>Hello from the API!</p>",
    "privacy": "public",
    "tags": ["api", "automation"],
    "category": "tech"
  }'`}</CodeBlock>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            To create a draft instead, add <code style={{ fontFamily: "monospace" }}>&quot;status&quot;: &quot;draft&quot;</code> to the request body.
            Drafts can be published later with <code style={{ fontFamily: "monospace" }}>POST /api/entries/:id/publish</code>.
          </p>
        </section>

        {/* Endpoints: Images */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Images
          </h2>
          <div className="flex flex-col">
            <Endpoint method="POST" path="/api/images" description="Upload an image (base64 data URI)" auth="required" scope="write" />
            <Endpoint method="GET" path="/api/images/:id" description="Get an image" auth="public" />
          </div>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            Upload images as base64 data URIs (<code style={{ fontFamily: "monospace" }}>{`{"image": "data:image/png;base64,..."}`}</code>).
            The response includes an <code style={{ fontFamily: "monospace" }}>id</code> and <code style={{ fontFamily: "monospace" }}>url</code>.
            Use the URL in your entry&apos;s <code style={{ fontFamily: "monospace" }}>body_html</code> as an <code style={{ fontFamily: "monospace" }}>&lt;img&gt;</code> src.
          </p>
        </section>

        {/* Endpoints: Public */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Public Endpoints
          </h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            These endpoints work without authentication. Pass an API key to get personalized data (your stamps, bookmarks, relationship status).
          </p>
          <div className="flex flex-col">
            <Endpoint method="GET" path="/api/explore" description="Public discovery feed" />
            <Endpoint method="GET" path="/api/users/:username" description="Get a user&apos;s public profile" />
            <Endpoint method="GET" path="/api/users/:username/entries" description="List a user&apos;s public entries" />
            <Endpoint method="GET" path="/api/users/:username/entries/:slug" description="Get a single public entry" />
            <Endpoint method="GET" path="/api/users/:username/guestbook" description="Read a user&apos;s guestbook" />
          </div>
        </section>

        {/* Entry Create Parameters */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Entry Fields
          </h2>
          <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
            Parameters accepted by <code style={{ fontFamily: "monospace" }}>POST /api/entries</code> and <code style={{ fontFamily: "monospace" }}>PATCH /api/entries/:id</code>:
          </p>
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface)" }}>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Field</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Type</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: "var(--muted)" }}>Notes</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--foreground)" }}>
                {[
                  ["title", "string", "Max 500 chars"],
                  ["body_html", "string", "HTML content (required for publishing)"],
                  ["privacy", "string", "public, friends_only, private, or custom"],
                  ["status", "string", "Set to \"draft\" to create a draft"],
                  ["tags", "string[]", "Array of tag strings"],
                  ["category", "string", "e.g. personal, tech, poetry, travel, books"],
                  ["mood", "string", "Max 100 chars"],
                  ["music", "string", "Embed URL (Spotify, YouTube, etc.)"],
                  ["excerpt", "string", "Max 300 chars (auto-generated if blank)"],
                  ["cover_image_id", "UUID", "ID from POST /api/images"],
                  ["sensitive", "boolean", "Mark as sensitive content"],
                  ["content_warning", "string", "Warning text (max 200 chars)"],
                  ["series_id", "UUID", "Add to a series"],
                  ["custom_filter_id", "UUID", "Required when privacy is custom"],
                ].map(([field, type, notes]) => (
                  <tr key={field} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2"><code style={{ fontFamily: "monospace" }}>{field}</code></td>
                    <td className="px-4 py-2" style={{ color: "var(--muted)" }}>{type}</td>
                    <td className="px-4 py-2" style={{ color: "var(--muted)" }}>{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Error Codes */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Error Codes
          </h2>
          <div className="flex flex-col gap-2">
            {[
              ["401", "Unauthorized", "Invalid, expired, or missing API key"],
              ["403", "Forbidden", "Write scope required, Plus required, or account blocked"],
              ["404", "Not Found", "Resource doesn't exist or access denied"],
              ["422", "Unprocessable", "Validation errors (missing fields, limits reached)"],
              ["429", "Too Many Requests", "Rate limit exceeded — check Retry-After header"],
            ].map(([code, label, desc]) => (
              <div key={code} className="flex gap-3 items-baseline">
                <code className="text-sm font-bold" style={{ fontFamily: "monospace", color: "var(--accent)" }}>{code}</code>
                <span className="text-sm font-medium">{label}</span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>— {desc}</span>
              </div>
            ))}
          </div>
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>
            All error responses include a JSON body with an <code style={{ fontFamily: "monospace" }}>error</code> string.
            Validation errors (422) include an <code style={{ fontFamily: "monospace" }}>errors</code> object with field-level details.
          </p>
        </section>

        {/* Response Format */}
        <section>
          <h2
            className="text-xl font-semibold mb-3"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            Response Format
          </h2>
          <p className="mb-3">All successful responses return JSON with a <code style={{ fontFamily: "monospace" }}>data</code> wrapper:</p>
          <CodeBlock>{`{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My Entry",
    "body_html": "<p>Hello world</p>",
    "slug": "my-entry",
    "privacy": "public",
    "status": "published",
    "tags": ["hello"],
    "category": "personal",
    "word_count": 2,
    "excerpt": "Hello world",
    "published_at": "2026-02-28T12:00:00Z",
    "author": {
      "id": "...",
      "username": "eve",
      "display_name": "Eve"
    }
  }
}`}</CodeBlock>
          <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
            List endpoints include a <code style={{ fontFamily: "monospace" }}>pagination</code> object with <code style={{ fontFamily: "monospace" }}>page</code>,{" "}
            <code style={{ fontFamily: "monospace" }}>per_page</code>, and <code style={{ fontFamily: "monospace" }}>total</code>.
          </p>
        </section>

        {/* Getting Started */}
        <section
          className="rounded-xl border p-6"
          style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
        >
          <h2
            className="text-lg font-semibold mb-2"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)", color: "var(--accent)" }}
          >
            Getting Started
          </h2>
          <ol className="list-decimal list-inside text-sm flex flex-col gap-2" style={{ color: "var(--foreground)" }}>
            <li>
              <Link href="/settings/api" className="underline" style={{ color: "var(--accent)" }}>
                Create an API key
              </Link>{" "}
              in Settings &rarr; API
            </li>
            <li>Copy the key (it&apos;s shown only once)</li>
            <li>
              Test with: <code style={{ fontFamily: "monospace" }}>curl -H &quot;Authorization: Bearer ink_...&quot; https://api.inkwell.social/api/me</code>
            </li>
            <li>Start building your integration</li>
          </ol>
          <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>
            Questions or feedback?{" "}
            <Link href="/roadmap/new" className="underline" style={{ color: "var(--accent)" }}>
              Let us know on the roadmap
            </Link>.
          </p>
        </section>

      </div>
    </main>
  );
}
