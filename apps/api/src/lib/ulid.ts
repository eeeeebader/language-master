import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(now = Date.now()): string {
  let time = now;
  let t = "";
  for (let i = 0; i < 10; i++) {
    t = ALPHABET[time % 32] + t;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(16);
  let r = "";
  for (let i = 0; i < 16; i++) r += ALPHABET[(bytes[i] as number) % 32];
  return t + r;
}
