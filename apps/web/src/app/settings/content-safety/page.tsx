import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ContentSafety } from "../content-safety";

export default async function ContentSafetyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <ContentSafety />;
}
