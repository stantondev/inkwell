import type { Metadata } from "next";
import { cache } from "react";
import { getSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { notFound } from "next/navigation";
import CircleDetailClient from "./circle-detail-client";
import type { Circle } from "../circle-types";

const SITE = "https://inkwell.social";

// Shared by generateMetadata and the page so the circle is fetched once.
const loadCircle = cache(async (slug: string, token: string | undefined) => {
  const res = await apiFetch<{ data: Circle }>(`/api/circles/${encodeURIComponent(slug)}`, {}, token);
  return res.data;
});

function plainText(html: string | null): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const session = await getSession();
  try {
    const circle = await loadCircle(slug, session?.token);
    const description =
      plainText(circle.description).slice(0, 160) || `${circle.name}, a circle of writers on Inkwell.`;
    return {
      title: circle.name,
      description,
      alternates: { canonical: `${SITE}/circles/${circle.slug}` },
      openGraph: { title: `${circle.name} · Inkwell`, description, url: `${SITE}/circles/${circle.slug}` },
      // An empty circle isn't worth a search result.
      robots: (circle.entry_count ?? 0) > 0 ? undefined : { index: false, follow: true },
    };
  } catch {
    return { title: "Circle" };
  }
}

export default async function CircleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();

  let circle: Circle;
  try {
    circle = await loadCircle(slug, session?.token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="circle-page">
      <div className="max-w-3xl mx-auto" style={{ padding: "1.5rem 1rem 3rem" }}>
        <CircleDetailClient
          circle={circle}
          isLoggedIn={!!session}
          currentUserId={session?.user?.id || null}
          shareUrl={`${SITE}/circles/${circle.slug}`}
        />
      </div>
    </div>
  );
}
