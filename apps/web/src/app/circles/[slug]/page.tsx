import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { apiFetch, ApiError } from "@/lib/api";
import { notFound } from "next/navigation";
import CircleDetailClient from "./circle-detail-client";

interface CircleData {
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
  is_member: boolean;
  viewer_role: string | null;
  member_preview: MemberPreview[];
  owner: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
    subscription_tier: string;
  } | null;
}

interface MemberPreview {
  id: string;
  role: string;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    avatar_frame: string | null;
  } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Circle — Inkwell`,
    openGraph: { title: `Circle — Inkwell` },
  };
}

export default async function CircleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();

  let circle: CircleData;
  try {
    const res = await apiFetch<{ data: CircleData }>(`/api/circles/${slug}`, {}, session?.token);
    circle = res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="salon-page">
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "1.5rem 1rem" }}>
        <CircleDetailClient
          circle={circle}
          isLoggedIn={!!session}
          currentUserId={session?.user?.id || null}
        />
      </div>
    </div>
  );
}
