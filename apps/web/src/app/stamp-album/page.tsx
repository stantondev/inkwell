import type { Metadata } from "next";
import { requireSession } from "@/lib/require-session";
import { apiFetch } from "@/lib/api";
import { FetchError } from "@/components/fetch-error";
import { AlbumTabs, StampAlbum, type AlbumPage, type AlbumStamp } from "./stamp-album";
import { StampBook } from "./stamp-book";
import { TrackFeature } from "@/components/track-feature";
import type { Book } from "@/lib/stamp-book";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stamp album", robots: { index: false, follow: false } };

interface PageProps {
  searchParams: Promise<{ box?: string; type?: string; view?: string }>;
}

export default async function StampAlbumPage({ searchParams }: PageProps) {
  const { box: rawBox, type: rawType, view } = await searchParams;
  const box = rawBox === "sent" ? "sent" : "received";
  const asBook = box === "received" && view !== "list";
  const type = rawType && /^[a-z0-9_]+$/.test(rawType) ? rawType : null;
  const here = box === "sent" ? "/stamp-album?box=sent" : asBook ? "/stamp-album" : "/stamp-album?view=list";
  const session = await requireSession(here);

  let list: AlbumPage | null = null;
  let book: { stamps: AlbumStamp[]; album: Book | null } | null = null;
  let failed = false;
  try {
    if (asBook) {
      book = (await apiFetch<{ data: { stamps: AlbumStamp[]; album: Book | null } }>("/api/me/stamp-album", {}, session.token)).data;
    } else {
      const qs = new URLSearchParams({ box, page: "1", per_page: "30" });
      if (type) qs.set("type", type);
      list = await apiFetch<AlbumPage>(`/api/me/stamps?${qs}`, {}, session.token);
    }
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <TrackFeature feature="stamp_album" />
      <div className={`mx-auto px-4 py-8 ${asBook ? "max-w-6xl" : "max-w-3xl"}`}>
        <header className="stamp-album-header">
          <h1 className="stamp-album-title">Stamp album</h1>
          <p className="stamp-album-sub">
            {asBook
              ? "The postage readers have sent you, mounted however you like. Turn a stamp over to read what they wrote on the back. Only you see this page."
              : "Postage readers sent you, with the lines they wrote on the back, and the stamps you’ve sent. Only you see this page."}
          </p>
        </header>
        {failed ? (
          <>
            <AlbumTabs current={asBook ? "album" : box} />
            <FetchError message="We couldn't open your stamp album." />
          </>
        ) : asBook && book ? (
          <>
            <AlbumTabs current="album" />
            <StampBook
              stamps={book.stamps ?? []}
              saved={book.album}
              ownerName={session.user.display_name || session.user.username}
            />
          </>
        ) : list ? (
          <StampAlbum key={`${box}:${type ?? ""}`} box={box} type={type} initial={list} />
        ) : null}
      </div>
    </div>
  );
}
