import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import CircleBrowseClient from "./circle-browse-client";
import { FetchError } from "@/components/fetch-error";

export const metadata: Metadata = {
  title: "Writing Circles — Inkwell",
  description: "Join intimate writing circles — collaborative spaces for discussion, feedback, and creative community.",
  openGraph: { title: "Writing Circles — Inkwell", description: "Join intimate writing circles on Inkwell." },
};

const CIRCLE_CATEGORIES = [
  { value: "writing_craft", label: "Writing & Craft" },
  { value: "reading_books", label: "Reading & Books" },
  { value: "creative_arts", label: "Creative Arts" },
  { value: "lifestyle_interests", label: "Lifestyle" },
  { value: "tech_learning", label: "Tech & Learning" },
  { value: "community", label: "Community" },
];

interface Circle {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  cover_image_id: string | null;
  member_count: number;
  discussion_count: number;
  is_starter: boolean;
  last_activity_at: string | null;
  inserted_at: string;
  is_member?: boolean;
  owner: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
    subscription_tier: string;
  } | null;
}

export default async function CirclesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const session = await getSession();
  const page = sp.page || "1";
  const category = sp.category || "";
  const search = sp.search || "";

  let circles: Circle[] = [];
  let total = 0;
  let myCircles: Circle[] = [];
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
      const res = await apiFetch<{ data: Circle[] }>("/api/my-circles", {}, session.token);
      myCircles = res.data;
    } catch {
      // silently fail
    }
  }

  return (
    <div className="circle-page">
      <div className="circle-hero">
        <h1>Writing Circles</h1>
        <p>No algorithms, no upvotes — just writers talking about what matters</p>
        {total > 0 && (
          <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.5rem" }}>
            {total} circle{total !== 1 ? "s" : ""} · {circles.reduce((acc, c) => acc + c.discussion_count, 0)} discussion{circles.reduce((acc, c) => acc + c.discussion_count, 0) !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="max-w-5xl mx-auto" style={{ padding: "1.5rem 1rem" }}>
        {fetchFailed ? (
          <FetchError message="We couldn't load circles." />
        ) : (
          <CircleBrowseClient
            initialCircles={circles}
            initialTotal={total}
            initialPage={parseInt(page)}
            myCircles={myCircles}
            categories={CIRCLE_CATEGORIES}
            currentCategory={category}
            currentSearch={search}
            isLoggedIn={!!session}
            isPlus={session?.user?.subscription_tier === "plus"}
          />
        )}
      </div>
    </div>
  );
}
