/** Native speech synthesis; Capacitor TTS / Piper audio packs replace this later. */
export function speak(text: string, lang = "es-ES") {
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
