"use client";

import { useEffect } from "react";
import { trackFeature, type Feature } from "@/lib/usage";

/**
 * Drop into a page (server components included) to count that the feature
 * was used: `<TrackFeature feature="gazette" />`. Renders nothing.
 */
export function TrackFeature({ feature }: { feature: Feature }) {
  useEffect(() => {
    trackFeature(feature);
  }, [feature]);
  return null;
}
