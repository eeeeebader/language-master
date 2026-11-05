/** The 12-clip sound sprite. Clip files live in the app; names are the contract. */
export const SOUND_NAMES = [
  "tap",
  "flip",
  "correct",
  "easy",
  "error",
  "add",
  "streak",
  "streak2",
  "streak3",
  "done",
  "levelup",
  "session_start",
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];

/** Suggested sprite layout: name -> [offsetMs, durationMs]. */
export const SOUND_SPRITE: Record<SoundName, [number, number]> = {
  tap: [0, 80],
  flip: [100, 120],
  correct: [300, 250],
  easy: [600, 300],
  error: [1000, 250],
  add: [1300, 200],
  streak: [1600, 300],
  streak2: [2000, 350],
  streak3: [2400, 400],
  done: [2900, 600],
  levelup: [3600, 700],
  session_start: [4400, 300],
};
