import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { UserManagement } from "./user-management";

export const metadata: Metadata = { title: "Users · Admin · Inkwell" };

export default async function AdminUsersPage() {
  const session = await getSession();

  return <UserManagement currentUserId={session!.user.id} />;
}
