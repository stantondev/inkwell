import { redirect } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { EmailInviteLandingContent } from "./email-invite-landing-content";

interface InviteInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  subscription_tier: string;
  bio: string | null;
  message: string | null;
}

export default async function EmailInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let inviteInfo: InviteInfo | null = null;
  try {
    inviteInfo = await apiFetch<InviteInfo>(`/api/invite-token/${token}`);
  } catch {
    redirect("/get-started");
  }

  if (!inviteInfo) redirect("/get-started");

  return <EmailInviteLandingContent inviteInfo={inviteInfo} token={token} />;
}
