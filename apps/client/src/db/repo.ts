import type {
  CardVariant,
  Grade,
  PartOfSpeech,
  PromptKind,
  ReviewEvent,
  SessionMode,
  StudyLanguage,
  UserSettings,
  VariantKind,
  WordList,
} from "@lm/schema";
import { applyReview, replayVariant, toLocalDay, updateProfile } from "@lm/srs";
import { ulid } from "@/lib/ulid";
import { db } from "./db";

const nowIso = () => new Date().toISOString();

/** Called after lectures and stories are finished; the client registers the notification reschedule here. */
export const learningEventHooks: Array<() => void> = [];
const onLearningEvent = () => {
  for (const h of learningEventHooks) h();
};

// ---------- settings ----------

export async function getSettings() {
  return db.settings.get("me");
}

export async function saveSettings(patch: Partial<UserSettings>) {
  const cur = await db.settings.get("me");
  if (!cur) throw new Error("no settings yet");
  await db.settings.put({ ...cur, ...patch });
}

export async function createSettings(
  input: Pick<UserSettings, "username" | "isOver16"> &
    Partial<Pick<UserSettings, "nativeLanguage" | "activeLanguage">>,
) {
  const now = nowIso();
  await db.settings.put({
    key: "me",
    username: input.username,
    avatar: "initials",
    nativeLanguage: input.nativeLanguage ?? "de",
    activeLanguage: input.activeLanguage ?? "es",
    isOver16: input.isOver16,
    consentVersion: 1,
    consentedAt: now,
    soundOn: true,
    hapticsOn: true,
    dailyNewCards: 10,
    learningDays: [1, 2, 3, 4, 5],
    vacationUntil: null,
    onboardingDone: false,
    tourDone: false,
    createdAt: now,
  });
}

// ---------- words / variants / lists ----------

export interface WordInput {
  language: StudyLanguage;
  lemma: string;
  translation: string;
  pos?: PartOfSpeech;
  dictionaryRef?: string;
}

/** Global entity resolution: one canonical word per (language, lemma). */
export async function ensureWord(input: WordInput) {
  const existing = await db.words
    .where("[language+lemma]")
    .equals([input.language, input.lemma])
    .first();
  if (existing) {
    if (existing.deletedAt)
      await db.words.update(existing.id, { deletedAt: null, updatedAt: nowIso() });
    return existing;
  }
  const now = nowIso();
  const word = {
    id: ulid(),
    language: input.language,
    lemma: input.lemma,
    translation: input.translation,
    pos: input.pos ?? "other",
    dictionaryRef: input.dictionaryRef,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.words.add(word);
  return word;
}

export async function ensureVariant(
  wordId: string,
  kind: VariantKind,
  front: string,
  back: string,
): Promise<CardVariant> {
  const existing = (await db.variants.where("wordId").equals(wordId).toArray()).find(
    (v) => v.kind === kind && v.front === front,
  );
  if (existing) return existing;
  const v: CardVariant = { id: ulid(), wordId, kind, front, back, createdAt: nowIso() };
  await db.variants.add(v);
  return v;
}

export async function createList(
  language: StudyLanguage,
  title: string,
  colour: WordList["colour"] = "sage",
  isSystem = false,
  description?: string,
) {
  const now = nowIso();
  const list: WordList = {
    id: ulid(),
    language,
    title,
    colour,
    isSystem,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    description,
  };
  await db.lists.add(list);
  return list;
}

export async function addToList(listId: string, wordId: string) {
  const exists = await db.listWords.get([listId, wordId]);
  if (exists) return;
  const count = await db.listWords.where("listId").equals(listId).count();
  await db.listWords.add({ listId, wordId, position: count, addedAt: nowIso() });
  await db.lists.update(listId, { updatedAt: nowIso() });
}

export async function removeFromList(listId: string, wordId: string) {
  await db.listWords.delete([listId, wordId]);
}

export async function softDeleteList(listId: string) {
  await db.lists.update(listId, { deletedAt: nowIso(), updatedAt: nowIso() });
}

export async function addSentence(
  wordId: string,
  text: string,
  translation: string,
  source: "story" | "dictionary" | "own",
  storyId?: string,
) {
  const existing = await db.sentences.where("wordId").equals(wordId).toArray();
  if (existing.length >= 5 || existing.some((s) => s.text === text)) return;
  await db.sentences.add({
    id: ulid(),
    wordId,
    position: existing.length + 1,
    text,
    translation,
    source,
    storyId,
  });
}

/** Add a dictionary word with chosen variants to a list, with up to 2 dictionary example sentences. */
export async function addDictionaryWord(
  entry: {
    id: string;
    language: StudyLanguage;
    lemma: string;
    pos: PartOfSpeech;
    glosses: { text: string }[];
    examples?: { text: string; translation: string }[];
  },
  variants: { kind: VariantKind; front: string; back: string }[],
  listId: string,
) {
  const translation = entry.glosses
    .map((g) => g.text)
    .slice(0, 2)
    .join(", ");
  const word = await ensureWord({
    language: entry.language,
    lemma: entry.lemma,
    translation,
    pos: entry.pos,
    dictionaryRef: entry.id,
  });
  for (const v of variants) await ensureVariant(word.id, v.kind, v.front, v.back);
  await addToList(listId, word.id);
  for (const ex of (entry.examples ?? []).slice(0, 2))
    await addSentence(word.id, ex.text, ex.translation, "dictionary");
  return word;
}

// ---------- reviews ----------

export interface ReviewInput {
  variantId: string;
  wordId: string;
  grade: Grade;
  reactionMs: number | null;
  mode: SessionMode;
  promptKind: PromptKind | null;
  manual: boolean;
}

/** Append an immutable review event and update the derived caches. */
export async function recordReview(input: ReviewInput): Promise<ReviewEvent> {
  const at = new Date();
  const event: ReviewEvent = {
    id: ulid(at.getTime()),
    variantId: input.variantId,
    wordId: input.wordId,
    grade: input.grade,
    reactionMs: input.reactionMs,
    mode: input.mode,
    promptKind: input.promptKind,
    reviewedAt: at.toISOString(),
    supersedes: null,
    manual: input.manual,
    synced: false,
  };
  await db.transaction("rw", [db.events, db.cardStates, db.profiles, db.activity], async () => {
    await db.events.add(event);
    const prev = (await db.cardStates.get(input.variantId)) ?? null;
    await db.cardStates.put(applyReview(prev, input.variantId, input.wordId, input.grade, at));
    if (!input.manual && input.promptKind && input.reactionMs !== null && input.grade < 4) {
      const p = await db.profiles.get([input.variantId, input.promptKind]);
      await db.profiles.put(updateProfile(p, input.variantId, input.promptKind, input.reactionMs));
    }
    await bumpActivity(toLocalDay(at), { reviews: 1 });
  });
  return event;
}

/** One-tap override: new event superseding the old one; state is replayed for that variant. */
export async function overrideReview(
  oldEventId: string,
  grade: Grade,
): Promise<ReviewEvent | null> {
  const old = await db.events.get(oldEventId);
  if (!old) return null;
  const event: ReviewEvent = {
    ...old,
    id: ulid(),
    grade,
    supersedes: old.id,
    manual: true,
    synced: false,
  };
  await db.transaction("rw", [db.events, db.cardStates, db.profiles], async () => {
    await db.events.add(event);
    const all = await db.events.where("variantId").equals(old.variantId).toArray();
    const state = replayVariant(all, old.variantId);
    if (state) await db.cardStates.put(state);
    if (old.promptKind) await rebuildProfile(old.variantId, old.promptKind, all);
  });
  return event;
}

async function rebuildProfile(variantId: string, promptKind: PromptKind, allEvents: ReviewEvent[]) {
  const superseded = new Set(
    allEvents.filter((e) => e.supersedes).map((e) => e.supersedes as string),
  );
  const live = allEvents
    .filter(
      (e) =>
        !superseded.has(e.id) &&
        !e.manual &&
        e.promptKind === promptKind &&
        e.reactionMs !== null &&
        e.grade < 4,
    )
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  let p: { variantId: string; promptKind: PromptKind; emaMs: number; n: number } | undefined;
  for (const e of live) p = updateProfile(p, variantId, promptKind, e.reactionMs as number);
  if (p) await db.profiles.put(p);
  else await db.profiles.delete([variantId, promptKind]);
}

// ---------- activity / streak ----------

export async function bumpActivity(
  day: string,
  delta: { reviews?: number; lecturesDone?: number; storiesRead?: number; minutes?: number },
) {
  const cur = (await db.activity.get(day)) ?? {
    day,
    reviews: 0,
    lecturesDone: 0,
    storiesRead: 0,
    minutes: 0,
  };
  await db.activity.put({
    day,
    reviews: cur.reviews + (delta.reviews ?? 0),
    lecturesDone: cur.lecturesDone + (delta.lecturesDone ?? 0),
    storiesRead: cur.storiesRead + (delta.storiesRead ?? 0),
    minutes: cur.minutes + (delta.minutes ?? 0),
  });
}

export async function addStreakLog(
  kind: "vacation" | "reactivation" | "learning_days_changed",
  from?: string,
  to?: string,
) {
  await db.streakLog.add({ id: ulid(), kind, from, to, at: nowIso() });
}

export async function markLectureDone(lectureId: string) {
  const existing = await db.lectureProgress.get(lectureId);
  if (existing) return;
  await db.lectureProgress.put({ lectureId, doneAt: nowIso() });
  await bumpActivity(toLocalDay(new Date()), { lecturesDone: 1, minutes: 3 });
  onLearningEvent();
}

export async function markStoryFinished(storyId: string) {
  const p = await db.storyProgress.get(storyId);
  if (p?.finishedAt) return;
  await db.storyProgress.put({
    storyId,
    position: p?.position ?? 0,
    finishedAt: nowIso(),
    tappedLemmas: p?.tappedLemmas ?? [],
    updatedAt: nowIso(),
  });
  await bumpActivity(toLocalDay(new Date()), { storiesRead: 1, minutes: 5 });
  onLearningEvent();
}

export async function wipeEverything() {
  await db.delete();
  await db.open();
}

export async function exportAll() {
  const tables = db.tables.map((tb) => tb.name);
  const out: Record<string, unknown[]> = {};
  for (const name of tables) out[name] = await db.table(name).toArray();
  return { exportedAt: nowIso(), version: 1, data: out };
}
