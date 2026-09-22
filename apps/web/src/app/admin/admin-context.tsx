"use client";

import { createContext, useContext } from "react";

/**
 * Small bits of server-known state the panels need. Passed through context
 * rather than props so every lazily-loaded panel can share one signature.
 */
export interface AdminContextValue {
  currentUserId: string;
  /** Re-fetch the rail badges (e.g. after resolving a report). */
  refreshBadges: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider = AdminContext.Provider;

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used inside the admin console");
  }
  return ctx;
}
