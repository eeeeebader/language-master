import { playClip } from "./audio-pack";

/** Pre-rendered clip when the audio pack has it; else the device's speech synthesis. */
export function speak(text: string, lang = "es-ES") {
  playClip(text).then((played) => {
    if (!played) synth(text, lang);
  });
}

function synth(text: string, lang: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* optional */
  }
}
