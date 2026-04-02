"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  getEffectById,
  getEffectBehavior,
  getIntensityMultiplier,
  type ThemeColors,
  type EffectIntensity,
} from "@/lib/profile-effects-config";

const MAX_PARTICLES = 60;
const MAX_DPR = 2;

/** Default fallback colors (ink-blue palette) */
const DEFAULT_COLORS: ThemeColors = {
  accent: "#2d4a8a",
  accentLight: "#5b7ec2",
  muted: "#888888",
  surface: "#ffffff",
  foreground: "#1a1a1a",
};

/**
 * Resolve CSS custom properties from the profile wrapper element.
 * Falls back to defaults if variables aren't set or resolve to empty.
 */
function resolveThemeColors(profileEl: Element | null): ThemeColors {
  if (!profileEl) return DEFAULT_COLORS;
  const cs = getComputedStyle(profileEl);

  function get(varName: string, fallback: string): string {
    const val = cs.getPropertyValue(varName).trim();
    if (!val) return fallback;
    // If the resolved value is an rgb() string, convert to hex
    const rgbMatch = val.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch;
      return `#${Number(r).toString(16).padStart(2, "0")}${Number(g).toString(16).padStart(2, "0")}${Number(b).toString(16).padStart(2, "0")}`;
    }
    // Already a hex value or color keyword — return as-is
    return val;
  }

  return {
    accent: get("--accent", DEFAULT_COLORS.accent),
    accentLight: get("--accent-light", DEFAULT_COLORS.accentLight),
    muted: get("--muted", DEFAULT_COLORS.muted),
    surface: get("--surface", DEFAULT_COLORS.surface),
    foreground: get("--foreground", DEFAULT_COLORS.foreground),
  };
}

interface ProfileEffectsProps {
  effect: string;
  intensity?: EffectIntensity | string;
  /** ID of the profile wrapper element to read CSS variables from */
  profileElementId?: string;
  /** When true, renders as absolute-positioned within parent instead of fixed full-page */
  preview?: boolean;
}

export function ProfileEffects({
  effect,
  intensity = "subtle",
  profileElementId,
  preview = false,
}: ProfileEffectsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const effectConfig = getEffectById(effect);
  const behavior = getEffectBehavior(effect);

  const stableIntensity = useRef(intensity);
  stableIntensity.current = intensity;

  const stableProfileElementId = useRef(profileElementId);
  stableProfileElementId.current = profileElementId;

  const animate = useCallback(() => {
    if (!effectConfig || !behavior) return undefined;

    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    // Resolve colors once at animation start from the profile element's CSS vars
    const profileEl = stableProfileElementId.current
      ? document.getElementById(stableProfileElementId.current)
      : canvas.closest("[data-profile-wrapper]");
    let colors = resolveThemeColors(profileEl);

    type Particle = ReturnType<typeof behavior.spawn>;
    let particles: Particle[] = [];
    let animFrameId = 0;
    let lastTime = 0;
    let paused = false;
    let colorRefreshCounter = 0;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function getTargetCount() {
      const multiplier = getIntensityMultiplier(stableIntensity.current);
      return Math.min(
        Math.round(effectConfig!.baseParticleCount * multiplier),
        MAX_PARTICLES
      );
    }

    function spawnIfNeeded(w: number, h: number) {
      const target = getTargetCount();
      while (particles.length < target) {
        particles.push(behavior!.spawn(w, h));
      }
    }

    function tick(time: number) {
      if (paused) {
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      if (!lastTime) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;

      ctx!.clearRect(0, 0, w, h);

      // Refresh colors every ~2 seconds (120 frames at 60fps) in case theme changes
      colorRefreshCounter++;
      if (colorRefreshCounter >= 120) {
        colorRefreshCounter = 0;
        colors = resolveThemeColors(profileEl);
      }

      spawnIfNeeded(w, h);

      particles = particles.filter((p) => {
        const alive = behavior!.update(p, dt, w, h);
        if (alive) {
          behavior!.draw(ctx!, p, colors);
        }
        return alive;
      });

      animFrameId = requestAnimationFrame(tick);
    }

    resize();

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(canvas);

    function onVisibility() {
      paused = document.visibilityState === "hidden";
      if (!paused) lastTime = 0;
    }
    document.addEventListener("visibilitychange", onVisibility);

    animFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [effectConfig, behavior]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    return animate();
  }, [animate, prefersReducedMotion]);

  if (prefersReducedMotion || !effectConfig || !behavior) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: preview ? "absolute" : "fixed",
        inset: 0,
        zIndex: preview ? 0 : 50,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
