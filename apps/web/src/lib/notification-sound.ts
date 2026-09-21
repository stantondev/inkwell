// Synthesized notification chimes (Web Audio API, no sound files).
//
// One AudioContext for the whole page. The nav-count hook mounts three times
// (sidebar, mobile top bar, bottom tab bar), and each used to create its own
// context on the first click.
//
// Browsers only allow audio after a user gesture, so the context is created
// and resumed on the first pointer/key/touch interaction. iOS Safari also
// wants something to actually play inside that gesture, hence the silent
// buffer.

type ChimeKind = "notification" | "letter";

let ctx: AudioContext | null = null;
let unlockInstalled = false;

function createContext(): AudioContext | null {
  if (ctx) return ctx;
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

function unlock() {
  const c = createContext();
  if (c) {
    c.resume().catch(() => {});
    try {
      const buffer = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // ignore
    }
  }
  ["pointerdown", "keydown", "touchend"].forEach((evt) =>
    document.removeEventListener(evt, unlock, true)
  );
}

/** Install the one-time gesture listener that unlocks audio. Safe to call repeatedly. */
export function installAudioUnlock() {
  if (unlockInstalled || typeof document === "undefined") return;
  unlockInstalled = true;
  ["pointerdown", "keydown", "touchend"].forEach((evt) =>
    document.addEventListener(evt, unlock, { capture: true, passive: true })
  );
}

/**
 * A small struck bell: a fundamental plus a few quieter overtones (one slightly
 * inharmonic, which is what makes a bell sound like a bell rather than a beep).
 * Higher partials die away faster, as they do on real metal.
 */
function bell(c: AudioContext, out: AudioNode, freq: number, at: number, length: number, level: number) {
  const partials: [ratio: number, gain: number][] = [
    [1, 1],
    [2, 0.32],
    [2.76, 0.12],
    [4.07, 0.05],
  ];
  for (const [ratio, gain] of partials) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const decay = length / Math.pow(ratio, 0.8);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level * gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

function schedule(c: AudioContext, kind: ChimeKind) {
  const now = c.currentTime + 0.02;

  // Master chain: gentle low-pass so nothing is shrill, plus a short, filtered
  // echo that reads as "a room" rather than a dry electronic blip.
  const master = c.createGain();
  master.gain.value = 0.22;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  master.connect(tone);
  tone.connect(c.destination);

  const delay = c.createDelay(1);
  delay.delayTime.value = 0.12;
  const feedback = c.createGain();
  feedback.gain.value = 0.28;
  const wet = c.createGain();
  wet.gain.value = 0.22;
  const wetTone = c.createBiquadFilter();
  wetTone.type = "lowpass";
  wetTone.frequency.value = 2200;
  master.connect(delay);
  delay.connect(wetTone);
  wetTone.connect(feedback);
  feedback.connect(delay);
  wetTone.connect(wet);
  wet.connect(c.destination);

  if (kind === "letter") {
    // A letter: a slower, warmer three-note figure (G4 · B4 · D5).
    bell(c, master, 392.0, now, 1.1, 0.8);
    bell(c, master, 493.88, now + 0.14, 1.1, 0.75);
    bell(c, master, 587.33, now + 0.28, 1.4, 0.8);
  } else {
    // Everything else: two bright, soft strikes a fifth apart (D5 → A5).
    bell(c, master, 587.33, now, 0.9, 0.85);
    bell(c, master, 880.0, now + 0.12, 1.2, 0.75);
  }

  // Disconnect the feedback loop once the tail has died out.
  window.setTimeout(() => {
    try {
      feedback.disconnect();
      master.disconnect();
    } catch {
      // ignore
    }
  }, 3000);
}

/** Play a chime. Does nothing until the page has had a user gesture. */
export function playChime(kind: ChimeKind = "notification") {
  const c = ctx;
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().then(() => schedule(c, kind)).catch(() => {});
  } else {
    schedule(c, kind);
  }
}

/**
 * Play a chime right now, creating the context if needed. For a "Play a
 * sample" button, where the click itself is the user gesture.
 */
export function previewChime(kind: ChimeKind = "notification") {
  const c = createContext();
  if (!c) return;
  c.resume().then(() => schedule(c, kind)).catch(() => {});
}
