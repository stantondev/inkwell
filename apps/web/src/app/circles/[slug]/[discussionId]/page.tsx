import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { notFound, redirect } from "next/navigation";
import DiscussionDetailClient from "./discussion-detail-client";

interface DiscussionData {
  id: string;
  title: string;
  body: string;
  is_prompt: boolean;
  is_pinned: boolean;
  is_locked: boolean;
  response_count: number;
  last_response_at: string | null;
  inserted_at: string;
  circle_id: string;
  circle?: { id: string; name: string; slug: string };
  author: { id: string; username: string; display_name: string; avatar_url: string | null; avatar_frame: string | null } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; discussionId: string }> }): Promise<Metadata> {
  return { title: "Discussion — Inkwell" };
}

export default async function DiscussionPage({
  params,
}: {
  params: Promise<{ slug: string; discussionId: string }>;
}) {
  const { slug, discussionId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  let discussion: DiscussionData;
  try {
    const res = await apiFetch<{ data: DiscussionData }>(
      `/api/circles/discussions/${discussionId}`,
      {},
      session.token
    );
    discussion = res.data;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  return (
    <div className="circle-page">
      <div className="max-w-3xl mx-auto" style={{ padding: "1.5rem 1rem" }}>
        <DiscussionDetailClient
          discussion={discussion}
          circleSlug={slug}
          currentUserId={session.user.id}
        />
      </div>
    </div>
  );
}
