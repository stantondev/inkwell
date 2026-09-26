import { requireSession } from "@/lib/require-session";
import { apiFetch } from "@/lib/api";
import { DangerZone } from "../danger-zone";

export default async function AccountPage() {
  const session = await requireSession("/settings/account");

  let username = session.user.username;
  try {
    const data = await apiFetch<{ data: { username: string } }>("/api/me", {}, session.token);
    username = data.data.username;
  } catch {
    // fall back to session data
  }

  return <DangerZone username={username} />;
}
