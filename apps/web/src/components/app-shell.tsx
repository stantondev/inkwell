import { headers } from "next/headers";
import type { SessionUser } from "@/lib/session";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";
import Link from "next/link";

/**
 * AppShell — layout wrapper that handles sidebar vs top nav routing.
 *
 * - Logged-in desktop (lg+): left sidebar + content with margin-left
 * - Logged-in mobile/tablet (<lg): top nav with hamburger
 * - Logged-out (all sizes): top nav with Sign in / Get started
 * - Custom domain: simplified chrome — author name header + Powered by Inkwell footer
 */
export async function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const customDomain = headersList.get("x-custom-domain");
  const customDomainUsername = headersList.get("x-custom-domain-username");

  // Custom domain mode — minimal chrome, no sidebar, no app nav
  if (customDomain && customDomainUsername) {
    return (
      <>
        <header
          className="flex items-center justify-between px-4 sm:px-6 py-3 border-b"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <a
            href={`https://inkwell.social/${customDomainUsername}`}
            className="text-sm font-medium hover:underline"
            style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
          >
            @{customDomainUsername} on Inkwell
          </a>
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
            <a
              href={`https://inkwell.social/${customDomainUsername}/subscribe`}
              className="hover:underline"
            >
              Subscribe
            </a>
            <a href="https://inkwell.social" className="hover:underline">
              Inkwell
            </a>
          </div>
        </header>
        <main className="flex flex-col min-h-screen no-sidebar">
          <div className="flex-1">{children}</div>
          <footer
            className="text-center py-6 text-xs border-t"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            <a
              href="https://inkwell.social"
              className="hover:underline"
              style={{ color: "var(--accent)" }}
            >
              Powered by Inkwell
            </a>
            {" · "}
            <a href="https://inkwell.social/terms" className="hover:underline">
              Terms
            </a>
            {" · "}
            <a href="https://inkwell.social/privacy" className="hover:underline">
              Privacy
            </a>
          </footer>
        </main>
      </>
    );
  }

  // Standard mode
  return (
    <>
      {/* Top nav — visible below lg breakpoint for logged-in users, or always for logged-out */}
      <div className={user ? "lg:hidden" : ""}>
        <Nav user={user} />
      </div>

      {/* Sidebar — desktop only, logged-in only */}
      {user && <Sidebar user={user} />}

      {/* Main content area */}
      <main className={`app-content flex flex-col min-h-screen ${user ? "lg:min-h-0" : "no-sidebar"}`}>
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </main>
    </>
  );
}
