import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DataExport } from "../data-export";

export default async function ExportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <h2
        className="text-lg font-semibold mb-6"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Data Export
      </h2>
      <DataExport />
    </div>
  );
}
