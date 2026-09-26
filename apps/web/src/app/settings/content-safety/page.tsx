import { requireSession } from "@/lib/require-session";
import { ContentSafety } from "../content-safety";

export default async function ContentSafetyPage() {
  const session = await requireSession("/settings/content-safety");

  return <ContentSafety />;
}
