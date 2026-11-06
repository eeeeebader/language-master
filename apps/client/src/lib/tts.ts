import { playClip } from "./audio-pack";

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

/** Pre-rendered clip when the audio pack has it; else the device's speech synthesis. */
export async function speak(text: string, lang = "es-ES"): Promise<boolean> {
  if (await playClip(text)) return true;
  const ok = await synth(text, lang);
  if (!ok) window.dispatchEvent(new CustomEvent(TTS_UNAVAILABLE));
  return ok;
}

async function synth(text: string, lang: string): Promise<boolean> {
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
    return true;
  } catch {
    return false;
  }
}
