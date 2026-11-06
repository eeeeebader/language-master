import { hasClip, playClip, stopClip } from "./audio-pack";

/** Fired when nothing on this device can voice the text (no clip, no speech voice). */
export const TTS_UNAVAILABLE = "lm:tts-unavailable";

let voices: SpeechSynthesisVoice[] = [];
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  voices = speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      voices = speechSynthesis.getVoices();
      resolve(voices);
    };
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 400);
  });
}

let autoSpeakOn = true;
/** Settings: whether taps that are not a speaker button read the text aloud. */
export function setAutoSpeak(on: boolean) {
  autoSpeakOn = on;
}
export function autoSpeakEnabled(): boolean {
  return autoSpeakOn;
}
/** Speak only when the learner wants things read automatically (word taps, calendar days …). */
export function speakAuto(text: string, lang = "es-ES"): Promise<boolean> {
  if (!autoSpeakOn) return Promise.resolve(false);
  return speak(text, lang);
}

/** Pre-rendered clip when the audio pack has it; else the device's speech synthesis. */
export async function speak(text: string, lang = "es-ES"): Promise<boolean> {
  if (await playClip(text)) return true;
  const ok = await synth(text, lang);
  if (!ok) window.dispatchEvent(new CustomEvent(TTS_UNAVAILABLE));
  return ok;
}

async function synth(text: string, lang: string, wait = false): Promise<boolean> {
  try {
    if (!("speechSynthesis" in window)) return false;
    const all = await loadVoices();
    if (all.length === 0) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    const voice = all.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    if (wait)
      await new Promise<void>((res) => u.addEventListener("end", () => res(), { once: true }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a whole story: the single story clip when it is stored, otherwise sentence by sentence.
 * Resolves when reading ends or `signal` aborts.
 */
export async function speakStory(
  whole: string,
  sentences: string[],
  signal?: AbortSignal,
): Promise<boolean> {
  if (await hasClip(whole)) {
    const ok = await playClip(whole, true);
    if (ok) return true;
  }
  let any = false;
  for (const s of sentences) {
    if (signal?.aborted) break;
    const ok = await playClip(s, true);
    if (!ok) {
      const synthOk = await synth(s, "es-ES", true);
      if (!synthOk) break;
    }
    any = true;
  }
  if (!any) window.dispatchEvent(new CustomEvent(TTS_UNAVAILABLE));
  return any;
}

export function stopSpeaking() {
  stopClip();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
