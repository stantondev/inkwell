import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { AdminNav } from "../admin-nav";
import { UserManagement } from "./user-management";

export const metadata: Metadata = { title: "Users · Admin · Inkwell" };

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || !session.user.is_admin) redirect("/feed");

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}>
              User Management
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              View and manage all users
            </p>
          </div>
          <Link href="/feed" className="text-sm hover:underline" style={{ color: "var(--muted)" }}>
            ← Back to feed
          </Link>
        </div>

        <div className="mb-8">
          <AdminNav />
        </div>

        <UserManagement currentUserId={session.user.id} />
      </div>
    </div>
  );
}
