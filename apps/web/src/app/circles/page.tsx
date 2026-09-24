import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import CircleBrowseClient from "./circle-browse-client";
import { FetchError } from "@/components/fetch-error";
import { CIRCLE_CATEGORIES, type Circle, type MyCirclesMeta } from "./circle-types";

export const metadata: Metadata = {
  title: "Circles",
  description:
    "Circles are small communities of writers on Inkwell. Members post journal entries to a circle, answer its prompts, and read each other in their Feed.",
  openGraph: { title: "Circles · Inkwell", description: "Small communities of writers on Inkwell." },
};

export default async function CirclesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const session = await getSession();
  const page = sp.page || "1";
  const category = sp.category || "";
  const search = sp.search || "";

  let circles: Circle[] = [];
  let total = 0;
  let myCircles: Circle[] = [];
  let meta: MyCirclesMeta | null = null;
  let fetchFailed = false;

  try {
    const qs = new URLSearchParams({ page, per_page: "20", category, search }).toString();
    const res = await apiFetch<{ data: Circle[]; pagination: { total: number } }>(
      `/api/circles?${qs}`,
      {},
      session?.token
    );
    circles = res.data;
    total = res.pagination.total;
  } catch {
    fetchFailed = true;
  }

  if (session) {
    try {
      const res = await apiFetch<{ data: Circle[]; meta: MyCirclesMeta }>("/api/my-circles", {}, session.token);
      myCircles = res.data;
      meta = res.meta;
    } catch {
      // The browse list still works without "Your circles".
    }
  }

  return (
    <div className="circle-page">
      <div className="circle-hero">
        <h1>Circles</h1>
        <p>Small communities of writers. Post an entry to a circle and everyone in it reads it in their Feed.</p>
      </div>

      <div className="max-w-5xl mx-auto" style={{ padding: "0 1rem 3rem" }}>
        <ol className="circle-steps">
          <li><strong>Join</strong> a circle that fits what you write or read.</li>
          <li><strong>Write</strong> an entry and choose the circle in its settings. It stays on your journal too.</li>
          <li><strong>Answer prompts</strong> and read the circle&rsquo;s posts in your Feed.</li>
        </ol>

        {fetchFailed ? (
          <FetchError message="We couldn't load circles." />
        ) : (
          <CircleBrowseClient
            initialCircles={circles}
            initialTotal={total}
            initialPage={parseInt(page) || 1}
            myCircles={myCircles}
            categories={CIRCLE_CATEGORIES}
            currentCategory={category}
            currentSearch={search}
            isLoggedIn={!!session}
            canCreate={meta?.can_create ?? false}
            createMessage={meta?.create_message ?? null}
          />
        )}
      </div>
    </div>
  );
}
