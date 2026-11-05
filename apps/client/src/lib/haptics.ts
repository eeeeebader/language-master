import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

let enabled = true;
export function setHaptics(on: boolean) {
  enabled = on;
}

export async function tap() {
  if (!enabled) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    navigator.vibrate?.(8);
  }
}

export async function success() {
  if (!enabled) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    navigator.vibrate?.([10, 30, 10]);
  }
}

export async function warn() {
  if (!enabled) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    navigator.vibrate?.(25);
  }
}
