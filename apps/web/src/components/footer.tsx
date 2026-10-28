import Link from "next/link";
import { getSite } from "@/lib/site";

// Pages about inkwell.social itself (its costs, marketing, trademark), which a
// self-hosted server doesn't have.
const INKWELL_SOCIAL_ONLY = new Set(["/transparency", "/for-writers", "/switch", "/brand"]);

const SECTIONS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Inkwell",
    links: [
      { href: "/about", label: "About" },
      { href: "/transparency", label: "Transparency" },
      { href: "/roadmap", label: "Roadmap" },
      { href: "/roadmap/new", label: "Submit Feedback" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/guide", label: "Guide" },
      { href: "/help", label: "Help Center" },
      { href: "/for-writers", label: "For Writers" },
      { href: "/switch", label: "Switch to Inkwell" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/ai", label: "AI Policy" },
      { href: "/guidelines", label: "Guidelines" },
      { href: "/brand", label: "Brand" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/developers", label: "API" },
      { href: "/open-source", label: "Open Source" },
    ],
  },
];

export function Footer() {
  const site = getSite();
  const sections = site.selfHosted
    ? SECTIONS.map((s, i) => ({
        title: i === 0 ? "About" : s.title,
        links: s.links.filter((l) => !INKWELL_SOCIAL_ONLY.has(l.href)),
      }))
    : SECTIONS;

  return (
    <footer className="site-footer border-t mt-auto" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-5xl px-4 pt-10 pb-6 text-sm" style={{ color: "var(--muted)" }}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <p
              className="text-base"
              style={{ fontFamily: "var(--font-lora, Georgia, serif)", fontWeight: 600, color: "var(--foreground)" }}
            >
              {site.name}
            </p>
            <p className="mt-1 max-w-[20rem] leading-relaxed">
              A social journal. No algorithms, no ads.
            </p>
            {site.selfHosted && (
              <p className="mt-2 max-w-[20rem] leading-relaxed">
                Run independently at {site.host}. Questions?{" "}
                <a href={`mailto:${site.contactEmail}`} className="hover:underline">
                  {site.contactEmail}
                </a>
              </p>
            )}
          </div>

          {sections.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <p
                className="text-xs font-medium uppercase tracking-widest mb-3"
                style={{ color: "var(--foreground)" }}
              >
                {section.title}
              </p>
              <ul className="flex flex-col gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:underline hover:text-[var(--foreground)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-8 pt-5 border-t text-xs" style={{ borderColor: "var(--border)" }}>
          {site.selfHosted ? (
            <>
              Powered by{" "}
              <a href="https://inkwell.social/open-source" className="hover:underline">
                Inkwell
              </a>
              , open-source social journaling. {site.name} is run independently of inkwell.social.
            </>
          ) : (
            "© 2026 Inkwell"
          )}
        </div>
      </div>
    </footer>
  );
}
