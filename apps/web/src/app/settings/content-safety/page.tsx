import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ContentSafety } from "../content-safety";

export default async function ContentSafetyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <h2
        className="text-lg font-semibold mb-6"
        style={{ fontFamily: "var(--font-lora, Georgia, serif)" }}
      >
        Content Safety
      </h2>
      <ContentSafety />
    </div>
  );
}
