import { useEffect, useState } from "react";
import { TTS_UNAVAILABLE } from "@/lib/tts";

/** One-line toast when the device has no voice for the target language. */
export function TtsHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 4000);
    };
    window.addEventListener(TTS_UNAVAILABLE, on);
    return () => {
      window.removeEventListener(TTS_UNAVAILABLE, on);
      clearTimeout(timer);
    };
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-center text-sm text-paper animate-pop">
      Keine spanische Stimme auf diesem Gerät. Lade das Audiopaket in den Einstellungen.
    </div>
  );
}
