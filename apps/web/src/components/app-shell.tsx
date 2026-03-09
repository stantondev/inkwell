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

  // Custom domain mode — no header, no sidebar, no app nav
  // The author's site is THEIR brand — we stay out of the way
  // "Powered by Inkwell" footer is rendered INSIDE the profile page's theme wrapper
  // (in [username]/page.tsx) so it inherits the author's color scheme
  if (customDomain && customDomainUsername) {
    return (
      <main className="flex flex-col min-h-screen no-sidebar">
        {children}
      </main>
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
        <Footer selfHosted={user?.self_hosted} />
      </main>
    </>
  );
}
