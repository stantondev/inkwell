import { readFile } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";
import { marked } from "marked";
import { getSite } from "@/lib/site";

/**
 * A self-hosted server's own Terms of Service or Privacy Policy.
 *
 * inkwell.social's policies name inkwell.social as the operator, so they don't
 * apply to someone else's server. The operator supplies theirs as Markdown in
 * the mounted legal/ folder (legal/terms.md, legal/privacy.md), or points
 * TERMS_URL / PRIVACY_URL at where they live. Until then the page says so and
 * gives the contact address. See legal/README.md.
 */

const KINDS = {
  terms: { title: "Terms of Service", file: "terms.md", env: "TERMS_URL" },
  privacy: { title: "Privacy Policy", file: "privacy.md", env: "PRIVACY_URL" },
} as const;

export type PolicyKind = keyof typeof KINDS;

async function readPolicy(file: string): Promise<string | null> {
  const dir = process.env.LEGAL_DIR || path.join(process.cwd(), "legal");
  try {
    const text = await readFile(path.join(dir, file), "utf8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export async function OperatorPolicy({ kind }: { kind: PolicyKind }) {
  const { title, file, env } = KINDS[kind];
  const site = getSite();
  const markdown = await readPolicy(file);

  if (!markdown) {
    const url = (process.env[env] || "").trim();
    if (/^https?:\/\//.test(url)) redirect(url);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12" style={{ color: "var(--foreground)" }}>
      <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
        {title}
      </h1>
      <p className="text-sm mb-10" style={{ color: "var(--muted)" }}>
        {site.name} ({site.host})
      </p>

      {markdown ? (
        // The operator's own file on their own server, so it's trusted like
        // the rest of their configuration.
        <div className="prose-entry" dangerouslySetInnerHTML={{ __html: marked.parse(markdown, { async: false }) as string }} />
      ) : (
        <div className="rounded-xl border p-5 leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p>
            {site.name} hasn&apos;t published its {title.toLowerCase()} here yet. It&apos;s run independently, not by
            inkwell.social, so inkwell.social&apos;s policies don&apos;t apply to it.
          </p>
          <p className="mt-3">
            Questions about how this server works or handles your information:{" "}
            <a href={`mailto:${site.contactEmail}`} className="underline" style={{ color: "var(--accent)" }}>
              {site.contactEmail}
            </a>
            .
          </p>
        </div>
      )}
    </main>
  );
}
