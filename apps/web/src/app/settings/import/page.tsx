import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DataImport } from "./data-import";
import { ArchiveSettings } from "./archive-settings";

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <DataImport />
      <ArchiveSettings />
    </>
  );
}
