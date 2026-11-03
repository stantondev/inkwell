import { requireSession } from "@/lib/require-session";
import { apiFetch } from "@/lib/api";
import { entryPageStyle, writerAccent } from "@/lib/entry-page-style";
import { EntryPageEditor } from "./entry-page-editor";

export const metadata = { title: "Entry pages" };

interface MeData {
  settings?: Record<string, unknown> | null;
  subscription_tier?: string | null;
  profile_accent_color?: string | null;
  profile_theme?: string | null;
  display_name?: string | null;
  username: string;
}

export default async function EntryPageSettings() {
  const session = await requireSession("/settings/entry-page");

  let me: MeData = {
    settings: session.user.settings ?? null,
    subscription_tier: session.user.subscription_tier,
    display_name: session.user.display_name,
    username: session.user.username,
  };
  try {
    const data = await apiFetch<{ data: MeData }>("/api/me", {}, session.token);
    me = data.data;
  } catch {
    // The session's copy of the settings is enough to show and save.
  }

  return (
    <EntryPageEditor
      initial={entryPageStyle(me.settings?.entry_page)}
      isPlus={me.subscription_tier === "plus"}
      accent={writerAccent(me)}
      name={me.display_name || `@${me.username}`}
    />
  );
}
