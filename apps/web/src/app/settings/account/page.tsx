import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { DangerZone } from "../danger-zone";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let username = session.user.username;
  try {
    const data = await apiFetch<{ data: { username: string } }>("/api/me", {}, session.token);
    username = data.data.username;
  } catch {
    // fall back to session data
  }

  return (
    <div>
      <h2
        className="text-lg font-semibold mb-6"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Account
      </h2>
      <DangerZone username={username} />
    </div>
  );
}
