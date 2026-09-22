import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { NotificationSettings } from "../notification-settings";

export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <NotificationSettings />;
}
