/**
 * Tiny Web Audio sound sprite. Clips are synthesised so v1 ships without binary assets;
 * the names match the planned 12-clip sprite so swapping in CC0 clips is a drop-in change.
 */
export type SoundName =
  | "correct"
  | "easy"
  | "streak"
  | "done"
  | "levelup"
  | "flip"
  | "add"
  | "error"
  | "tap";

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType = "sine",
  gain = 0.08,
) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

const SPRITE: Record<SoundName, () => void> = {
  tap: () => tone(660, 0, 0.05, "triangle", 0.04),
  flip: () => tone(520, 0, 0.07, "triangle", 0.05),
  correct: () => {
    tone(587, 0, 0.1);
    tone(784, 0.08, 0.14);
  },
  easy: () => {
    tone(659, 0, 0.08);
    tone(880, 0.07, 0.08);
    tone(1175, 0.14, 0.16);
  },
  error: () => tone(196, 0, 0.18, "sawtooth", 0.04),
  add: () => {
    tone(740, 0, 0.06);
    tone(988, 0.06, 0.1);
  },
  streak: () => {
    tone(523, 0, 0.08);
    tone(659, 0.08, 0.08);
    tone(784, 0.16, 0.14);
  },
  done: () => {
    tone(523, 0, 0.1);
    tone(659, 0.1, 0.1);
    tone(784, 0.2, 0.1);
    tone(1047, 0.3, 0.25);
  },
  levelup: () => {
    tone(440, 0, 0.1);
    tone(554, 0.1, 0.1);
    tone(659, 0.2, 0.1);
    tone(880, 0.3, 0.3);
  },
};

export function play(name: SoundName) {
  if (muted) return;
  try {
    SPRITE[name]();
  } catch {
    /* audio is optional */
  }
}
