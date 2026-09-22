import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Admin is a single console now, so the layout only guards the route —
 * the heading, section rail and back link live in the console itself.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !session.user.is_admin) redirect("/feed");

  return (
    <div className="adm-shell">
      <div className="adm-shell-inner">
        <header className="adm-masthead">
          <h1 className="adm-masthead-title">Admin</h1>
          <p className="adm-masthead-sub">Everything that runs Inkwell, in one place.</p>
        </header>
        {children}
      </div>
    </div>
  );
}
