import type { Metadata } from "next";
import { PlayClient } from "./play-client";

export const metadata: Metadata = {
  title: "The Dead Letter Office",
  description: "A letter a day that never reached anyone. Mend it, read it, deliver it, and work out whose they are.",
  alternates: { canonical: "/play" },
  openGraph: {
    title: "The Dead Letter Office",
    description: "A real letter from history each weekday, torn and missing a few words. Mend it, deliver it, and name the writer.",
    url: "/play",
    type: "website",
  },
};

export default function PlayPage() {
  return <PlayClient />;
}
