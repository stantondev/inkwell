import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { NotificationSettings } from "../notification-settings";

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <h2
        className="text-lg font-semibold mb-6"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Notifications
      </h2>
      <NotificationSettings />
    </div>
  );
}
