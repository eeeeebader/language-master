/** A (target, native) pair may be enabled once its pack and at least 8 lectures are published. */
export const MIN_PUBLISHED_LECTURES = 8;

export interface PairReadiness {
  hasPublishedPack: boolean;
  publishedLectures: number;
}

export function canEnablePair(r: PairReadiness): { ok: true } | { ok: false; reason: string } {
  if (!r.hasPublishedPack) return { ok: false, reason: "no published dictionary pack" };
  if (r.publishedLectures < MIN_PUBLISHED_LECTURES) {
    return {
      ok: false,
      reason: `only ${r.publishedLectures} of ${MIN_PUBLISHED_LECTURES} lectures published`,
    };
  }
  return { ok: true };
}

export interface FlagRow {
  key: string;
  enabled: boolean;
  percentage: number;
  users: string[];
}

/** Merge a partial flag update; percentage is clamped, users de-duplicated. */
export function mergeFlag(
  prev: FlagRow | null,
  patch: { key: string; enabled?: boolean; percentage?: number; users?: string[] },
): FlagRow {
  const base: FlagRow = prev ?? { key: patch.key, enabled: false, percentage: 0, users: [] };
  return {
    key: patch.key,
    enabled: patch.enabled ?? base.enabled,
    percentage: Math.max(0, Math.min(100, Math.round(patch.percentage ?? base.percentage))),
    users: [...new Set(patch.users ?? base.users)],
  };
}
