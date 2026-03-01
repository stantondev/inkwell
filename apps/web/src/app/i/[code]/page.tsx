import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface InviterInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
  bio: string | null;
}

const VALUE_PROPS = [
  "No algorithms, no ads -- ever",
  "Customize your page like it's 2004",
  "Your data is always yours",
  "Connected to Mastodon and the fediverse",
];

export default async function InviteLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  let inviter: InviterInfo | null = null;
  try {
    inviter = await apiFetch<InviterInfo>(`/api/invite-link/${code}`);
  } catch {
    redirect("/get-started");
  }

  if (!inviter) redirect("/get-started");

  // Set the invite cookie via a client component
  return <InviteLandingContent inviter={inviter} code={code} />;
}

// Separate client component for cookie setting + interactive UI
import { InviteLandingContent } from "./invite-landing-content";
