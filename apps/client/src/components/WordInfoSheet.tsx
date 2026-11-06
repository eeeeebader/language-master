import type { DictionaryEntry, UserWord, WordSentence } from "@lm/schema";
import { BookOpenText, SpeakerHigh } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Sheet } from "@/components/ui";
import { db } from "@/db/db";
import { getEntry, getEntryByLemma } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { speak } from "@/lib/tts";

/**
 * Bottom drawer with everything about one word: the dictionary entry (meanings, forms,
 * examples) and the learner's own sentences, each with pronunciation. Used from the session
 * overview and summary, where the rows themselves stay one line.
 */
export function WordInfoSheet({ wordId, onClose }: { wordId: string | null; onClose: () => void }) {
  const navigate = useNavigate();
  const word = useLiveQuery(() => (wordId ? db.words.get(wordId) : undefined), [wordId]);
  const sentences =
    useLiveQuery(
      async () =>
        wordId
          ? (await db.sentences.where("wordId").equals(wordId).toArray()).sort(
              (a, b) => a.position - b.position,
            )
          : [],
      [wordId],
    ) ?? [];
  const entry: DictionaryEntry | undefined = word
    ? ((word.dictionaryRef ? getEntry(word.dictionaryRef) : undefined) ??
      getEntryByLemma(word.lemma))
    : undefined;

  // Dictionary examples the learner already saved as sentences are shown once, under sentences.
  const saved = new Set(sentences.map((s) => s.text.trim()));
  const examples = (entry?.examples ?? []).filter((ex) => !saved.has(ex.text.trim()));

  return (
    <Sheet open={wordId !== null} onClose={onClose} title={t("cards.word")}>
      {word && (
        <div className="space-y-3">
          <Head word={word} entry={entry} />

          <Card>
            {entry ? (
              entry.glosses.map((g) => (
                <div key={g.text} className="py-0.5">
                  <span className="font-semibold">{g.text}</span>
                  {g.note && <span className="ml-2 text-sm text-ink-2">({g.note})</span>}
                </div>
              ))
            ) : (
              <div className="font-semibold">
                {word.translation || t("cards.translation.missing")}
              </div>
            )}
          </Card>

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

          {entry && examples.length > 0 && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">
                {t("dict.examples")}
              </div>
              <div className="space-y-2">
                {examples.map((ex) => (
                  <SentenceRow key={ex.text} text={ex.text} translation={ex.translation} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">
              {t("cards.sentences")}
            </div>
            {sentences.length === 0 ? (
              <p className="text-sm text-ink-2">Noch keine Sätze zu diesem Wort.</p>
            ) : (
              <div className="space-y-2">
                {sentences.map((s: WordSentence) => (
                  <SentenceRow
                    key={s.id}
                    text={s.text}
                    translation={s.translation}
                    note={
                      s.source === "story"
                        ? "aus Geschichte"
                        : s.source === "dictionary"
                          ? "Wörterbuch"
                          : "eigener Satz"
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="flex-1 rounded-chip bg-paper-2 px-3 py-2 text-sm font-medium"
              onClick={() =>
                navigate({ to: "/karteikarten/words/$wordId", params: { wordId: word.id } })
              }
            >
              {t("cards.wordPage")}
            </button>
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
        </div>
      )}
    </Sheet>
  );
}

function Head({ word, entry }: { word: UserWord; entry?: DictionaryEntry }) {
  const headword = entry?.article ? `${entry.article} ${entry.lemma}` : word.lemma;
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-extrabold">{headword}</div>
        <div className="mt-0.5 text-sm text-ink-2">
          {entry?.ipa && <span className="mr-2 font-mono">/{entry.ipa}/</span>}
          <span className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs">
            {entry?.pos ?? word.pos}
          </span>
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
        onClick={() => speak(headword)}
        aria-label="Aussprache"
      >
        <SpeakerHigh size={20} />
      </button>
    </div>
  );
}

function SentenceRow({
  text,
  translation,
  note,
}: {
  text: string;
  translation: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-card bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{text}</div>
        <div className="text-sm text-ink-2">{translation}</div>
        {note && <div className="mt-0.5 text-xs text-ink-3">{note}</div>}
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
