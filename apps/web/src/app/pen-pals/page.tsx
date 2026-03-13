import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { PenPalsClient } from "./pen-pals-client";

export const metadata: Metadata = { title: "Pen Pals · Inkwell" };

interface PenPal {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FediverseConnection {
  id: string;
  username: string;
  domain: string;
  display_name: string | null;
  avatar_url: string | null;
  ap_id: string;
  profile_url: string;
  relationship: "mutual" | "follower" | "follower_following_pending" | "following" | "following_pending";
}

export default async function PenPalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let penPals: PenPal[] = [];
  let readers: PenPal[] = [];
  let reading: PenPal[] = [];
  let fediverseConnections: FediverseConnection[] = [];
  let incomingRequests: PenPal[] = [];
  let outgoingRequests: PenPal[] = [];

  try {
    const [ppData, rdData, rgData, fcData, prData] = await Promise.all([
      apiFetch<{ data: PenPal[] }>("/api/pen-pals", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/readers", {}, session.token),
      apiFetch<{ data: PenPal[] }>("/api/reading", {}, session.token),
      apiFetch<{ data: FediverseConnection[] }>("/api/fediverse-connections", {}, session.token),
      apiFetch<{ data: { incoming: PenPal[]; outgoing: PenPal[] } }>("/api/pending-requests", {}, session.token),
    ]);
    penPals = ppData.data ?? [];
    readers = rdData.data ?? [];
    reading = rgData.data ?? [];
    fediverseConnections = fcData.data ?? [];
    incomingRequests = prData.data?.incoming ?? [];
    outgoingRequests = prData.data?.outgoing ?? [];
  } catch {
    // show empty
  }

  return (
    <PenPalsClient
      penPals={penPals}
      readers={readers}
      reading={reading}
      incomingRequests={incomingRequests}
      outgoingRequests={outgoingRequests}
      fediverseConnections={fediverseConnections}
    />
  );
}
