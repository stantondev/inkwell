import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { ProfileCustomizeEditor } from "./profile-customize-editor";

interface FullUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  subscription_tier?: string;
  profile_html?: string | null;
  profile_css?: string | null;
  profile_music?: string | null;
  profile_background_url?: string | null;
  profile_background_color?: string | null;
  profile_accent_color?: string | null;
  profile_foreground_color?: string | null;
  profile_font?: string | null;
  profile_layout?: string | null;
  profile_widgets?: Record<string, unknown> | null;
  profile_status?: string | null;
  profile_theme?: string | null;
}

export default async function CustomizePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = await apiFetch<{ data: FullUser }>("/api/me", {}, session.token);

  return <ProfileCustomizeEditor user={data.data} />;
}
