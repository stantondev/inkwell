"use client";

import { useEffect, useState } from "react";

/** Fired by Settings → Look & feel so the switch takes effect without a reload. */
export const MOTION_EFFECTS_EVENT = "inkwell-motion-effects";

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Tilt effects (opt-in, Settings → Look & feel): stamps, archive postmarks
 * and avatar frames shift a little and catch the light as the phone tilts.
 * Sets --tilt-x / --tilt-y (-1..1) and data-tilt on <html>; the look lives in
 * globals.css. Off under Reduce Motion. iOS asks for motion permission, which
 * needs a tap: the settings switch asks, and afterwards the first tap of a
 * visit re-confirms it (iOS answers without a prompt once allowed).
 */
export function TiltEffects({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = useState(initial);

  useEffect(() => {
    const on = (e: Event) => setEnabled(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(MOTION_EFFECTS_EVENT, on);
    return () => window.removeEventListener(MOTION_EFFECTS_EVENT, on);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const root = document.documentElement;
    let base: { b: number; g: number } | null = null;
    let target = { x: 0, y: 0 };
    let frame = 0;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    const paint = () => {
      frame = 0;
      root.style.setProperty("--tilt-x", target.x.toFixed(3));
      root.style.setProperty("--tilt-y", target.y.toFixed(3));
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      // However you hold the phone is "level"; the baseline drifts slowly
      // toward the current angle so it re-centres when you settle.
      if (!base) base = { b: e.beta, g: e.gamma };
      base.b += (e.beta - base.b) * 0.02;
      base.g += (e.gamma - base.g) * 0.02;
      target = { x: clamp((e.gamma - base.g) / 20), y: clamp((e.beta - base.b) / 20) };
      root.setAttribute("data-tilt", "");
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const start = () => window.addEventListener("deviceorientation", onOrient);

    const Ctor = DeviceOrientationEvent as OrientationCtor;
    let onTap: (() => void) | null = null;
    if (typeof Ctor.requestPermission === "function") {
      onTap = () => {
        Ctor.requestPermission!().then((r) => { if (r === "granted") start(); }).catch(() => {});
      };
      window.addEventListener("pointerup", onTap, { once: true });
    } else {
      start();
    }

    return () => {
      if (onTap) window.removeEventListener("pointerup", onTap);
      window.removeEventListener("deviceorientation", onOrient);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute("data-tilt");
      root.style.removeProperty("--tilt-x");
      root.style.removeProperty("--tilt-y");
    };
  }, [enabled]);

  return null;
}
