import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DataExport } from "../data-export";

export default async function ExportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <DataExport />;
}
