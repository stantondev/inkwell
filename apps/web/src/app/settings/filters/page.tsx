import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { FiltersManager } from "./filters-manager";

export default async function FiltersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <FiltersManager />;
}
