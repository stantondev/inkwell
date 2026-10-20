import type { Metadata } from "next";
import { requireSession } from "@/lib/require-session";
import { apiFetch } from "@/lib/api";
import { FetchError } from "@/components/fetch-error";
import { StampAlbum, type AlbumPage } from "./stamp-album";
import { TrackFeature } from "@/components/track-feature";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stamp album", robots: { index: false, follow: false } };

interface PageProps {
  searchParams: Promise<{ box?: string; type?: string }>;
}

export default async function StampAlbumPage({ searchParams }: PageProps) {
  const { box: rawBox, type: rawType } = await searchParams;
  const box = rawBox === "sent" ? "sent" : "received";
  const type = rawType && /^[a-z0-9_]+$/.test(rawType) ? rawType : null;
  const session = await requireSession(box === "sent" ? "/stamp-album?box=sent" : "/stamp-album");

  let first: AlbumPage | null = null;
  let failed = false;
  try {
    const qs = new URLSearchParams({ box, page: "1", per_page: "30" });
    if (type) qs.set("type", type);
    first = await apiFetch<AlbumPage>(`/api/me/stamps?${qs}`, {}, session.token);
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <TrackFeature feature="stamp_album" />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="stamp-album-header">
          <h1 className="stamp-album-title">Stamp album</h1>
          <p className="stamp-album-sub">
            Postage readers sent you, with the lines they wrote on the back, and the stamps you&rsquo;ve sent. Only you see this page.
          </p>
        </header>
        {failed || !first ? (
          <FetchError message="We couldn't open your stamp album." />
        ) : (
          <StampAlbum key={`${box}:${type ?? ""}`} box={box} type={type} initial={first} />
        )}
      </div>
    </div>
  );
}
