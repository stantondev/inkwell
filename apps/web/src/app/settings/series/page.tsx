import { requireSession } from "@/lib/require-session";
import { SeriesManager } from "./series-manager";

export default async function SeriesPage() {
  const session = await requireSession("/settings/series");

  return <SeriesManager isPlus={(session.user.subscription_tier || "free") === "plus"} />;
}
