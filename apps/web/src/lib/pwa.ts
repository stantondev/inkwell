"use client";

import { useEffect, useState } from "react";

/**
 * Installing Inkwell as an app, and the icon badge once it is installed.
 *
 * Chrome/Edge/Samsung fire `beforeinstallprompt` once, early, and only give a
 * way to show the install dialog through that event. It is captured at module
 * load (this file is imported by the always-mounted ServiceWorkerRegister) so
 * it isn't missed before the menu that offers "Install" is ever opened.
 * iOS has no such event; the menu explains Share → Add to Home Screen instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's mini-infobar away; we offer it in the menu
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export interface PwaInstallState {
  /** Already running as an installed app. */
  installed: boolean;
  /** The browser's own install dialog is available. */
  canPrompt: boolean;
  /** iOS: installing is manual (Share → Add to Home Screen). */
  ios: boolean;
  prompt: () => Promise<boolean>;
}

export function usePwaInstall(): PwaInstallState {
  const [, force] = useState(0);
  const [env, setEnv] = useState({ installed: false, ios: false });

  useEffect(() => {
    // Read after mount: these differ between server and client.
    setEnv({ installed: isStandalone(), ios: isIOS() });
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  return {
    installed: env.installed,
    ios: env.ios,
    canPrompt: deferredPrompt !== null,
    prompt: async () => {
      const p = deferredPrompt;
      if (!p) return false;
      await p.prompt();
      const { outcome } = await p.userChoice;
      deferredPrompt = null;
      notify();
      return outcome === "accepted";
    },
  };
}

/** The unread count on the installed app's icon (Badging API; no-op where unsupported). */
export function setAppIconBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch { /* unsupported */ }
}
