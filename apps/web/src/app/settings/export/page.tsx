import { requireSession } from "@/lib/require-session";
import { DataExport } from "../data-export";
import { SiteExportCard } from "../site-export-card";

export default async function ExportPage() {
  const session = await requireSession("/settings/export");

  return (
    <>
      <SiteExportCard />
      <DataExport />
    </>
  );
}
