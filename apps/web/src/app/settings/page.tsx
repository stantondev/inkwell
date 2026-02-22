import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { ProfileEditForm } from "./profile-edit-form";
import { DangerZone } from "./danger-zone";

interface FullUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  pronouns: string | null;
  avatar_url: string | null;
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let user: FullUser = session.user as unknown as FullUser;
  try {
    const data = await apiFetch<{ data: FullUser }>("/api/me", {}, session.token);
    user = data.data;
  } catch {
    // fall back to session data
  }

  return (
    <>
      <ProfileEditForm user={user} />
      <DangerZone username={user.username} />
    </>
  );
}
