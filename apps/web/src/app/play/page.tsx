import type { Metadata } from "next";
import { PlayClient } from "./play-client";

export const metadata: Metadata = {
  title: "The Dead Letter Office",
  description: "A letter a day that never reached anyone. Mend it, read it, deliver it, and work out whose they are.",
  // Prototype: keep it out of search.
  robots: { index: false, follow: false },
};

export default function PlayPage() {
  return <PlayClient />;
}
