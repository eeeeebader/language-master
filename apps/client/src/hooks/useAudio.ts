import { useEffect, useState } from "react";
import { type AudioState, audioState, onAudioState } from "@/lib/audio-pack";

export function useAudioState(): AudioState {
  const [s, setS] = useState<AudioState>(audioState());
  useEffect(() => onAudioState(setS), []);
  return s;
}
