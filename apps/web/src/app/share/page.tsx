import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ShareChooser } from "./share-chooser";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Share to Inkwell", robots: { index: false } };

/**
 * Where "Share → Inkwell" from another app lands (the manifest's
 * share_target). Android apps often put the link inside `text` and leave
 * `url` empty, so a link is pulled out of the text when needed.
 */
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session) {
    const qs = new URLSearchParams();
    for (const k of ["title", "text", "url"] as const) if (sp[k]) qs.set(k, sp[k]!);
    const back = `/share${qs.size ? `?${qs}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const title = (sp.title ?? "").trim().slice(0, 300);
  let text = (sp.text ?? "").trim().slice(0, 2000);
  let url = (sp.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "";
    const found = text.match(/https?:\/\/\S+/i);
    if (found) {
      url = found[0].replace(/[).,;!?]+$/, "");
      text = text.replace(found[0], "").trim();
    }
  }
  if (text === title) text = "";

  return <ShareChooser title={title} text={text} url={url} />;
}
