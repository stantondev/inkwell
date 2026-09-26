import { requireSession } from "@/lib/require-session";
import { FiltersManager } from "./filters-manager";

export default async function FiltersPage() {
  const session = await requireSession("/settings/filters");

  return <FiltersManager />;
}
