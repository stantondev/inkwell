import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DataImport } from "./data-import";

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DataImport />;
}
