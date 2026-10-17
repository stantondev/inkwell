"use client";

/**
 * The feel of pressing a stamp: a short buzz where phones support it and,
 * for readers who turned it on (settings.stamp_sound, off by default), a soft
 * synthesized "thunk" — a low thud plus a breath of paper. Web Audio, no files.
 */

let ctx: AudioContext | null = null;
let soundOn = false;

/** Kept current by the session poll (live-nav-counts) and the settings toggle. */
export function setStampSoundPreference(on: boolean) {
  soundOn = on;
}
export function stampSoundPreference() {
  return soundOn;
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
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

/** Play the thunk regardless of the preference (for the settings preview). */
export function playStampThunk() {
  const c = context();
  if (!c) return;
  c.resume().catch(() => {});
  const at = c.currentTime + 0.01;
  const out = c.createGain();
  out.gain.value = 0.55;
  out.connect(c.destination);

  // The thud: a low sine dropping in pitch, gone in a fifth of a second.
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, at);
  osc.frequency.exponentialRampToValueAtTime(48, at + 0.16);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.9, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.22);

  // The paper: a very short band of filtered noise.
  const len = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 900;
  band.Q.value = 0.8;
  const nEnv = c.createGain();
  nEnv.gain.value = 0.25;
  noise.connect(band).connect(nEnv).connect(out);
  noise.start(at);
}

/** Called the moment a stamp lands. */
export function stampFeedback() {
  try {
    navigator.vibrate?.(12);
  } catch {
    // ignore
  }
  if (soundOn) playStampThunk();
}
