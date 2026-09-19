import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { ProfileEditForm } from "./profile-edit-form";

interface FullUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  bio: string | null;
  bio_html: string | null;
  pronouns: string | null;
  avatar_url: string | null;
  preferred_language?: string | null;
  social_links?: Record<string, string> | null;
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // No fallback to the session user: it lacks social_links, support_url and
  // email, and the form sends every field on Save, so a failed load here used
  // to erase them. A failed load now shows the error/reconnecting screen.
  const data = await apiFetch<{ data: FullUser }>("/api/me", {}, session.token);
  const user = data.data;

  return <ProfileEditForm user={user} />;
}
