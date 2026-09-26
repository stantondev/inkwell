import { requireSession } from "@/lib/require-session";
import { DataExport } from "../data-export";

export default async function ExportPage() {
  const session = await requireSession("/settings/export");

  return <DataExport />;
}
