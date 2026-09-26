import { requireSession } from "@/lib/require-session";
import { DataImport } from "./data-import";
import { ArchiveSettings } from "./archive-settings";

export default async function ImportPage() {
  const session = await requireSession("/settings/import");

  return (
    <>
      <DataImport />
      <ArchiveSettings />
    </>
  );
}
