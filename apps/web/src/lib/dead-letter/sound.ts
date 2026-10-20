"use client";

// Small synthesized sounds for the Dead Letter Office (Web Audio, no files):
// paper being picked up, a piece settling into place, a drop of ink lost, a
// word coming back. The postmark uses the stamp thunk.

import { playStampThunk } from "@/lib/stamp-sound";

let ctx: AudioContext | null = null;
let on = true;
const PREF = "inkwell-dlo:sound";

export function loadSoundPref(): boolean {
  try {
    on = window.localStorage.getItem(PREF) !== "off";
  } catch {
    on = true;
  }
  return on;
}

export function setSoundPref(next: boolean) {
  on = next;
  try {
    window.localStorage.setItem(PREF, next ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function context(): AudioContext | null {
  if (!on || typeof window === "undefined") return null;
  if (ctx) {
    ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function noise(c: AudioContext, at: number, seconds: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass") {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Crinkly: bursts rather than a smooth hiss.
    const crackle = Math.random() < 0.08 ? 1 : 0.35;
    data[i] = (Math.random() * 2 - 1) * crackle * Math.pow(1 - i / len, 1.6);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.value = gain;
  src.connect(filter).connect(env).connect(c.destination);
  src.start(at);
}

export function paperLift() {
  const c = context();
  if (!c) return;
  noise(c, c.currentTime + 0.005, 0.16, 2600, 0.6, 0.28);
}

export function paperSettle() {
  const c = context();
  if (!c) return;
  const at = c.currentTime + 0.005;
  noise(c, at, 0.09, 1400, 0.9, 0.4);
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, at);
  osc.frequency.exponentialRampToValueAtTime(110, at + 0.08);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.35, at + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  osc.connect(env).connect(c.destination);
  osc.start(at);
  osc.stop(at + 0.12);
}

export function inkDrip() {
  const c = context();
  if (!c) return;
  const at = c.currentTime + 0.005;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(900, at);
  osc.frequency.exponentialRampToValueAtTime(260, at + 0.18);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(env).connect(c.destination);
  osc.start(at);
  osc.stop(at + 0.24);
}

/** A soft rising pair of notes when a word comes back. */
export function wordFound() {
  const c = context();
  if (!c) return;
  const at = c.currentTime + 0.005;
  [659.25, 987.77].forEach((f, i) => {
    const t = at + i * 0.09;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(env).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.75);
  });
}

export function postmarkThunk() {
  if (!on) return;
  playStampThunk();
}

export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
