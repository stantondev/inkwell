"use client";

import { createContext, useContext } from "react";
import type { SeasonId } from "@/lib/seasons";

const SeasonContext = createContext<SeasonId | null>(null);

/** Hands the running season (lib/seasons.ts) to client components. Set once in AppShell. */
export function SeasonProvider({ season, children }: { season: SeasonId | null; children: React.ReactNode }) {
  return <SeasonContext.Provider value={season}>{children}</SeasonContext.Provider>;
}

/** The season the site is dressed for right now, or null. */
export function useSeason(): SeasonId | null {
  return useContext(SeasonContext);
}
