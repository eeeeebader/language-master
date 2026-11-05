/**
 * In-memory per-user limiter for story generation: one generation in flight and a daily cap.
 * One API container in v1; move to Postgres counters if the API scales out.
 */
export class GenerationLimiter {
  private inFlight = new Set<string>();
  private daily = new Map<string, { day: string; count: number }>();

  constructor(private readonly maxPerDay: () => number) {}

  /** Returns a release function, or null when the user is over a limit. */
  acquire(userId: string, now = new Date()): (() => void) | null {
    if (this.inFlight.has(userId)) return null;
    const day = now.toISOString().slice(0, 10);
    const d = this.daily.get(userId);
    const count = d && d.day === day ? d.count : 0;
    if (count >= this.maxPerDay()) return null;
    this.daily.set(userId, { day, count: count + 1 });
    this.inFlight.add(userId);
    return () => this.inFlight.delete(userId);
  }

  /** A failed generation does not count against the daily cap. */
  refundDaily(userId: string, now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    const d = this.daily.get(userId);
    if (d && d.day === day && d.count > 0) d.count--;
  }
}
