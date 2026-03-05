import type { SessionUser } from "@/lib/session";
import { Nav } from "./nav";
import { Sidebar } from "./sidebar";
import { Footer } from "./footer";

/**
 * AppShell — layout wrapper that handles sidebar vs top nav routing.
 *
 * - Logged-in desktop (lg+): left sidebar + content with margin-left
 * - Logged-in mobile/tablet (<lg): top nav with hamburger
 * - Logged-out (all sizes): top nav with Sign in / Get started
 */
export function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Top nav — visible below lg breakpoint for logged-in users, or always for logged-out */}
      <div className={user ? "lg:hidden" : ""}>
        <Nav user={user} />
      </div>

      {/* Sidebar — desktop only, logged-in only */}
      {user && <Sidebar user={user} />}

      {/* Main content area */}
      <main className={`app-content flex flex-col min-h-screen ${user ? "lg:min-h-0" : ""}`}>
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </main>
    </>
  );
}
