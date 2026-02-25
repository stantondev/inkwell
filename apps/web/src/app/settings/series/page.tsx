import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SeriesManager } from "./series-manager";

export default async function SeriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <SeriesManager isPlus={(session.user.subscription_tier || "free") === "plus"} />;
}
