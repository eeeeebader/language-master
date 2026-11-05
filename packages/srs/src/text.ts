/** Accent-insensitive, case-insensitive, punctuation-tolerant comparison for typed answers. */
export function normaliseAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip a leading article so "el perro" matches "perro" and vice versa. */
export function stripArticle(s: string): string {
  return s.replace(/^(el|la|los|las|un|una|unos|unas|der|die|das|ein|eine|the|a|an)\s+/i, "");
}

export function answersMatch(typed: string, expected: string): boolean {
  const t = normaliseAnswer(typed);
  const e = normaliseAnswer(expected);
  if (!t) return false;
  if (t === e) return true;
  if (stripArticle(t) === stripArticle(e)) return true;
  // Accept any one of several glosses separated by , ; or /
  return expected
    .split(/[,;/]/)
    .map((x) => stripArticle(normaliseAnswer(x)))
    .some((x) => x.length > 0 && x === stripArticle(t));
}

/** Prefix + fuzzy (edit distance ≤ 1) + accent-insensitive match used by dictionary search. */
export function fuzzyMatch(query: string, candidate: string): boolean {
  const q = normaliseAnswer(query);
  const c = normaliseAnswer(candidate);
  if (!q) return false;
  if (c.startsWith(q)) return true;
  if (c.split(" ").some((w) => w.startsWith(q))) return true;
  if (Math.abs(q.length - c.length) > 1) return false;
  return editDistance(q, c) <= 1;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    prev = cur;
  }
  return prev[n] as number;
}

/** Pick `count` distractors with the same POS where possible, never the answer itself. */
export function pickDistractors<T extends { id: string; pos: string; back: string }>(
  target: T,
  pool: readonly T[],
  count: number,
  rng: () => number = Math.random,
): T[] {
  const notSelf = pool.filter(
    (p) => p.id !== target.id && normaliseAnswer(p.back) !== normaliseAnswer(target.back),
  );
  const samePos = shuffle(
    notSelf.filter((p) => p.pos === target.pos),
    rng,
  );
  const others = shuffle(
    notSelf.filter((p) => p.pos !== target.pos),
    rng,
  );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of [...samePos, ...others]) {
    const key = normaliseAnswer(c.back);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}
