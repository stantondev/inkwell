import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { AvatarBuilderPage } from "./avatar-builder-page";

interface UserData {
  avatar_url: string | null;
  avatar_config: { style: string; options: Record<string, string> } | null;
  avatar_frame: string | null;
  subscription_tier: string;
  display_name: string;
}

export default async function AvatarSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let user: UserData = {
    avatar_url: session.user.avatar_url,
    avatar_config: (session.user.avatar_config as UserData["avatar_config"]) ?? null,
    avatar_frame: session.user.avatar_frame ?? null,
    subscription_tier: session.user.subscription_tier ?? "free",
    display_name: session.user.display_name,
  };

  try {
    const data = await apiFetch<{ data: UserData }>("/api/me", {}, session.token);
    user = {
      avatar_url: data.data.avatar_url,
      avatar_config: data.data.avatar_config,
      avatar_frame: data.data.avatar_frame,
      subscription_tier: data.data.subscription_tier,
      display_name: data.data.display_name,
    };
  } catch {
    // fall back to session data
  }

  return <AvatarBuilderPage user={user} />;
}
