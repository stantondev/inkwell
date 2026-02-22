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

  let topFriends: TopFriendSlot[] = [];
  let friends: Friend[] = [];

  try {
    const data = await apiFetch<{ data: TopFriendSlot[] }>("/api/me/top-friends", {}, session.token);
    topFriends = data.data ?? [];
  } catch {
    // empty
  }

  try {
    const data = await apiFetch<{ data: Friend[] }>("/api/friends", {}, session.token);
    friends = data.data ?? [];
  } catch {
    // empty
  }

  return <TopFriendsEditor topFriends={topFriends} friends={friends} />;
}
