import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { apiFetch } from "@/lib/api";
import { TopFriendsEditor } from "./top-friends-editor";

interface TopFriendSlot {
  position: number;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
}

interface Friend {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default async function TopFriendsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // No try/catch on purpose: these used to fall back to empty lists, so a
  // failed load showed six empty slots with nobody to add, and pressing Save
  // then deleted the person's real Top 6. A failed load now shows the error
  // (or reconnecting) screen instead of an editor built on missing data.
  const [topData, friendsData] = await Promise.all([
    apiFetch<{ data: TopFriendSlot[] }>("/api/me/top-friends", {}, session.token),
    apiFetch<{ data: Friend[] }>("/api/friends", {}, session.token),
  ]);
  const topFriends = topData.data ?? [];
  const friends = friendsData.data ?? [];

  return <TopFriendsEditor topFriends={topFriends} friends={friends} />;
}
