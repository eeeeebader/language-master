/**
 * Content tools: dictionary pack builder and lecture validator.
 *
 * v0.1 ships a hand-curated seed inside the client. The production pipeline described in the plan
 * (Kaikki Wiktionary extract → SQLite pack with FTS5, Piper audio) lands here; the Zod schemas in
 * @lm/schema are the contract both sides validate against.
 */
import { Lecture } from "@lm/schema";

export function validateLecture(json: unknown) {
  return Lecture.safeParse(json);
}
