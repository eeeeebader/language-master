import { replay } from "@lm/srs";
import { beforeEach, describe, expect, it } from "vitest";
import { DICTIONARY_ES } from "../src/data/dictionary-es";
import { db } from "../src/db/db";
import {
  addDictionaryWord,
  createList,
  ensureWord,
  overrideReview,
  recordReview,
} from "../src/db/repo";
import { buildSession } from "../src/lib/session-builder";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("repository", () => {
  it("resolves one canonical word per lemma across lists", async () => {
    const a = await createList("es", "A");
    const b = await createList("es", "B");
    const perro = DICTIONARY_ES.find((e) => e.lemma === "perro");
    if (!perro) throw new Error("seed");
    const w1 = await addDictionaryWord(
      perro,
      [{ kind: "lemma", front: "perro", back: "Hund" }],
      a.id,
    );
    const w2 = await addDictionaryWord(
      perro,
      [{ kind: "article", front: "el perro", back: "Hund" }],
      b.id,
    );
    expect(w1.id).toBe(w2.id);
    expect(await db.words.count()).toBe(1);
    expect(await db.variants.count()).toBe(2);
    expect(await db.listWords.count()).toBe(2);
    expect(await db.sentences.where("wordId").equals(w1.id).count()).toBe(1);
  });

  it("records events, derives state and overrides via supersedes", async () => {
    const w = await ensureWord({ language: "es", lemma: "casa", translation: "Haus", pos: "noun" });
    await db.variants.add({
      id: "v1",
      wordId: w.id,
      kind: "lemma",
      front: "casa",
      back: "Haus",
      createdAt: new Date().toISOString(),
    });
    const ev = await recordReview({
      variantId: "v1",
      wordId: w.id,
      grade: 4,
      reactionMs: 3000,
      mode: "reaction",
      promptKind: "target_to_native",
      manual: false,
    });
    const before = await db.cardStates.get("v1");
    expect(before?.reps).toBe(1);
    expect(await db.profiles.get(["v1", "target_to_native"])).toBeUndefined(); // wrong answers don't feed the profile

    await overrideReview(ev.id, 1);
    const events = await db.events.toArray();
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.supersedes === ev.id)?.grade).toBe(1);
    const after = await db.cardStates.get("v1");
    expect(after).toEqual(replay(events).get("v1"));
    expect(after?.stability ?? 0).toBeGreaterThan(before?.stability ?? 0);
    const act = await db.activity.toArray();
    expect(act[0]?.reviews).toBe(1);
  });

  it("builds a session from lists with filters and direction", async () => {
    const l = await createList("es", "L");
    const gato = DICTIONARY_ES.find((e) => e.lemma === "gato");
    if (!gato) throw new Error("seed");
    await addDictionaryWord(gato, [{ kind: "lemma", front: "gato", back: "Katze" }], l.id);
    const cards = await buildSession({
      language: "es",
      listIds: [l.id],
      filter: "new",
      direction: "n2t",
      sample: null,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.front).toBe("Katze");
    expect(cards[0]?.isNew).toBe(true);
    const due = await buildSession({
      language: "es",
      listIds: [l.id],
      filter: "due",
      direction: "t2n",
      sample: null,
    });
    expect(due).toHaveLength(1); // new cards are due
  });
});
