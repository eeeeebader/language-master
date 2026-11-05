const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Monotonic-enough ULID: 10 chars of time + 16 chars of randomness. */
export function ulid(now = Date.now()): string {
  let time = now;
  let t = "";
  for (let i = 0; i < 10; i++) {
    t = ALPHABET[time % 32] + t;
    time = Math.floor(time / 32);
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let r = "";
  for (let i = 0; i < 16; i++) r += ALPHABET[(bytes[i] as number) % 32];
  return t + r;
}
