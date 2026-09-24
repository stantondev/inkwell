import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { GazettePaper } from "./gazette-paper";
import { loadEdition, sectionParam } from "./load";

export const metadata: Metadata = {
  title: "The Gazette",
  description:
    "A twice-daily paper of the stories people across the fediverse are sharing, ranked by how many people shared them. No algorithm, no AI — and a place to write back.",
  openGraph: {
    title: "The Inkwell Gazette",
    description: "What the fediverse is reading, and what Inkwell writers make of it.",
    url: "https://inkwell.social/gazette",
  },
  alternates: { canonical: "https://inkwell.social/gazette" },
};

export default async function GazettePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams]);
  const data = await loadEdition(session?.token);

  return (
    <GazettePaper data={data} section={sectionParam(sp.section)} signedIn={!!session?.user} basePath="/gazette" />
  );
}
