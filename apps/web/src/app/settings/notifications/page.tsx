import { requireSession } from "@/lib/require-session";
import { NotificationSettings } from "../notification-settings";

export default async function NotificationSettingsPage() {
  const session = await requireSession("/settings/notifications");

  return <NotificationSettings />;
}
