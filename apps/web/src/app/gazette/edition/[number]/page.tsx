import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { notFoundOrRethrow } from "@/lib/page-errors";
import type { GazetteEditionData } from "@/lib/gazette";
import { GazettePaper } from "../../gazette-paper";
import { loadEdition, sectionParam } from "../../load";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return {
    title: `Gazette No. ${number}`,
    robots: { index: false, follow: true },
  };
}

export default async function GazetteEditionPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const [{ number }, sp, session] = await Promise.all([params, searchParams, getSession()]);
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) notFound();

  let data: GazetteEditionData;
  try {
    data = await loadEdition(session?.token, n);
  } catch (err) {
    notFoundOrRethrow(err);
  }

  return (
    <GazettePaper
      data={data}
      section={sectionParam(sp.section)}
      signedIn={!!session?.user}
      basePath={`/gazette/edition/${n}`}
    />
  );
}
