import type { WordSentence } from "@lm/schema";
import { ArrowLeft, BookOpenText, Plus, SpeakerHigh, Trash } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button, Card, Chip, Page, Sheet } from "@/components/ui";
import { db } from "@/db/db";
import { addSentence, removeFromList, removeSentence } from "@/db/repo";
import { getEntry, getEntryByLemma } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { RATING_TONE, rateWord } from "@/lib/rating";
import { speak } from "@/lib/tts";

export const Route = createFileRoute("/karteikarten/words/$wordId")({ component: WordDetail });

function WordDetail() {
  const { wordId } = Route.useParams();
  const navigate = useNavigate();
  const word = useLiveQuery(() => db.words.get(wordId), [wordId]);
  const variants =
    useLiveQuery(() => db.variants.where("wordId").equals(wordId).toArray(), [wordId]) ?? [];
  const sentences =
    useLiveQuery(
      async () =>
        (await db.sentences.where("wordId").equals(wordId).toArray()).sort(
          (a, b) => a.position - b.position,
        ),
      [wordId],
    ) ?? [];
  const states =
    useLiveQuery(async () => {
      const vs = await db.variants.where("wordId").equals(wordId).toArray();
      return (await db.cardStates.bulkGet(vs.map((v) => v.id))).filter((s) => !!s);
    }, [wordId]) ?? [];
  const lists =
    useLiveQuery(async () => {
      const lw = await db.listWords.where("wordId").equals(wordId).toArray();
      return (await db.lists.bulkGet(lw.map((x) => x.listId))).filter((l) => !!l && !l.deletedAt);
    }, [wordId]) ?? [];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("");

  if (!word) return <Page>…</Page>;
  const entry =
    (word.dictionaryRef ? getEntry(word.dictionaryRef) : undefined) ?? getEntryByLemma(word.lemma);
  const { rating, retention } = rateWord(states);

  async function saveSentence() {
    if (!text.trim() || !translation.trim()) return;
    await addSentence(wordId, text.trim(), translation.trim(), "own");
    setText("");
    setTranslation("");
    setAdding(false);
  }

  return (
    <Page
      title={word.lemma}
      back={
        <button
          type="button"
          onClick={() => history.back()}
          className="rounded-full p-2 hover:bg-paper-2"
        >
          <ArrowLeft size={22} />
        </button>
      }
      action={
        <button
          type="button"
          className="rounded-full bg-sky-soft p-2 text-sky-deep"
          onClick={() => speak(word.lemma)}
          aria-label="Aussprache"
        >
          <SpeakerHigh size={20} />
        </button>
      }
    >
      <Card className="mb-3">
        <div className="text-xl font-semibold">{word.translation}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-2">{t("cards.rating")}:</span>
          <Chip tone={RATING_TONE[rating]}>
            {t(`cards.rating.${rating}` as "cards.rating.new")}
          </Chip>
          {retention !== null && (
            <span className="text-sm text-ink-3">{Math.round(retention * 100)} % Erinnerung</span>
          )}
          <span className="text-sm text-ink-3">
            · {states.reduce((a, s) => a + s.reps, 0)} Wiederholungen
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {variants.map((v) => (
            <span key={v.id} className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs text-ink-2">
              {v.front} → {v.back}
            </span>
          ))}
        </div>
      </Card>

      {entry && (
        <Card
          className="mb-3"
          onClick={() => navigate({ to: "/dictionary/$entryId", params: { entryId: entry.id } })}
        >
          <div className="flex items-center gap-3">
            <BookOpenText size={22} className="text-sky-deep" />
            <div className="flex-1">
              <div className="font-bold">{t("cards.inDictionary")}</div>
              <div className="text-sm text-ink-2">
                {entry.article ? `${entry.article} ` : ""}
                {entry.lemma}
                {entry.ipa ? ` · /${entry.ipa}/` : ""} ·{" "}
                {entry.glosses.map((g) => g.text).join(", ")}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-bold">{t("cards.sentences")}</div>
          {sentences.length < 5 && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={14} /> {t("cards.addSentence")}
            </Button>
          )}
        </div>
        {sentences.length === 0 && (
          <p className="text-sm text-ink-3">
            Noch keine Sätze. Füge aus einer Geschichte, dem Wörterbuch oder selbst welche hinzu.
          </p>
        )}
        <div className="space-y-2">
          {sentences.map((s: WordSentence) => (
            <div key={s.id} className="rounded-card bg-paper-2 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-semibold">{s.text}</div>
                  <div className="text-sm text-ink-2">{s.translation}</div>
                  <div className="mt-1 text-xs text-ink-3">
                    {s.source === "story"
                      ? "aus Geschichte"
                      : s.source === "dictionary"
                        ? "Wörterbuch"
                        : "eigener Satz"}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-sky-deep"
                  onClick={() => speak(s.text)}
                  aria-label="Aussprache"
                >
                  <SpeakerHigh size={16} />
                </button>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-ink-3"
                  onClick={() => removeSentence(s.id)}
                  aria-label="Löschen"
                >
                  <Trash size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-3">
        <div className="mb-2 font-bold">{t("cards.lists")}</div>
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <Chip key={l?.id} tone={l?.colour}>
              {l?.title}
              <button
                type="button"
                className="ml-1 text-ink-3"
                onClick={() => l && removeFromList(l.id, wordId)}
                aria-label={t("cards.removeFromList")}
              >
                ×
              </button>
            </Chip>
          ))}
        </div>
      </Card>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t("cards.addSentence")}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("cards.sentence.text")}
          autoCapitalize="off"
          className="mb-2 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <input
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          placeholder={t("cards.sentence.translation")}
          className="mb-4 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <Button full disabled={!text.trim() || !translation.trim()} onClick={saveSentence}>
          {t("common.save")}
        </Button>
      </Sheet>
    </Page>
  );
}
