import type { DictionaryEntry, WordSentence } from "@lm/schema";
import { normaliseAnswer } from "@lm/srs";
import { BookOpenText, Plus, SpeakerHigh } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/db/db";
import { addToList, ensureVariant, ensureWord } from "@/db/repo";
import { getEntryByLemma } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { speak } from "@/lib/tts";
import { ListPicker } from "./ListPicker";
import { Button, Card, Sheet } from "./ui";
import { VariantPicker } from "./VariantPicker";

export interface VocabItem {
  text: string;
  /** Native translation when the text is not (or not only) a dictionary headword. */
  translation?: string;
}

/**
 * Generic word drawer for any Spanish text in a lecture: pronunciation, dictionary entry when
 * there is one (meanings, forms, examples), the learner's own sentences, and add-to-list.
 */
export function VocabSheet({ item, onClose }: { item: VocabItem | null; onClose: () => void }) {
  const navigate = useNavigate();
  const text = item?.text.trim() ?? "";
  const entry: DictionaryEntry | undefined = text ? getEntryByLemma(stripArticle(text)) : undefined;
  const word = useLiveQuery(async () => {
    if (!text) return undefined;
    const all = await db.words.where("language").equals("es").toArray();
    const keys = new Set([normaliseAnswer(text), ...(entry ? [normaliseAnswer(entry.lemma)] : [])]);
    return all.find((w) => !w.deletedAt && keys.has(normaliseAnswer(w.lemma)));
  }, [text, entry?.id]);
  const sentences =
    useLiveQuery(
      async () =>
        word
          ? (await db.sentences.where("wordId").equals(word.id).toArray()).sort(
              (a, b) => a.position - b.position,
            )
          : [],
      [word?.id],
    ) ?? [];
  const [pick, setPick] = useState(false);
  const [customList, setCustomList] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const saved = new Set(sentences.map((s) => s.text.trim()));
  const examples = (entry?.examples ?? []).filter((ex) => !saved.has(ex.text.trim()));
  const meanings = entry
    ? entry.glosses.map((g) => g.text)
    : item?.translation
      ? [item.translation]
      : [];

  async function addCustom() {
    if (!item || !customList) return;
    const w = await ensureWord({
      language: "es",
      lemma: text,
      translation: item.translation ?? "",
      pos: "other",
    });
    await ensureVariant(w.id, "custom", text, item.translation ?? "");
    await addToList(customList, w.id);
    play("add");
    setAddingCustom(false);
    setToast(t("dict.added"));
    setTimeout(() => setToast(null), 1500);
  }

  return (
    <>
      <Sheet open={item !== null && !pick} onClose={onClose} title={t("cards.word")}>
        {item && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-2xl font-extrabold">
                  {entry?.article && !/^(el|la|los|las)\s/i.test(text)
                    ? `${entry.article} ${entry.lemma}`
                    : text}
                </div>
                <div className="mt-0.5 text-sm text-ink-2">
                  {entry?.ipa && <span className="mr-2 font-mono">/{entry.ipa}/</span>}
                  {entry && (
                    <span className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs">{entry.pos}</span>
                  )}
                  {entry?.gender && (
                    <span className="ml-1 rounded-chip bg-rose-soft px-2 py-0.5 text-xs text-rose-deep">
                      {entry.gender === "m" ? "maskulin" : entry.gender === "f" ? "feminin" : "m/f"}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="rounded-full bg-sky-soft p-2.5 text-sky-deep"
                onClick={() => speak(text)}
                aria-label="Aussprache"
              >
                <SpeakerHigh size={20} />
              </button>
              <button
                type="button"
                className="rounded-full bg-sage-soft p-2.5 text-sage-deep"
                onClick={() => (entry ? setPick(true) : setAddingCustom(true))}
                aria-label={t("dict.addToList")}
              >
                <Plus size={20} weight="bold" />
              </button>
            </div>

            {meanings.length > 0 && (
              <Card>
                {meanings.map((m) => (
                  <div key={m} className="py-0.5 font-semibold">
                    {m}
                  </div>
                ))}
                {entry &&
                  item.translation &&
                  !entry.glosses.some((g) => g.text === item.translation) && (
                    <div className="mt-1 text-sm text-ink-2">Hier: {item.translation}</div>
                  )}
              </Card>
            )}

            {entry && (entry.plural || entry.genderPair) && (
              <Card className="grid gap-1 text-sm">
                {entry.plural && (
                  <div>
                    <span className="text-ink-3">{t("dict.variant.plural")}: </span>
                    <span className="font-semibold">{entry.plural}</span>
                  </div>
                )}
                {entry.genderPair && (
                  <div>
                    <span className="text-ink-3">{t("dict.variant.gender_pair")}: </span>
                    <span className="font-semibold">
                      {entry.genderPair[0]} / {entry.genderPair[1]}
                    </span>
                  </div>
                )}
              </Card>
            )}

            {examples.length > 0 && (
              <Section title={t("dict.examples")}>
                {examples.map((ex) => (
                  <SentenceRow key={ex.text} text={ex.text} translation={ex.translation} />
                ))}
              </Section>
            )}

            {sentences.length > 0 && (
              <Section title={t("cards.sentences")}>
                {sentences.map((s: WordSentence) => (
                  <SentenceRow key={s.id} text={s.text} translation={s.translation} />
                ))}
              </Section>
            )}

            {addingCustom && (
              <Card>
                <div className="mb-2 text-sm text-ink-2">
                  <b>{text}</b> · {item.translation ?? "–"}
                </div>
                <ListPicker value={customList} onChange={setCustomList} />
                <Button full className="mt-3" disabled={!customList} onClick={addCustom}>
                  {t("dict.addToList")}
                </Button>
              </Card>
            )}

            {(entry || word) && (
              <div className="flex gap-2 pt-1">
                {word && (
                  <button
                    type="button"
                    className="flex-1 rounded-chip bg-paper-2 px-3 py-2 text-sm font-medium"
                    onClick={() =>
                      navigate({ to: "/karteikarten/words/$wordId", params: { wordId: word.id } })
                    }
                  >
                    {t("cards.wordPage")}
                  </button>
                )}
                {entry && (
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-center gap-1 rounded-chip bg-sky-soft px-3 py-2 text-sm font-medium text-sky-deep"
                    onClick={() =>
                      navigate({ to: "/dictionary/$entryId", params: { entryId: entry.id } })
                    }
                  >
                    <BookOpenText size={16} /> {t("cards.inDictionary")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {toast && (
          <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper animate-pop">
            {toast}
          </div>
        )}
      </Sheet>
      <VariantPicker
        entry={pick && entry ? entry : null}
        open={pick}
        onClose={() => setPick(false)}
      />
    </>
  );
}

/** "el perro" → "perro" so the dictionary lookup finds the headword. */
function stripArticle(text: string): string {
  return (
    text
      .replace(/^(el|la|los|las|un|una)\s+/i, "")
      .replace(/[¿?¡!.,]/g, "")
      .trim() || text
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SentenceRow({ text, translation }: { text: string; translation: string }) {
  return (
    <div className="flex items-start gap-2 rounded-card bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{text}</div>
        <div className="text-sm text-ink-2">{translation}</div>
      </div>
      <button
        type="button"
        className="rounded-full bg-sky-soft p-2 text-sky-deep"
        onClick={() => speak(text)}
        aria-label="Satz anhören"
      >
        <SpeakerHigh size={16} />
      </button>
    </div>
  );
}
