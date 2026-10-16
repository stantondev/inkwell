import type { Metadata } from "next";

import { requireSession } from "@/lib/require-session";
import { EMPTY_PROFILE_FILTERS } from "@/lib/profile-archive-params";
import { loadProfile } from "@/app/[username]/load-profile";
import { ArrangeEditor } from "./arrange-editor";

export const metadata: Metadata = {
  title: "Arrange my page",
  robots: { index: false, follow: false },
};

// Arrange my page: the writer's own profile, drawn exactly as visitors see
// it, with everything on it movable. Saves to PUT /api/me/home.
export default async function ArrangePage() {
  const session = await requireSession("/arrange");
  const username = session.user.username;

  const loaded = await loadProfile(username, session, { filters: EMPTY_PROFILE_FILTERS, page: 1 }, { countView: false });
  if (loaded.kind !== "ok") throw new Error("Couldn't load your page to arrange it.");

  return <ArrangeEditor initialHome={loaded.home} ctx={loaded.ctx} frame={loaded.frame} username={username} />;
}
