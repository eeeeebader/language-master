import type { GrammarSpan, StorySentence, StoryToken } from "@lm/schema";
import { normaliseAnswer, toLocalDay } from "@lm/srs";
import { ArrowLeft, Plus, SpeakerHigh } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { ListPicker } from "@/components/ListPicker";
import { Button, Card, Chip, cx, Page, ProgressBar, Sheet } from "@/components/ui";
import { VariantPicker } from "@/components/VariantPicker";
import { db } from "@/db/db";
import {
  addSentence,
  addToList,
  bumpActivity,
  ensureVariant,
  ensureWord,
  markStoryFinished,
} from "@/db/repo";
import { computeCoverage, storyLemmas } from "@/lib/coverage";
import { getEntryByLemma, searchDictionary } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { track } from "@/lib/telemetry";
import { speak } from "@/lib/tts";

export const Route = createFileRoute("/stories/$storyId")({ component: Reader });

interface Selection {
  sentence: StorySentence;
  index: number;
  token: StoryToken;
  spans: GrammarSpan[];
}

function Reader() {
  const { storyId } = Route.useParams();
  const story = useLiveQuery(() => db.stories.get(storyId), [storyId]);
  const progress = useLiveQuery(() => db.storyProgress.get(storyId), [storyId]);
  const words = useLiveQuery(() => db.words.toArray(), []) ?? [];
  const states = useLiveQuery(() => db.cardStates.toArray(), []) ?? [];
  const navigate = useNavigate();
  const [sel, setSel] = useState<Selection | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [listId, setListId] = useState<string | null>(null);
  const [pickEntry, setPickEntry] = useState<ReturnType<typeof getEntryByLemma> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Reading time counts towards the daily minutes (flushed every minute and on leave).
  useEffect(() => {
    let since = performance.now();
    const flush = () => {
      const ms = performance.now() - since;
      since = performance.now();
      if (ms > 5_000)
        bumpActivity(toLocalDay(new Date()), { minutes: Math.round((ms / 60_000) * 10) / 10 });
    };
    const iv = setInterval(flush, 60_000);
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else since = performance.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      flush();
    };
  }, []);

  const knownLemmas = useMemo(
    () => new Set(words.filter((w) => !w.deletedAt).map((w) => normaliseAnswer(w.lemma))),
    [words],
  );
  const coverage = useMemo(
    () => (story ? computeCoverage(story, words, states) : null),
    [story, words, states],
  );
  const counts = useMemo(() => (story ? storyLemmas(story) : new Map<string, number>()), [story]);

  useEffect(() => {
    if (!story) return;
    if (!progress)
      db.storyProgress.put({
        storyId,
        position: 0,
        finishedAt: null,
        tappedLemmas: [],
        updatedAt: new Date().toISOString(),
      });
  }, [story, progress, storyId]);

  if (!story) return <Page>…</Page>;

  const spansBySentence = new Map<string, GrammarSpan[]>();
  for (const sp of story.spans)
    spansBySentence.set(sp.sentenceId, [...(spansBySentence.get(sp.sentenceId) ?? []), sp]);
  const sentenceById = new Map<string, StorySentence>();
  for (const p of story.paragraphs) for (const s of p) sentenceById.set(s.id, s);

  function tap(sentence: StorySentence, index: number) {
    const token = sentence.tokens[index];
    if (!token?.isWord) return;
    const spans = (spansBySentence.get(sentence.id) ?? []).filter(
      (sp) => index >= sp.from && index < sp.to,
    );
    setSel({ sentence, index, token, spans });
    speak(token.text);
    play("tap");
    if (progress && !progress.tappedLemmas.includes(token.lemma))
      db.storyProgress.update(storyId, {
        tappedLemmas: [...progress.tappedLemmas, token.lemma],
        updatedAt: new Date().toISOString(),
      });
  }

  /** Gloss for a token the annotator left empty: best dictionary hit for the surface/lemma. */
  function fallbackGloss(lemma: string, surface?: string): string {
    for (const q of [lemma, surface ?? ""]) {
      if (!q) continue;
      const hit = searchDictionary(q, 3).find((e) => e.glosses.length > 0);
      if (hit)
        return hit.glosses
          .map((g) => g.text)
          .slice(0, 2)
          .join(", ");
    }
    return "";
  }

  async function addFromDrawer() {
    if (!sel) return;
    const entry = getEntryByLemma(sel.token.lemma);
    if (entry) {
      setPickEntry(entry);
      return;
    }
    // Not in the dictionary: custom word with the contextual gloss.
    if (!listId) return;
    const gloss = sel.token.gloss || fallbackGloss(sel.token.lemma, sel.token.text);
    const w = await ensureWord({
      language: "es",
      lemma: sel.token.lemma,
      translation: gloss,
      pos: sel.token.pos,
    });
    await ensureVariant(w.id, "custom", sel.token.lemma, gloss);
    await addToList(listId, w.id);
    await addSentence(
      w.id,
      sentenceText(sel.sentence),
      sel.sentence.translation,
      "story",
      story?.id,
    );
    play("add");
    flash(t("dict.added"));
  }

  async function afterPicker(added: boolean) {
    if (added && sel) {
      const w = await db.words.where("[language+lemma]").equals(["es", sel.token.lemma]).first();
      if (w)
        await addSentence(
          w.id,
          sentenceText(sel.sentence),
          sel.sentence.translation,
          "story",
          story?.id,
        );
      flash(t("dict.added"));
    }
    setPickEntry(null);
  }

  async function finish() {
    await markStoryFinished(storyId);
    track("story_read", { source: story?.source ?? "official" });
    play("done");
    setShowSummary(true);
  }

  async function addSelected() {
    if (!listId) return;
    for (const lemma of picked) {
      const e = getEntryByLemma(lemma);
      const sentence = findSentence(lemma);
      if (e) {
        const gloss = e.glosses
          .map((g) => g.text)
          .slice(0, 2)
          .join(", ");
        const w = await ensureWord({
          language: "es",
          lemma: e.lemma,
          translation: gloss,
          pos: e.pos,
          dictionaryRef: e.id,
        });
        await ensureVariant(
          w.id,
          e.article && e.pos === "noun" ? "article" : "lemma",
          e.article && e.pos === "noun" ? `${e.article} ${e.lemma}` : e.lemma,
          gloss,
        );
        await addToList(listId, w.id);
        if (sentence)
          await addSentence(w.id, sentenceText(sentence), sentence.translation, "story", story?.id);
      } else {
        const tok = findToken(lemma);
        const gloss = tok?.gloss || fallbackGloss(lemma, tok?.text);
        const w = await ensureWord({
          language: "es",
          lemma,
          translation: gloss,
          pos: tok?.pos ?? "other",
        });
        await ensureVariant(w.id, "custom", lemma, gloss);
        await addToList(listId, w.id);
        if (sentence)
          await addSentence(w.id, sentenceText(sentence), sentence.translation, "story", story?.id);
      }
    }
    play("add");
    flash(t("dict.added"));
    setPicked(new Set());
  }

  function findSentence(lemma: string) {
    for (const p of story?.paragraphs ?? [])
      for (const s of p) if (s.tokens.some((tk) => tk.lemma === lemma)) return s;
    return null;
  }
  function findToken(lemma: string) {
    for (const p of story?.paragraphs ?? [])
      for (const s of p) for (const tk of s.tokens) if (tk.lemma === lemma) return tk;
    return null;
  }
  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }

  async function testVocab() {
    if (!listId) return;
    await addSelected();
    navigate({
      to: "/karteikarten/session",
      search: {
        mode: "progressive",
        lists: listId,
        filter: "all",
        direction: "t2n",
        sample: 0,
        onboarding: 0,
      },
    });
  }

  const vocab = [...counts.entries()]
    .filter(([l]) => !/^[A-ZÁÉÍÓÚÑ]/.test(l))
    .sort((a, b) => b[1] - a[1]);
  const refSentence = sel?.spans.find((sp) => sp.refSentenceId);

  return (
    <Page
      title={story.title}
      back={
        <Link to="/stories" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      {coverage && (
        <div className="mb-4">
          <ProgressBar
            parts={[
              { value: coverage.known, colour: "sage" },
              { value: coverage.learning, colour: "sky" },
              { value: coverage.struggling, colour: "amber" },
              { value: coverage.new, colour: "line" },
            ]}
          />
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
            <span>
              ● {coverage.known} {t("stories.known")}
            </span>
            <span>
              ● {coverage.learning} {t("stories.learning")}
            </span>
            <span>
              ● {coverage.struggling} {t("stories.struggling")}
            </span>
            <span>
              ○ {coverage.new} {t("stories.newWords")}
            </span>
          </div>
        </div>
      )}

      <article className="space-y-5 text-[19px] leading-[1.9]">
        {story.paragraphs.map((p, pi) => (
          <p key={`p${pi}`}>
            {p.map((s) => {
              const spans = spansBySentence.get(s.id) ?? [];
              return (
                <span key={s.id} className="group">
                  {s.tokens.map((tk, i) => {
                    const span = spans.find((sp) => i >= sp.from && i < sp.to);
                    const known = knownLemmas.has(normaliseAnswer(tk.lemma));
                    const active = sel?.sentence.id === s.id && sel.index === i;
                    return (
                      <span key={`${s.id}-${i}`}>
                        <span
                          onClick={() => tap(s, i)}
                          className={cx(
                            tk.isWord && "cursor-pointer rounded px-0.5 transition-colors",
                            span && `grammar-${span.colour}`,
                            tk.isWord &&
                              !known &&
                              !span &&
                              tk.pos !== "other" &&
                              !/^[A-ZÁÉÍÓÚÑ]/.test(tk.lemma) &&
                              "underline decoration-dotted decoration-ink-3 underline-offset-4",
                            active && "bg-ink text-paper",
                          )}
                        >
                          {tk.text}
                        </span>
                        {tk.ws}
                      </span>
                    );
                  })}
                  <button
                    type="button"
                    aria-label="Satz anhören"
                    onClick={() => speak(sentenceText(s))}
                    className="mx-1 inline-flex h-6 w-6 translate-y-0.5 items-center justify-center rounded-full bg-sky-soft text-sky-deep align-baseline"
                  >
                    <SpeakerHigh size={13} />
                  </button>{" "}
                </span>
              );
            })}
          </p>
        ))}
      </article>

      <div className="mt-8">
        {progress?.finishedAt ? (
          <Button full variant="secondary" onClick={() => setShowSummary(true)}>
            {t("stories.vocab")}
          </Button>
        ) : (
          <Button full size="lg" onClick={finish}>
            {t("stories.finished")}
          </Button>
        )}
      </div>

      <Sheet open={!!sel} onClose={() => setSel(null)}>
        {sel && (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-extrabold">
                  {sel.token.text}{" "}
                  <button
                    type="button"
                    className="text-sky-deep"
                    onClick={() => speak(sel.token.text)}
                  >
                    <SpeakerHigh size={20} className="inline" />
                  </button>
                </div>
                {sel.token.lemma !== sel.token.text && (
                  <div className="text-sm text-ink-3">Grundform: {sel.token.lemma}</div>
                )}
              </div>
              <Button size="sm" onClick={addFromDrawer}>
                <Plus size={14} /> {t("reader.addWord")}
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Card className="p-3">
                <div className="text-xs uppercase tracking-wide text-ink-3">
                  {t("reader.contextual")}
                </div>
                <div className="font-semibold">
                  {sel.token.gloss ?? getEntryByLemma(sel.token.lemma)?.glosses[0]?.text ?? "–"}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs uppercase tracking-wide text-ink-3">
                  {t("reader.literal")}
                </div>
                <div className="font-semibold">
                  {getEntryByLemma(sel.token.lemma)
                    ?.glosses.map((g) => g.text)
                    .join(", ") ?? "–"}
                </div>
              </Card>
            </div>
            {sel.spans.length > 0 && (
              <div className="mt-3 space-y-2">
                {sel.spans.map((sp) => (
                  <div key={sp.id} className={cx("rounded-card p-3", `grammar-${sp.colour}`)}>
                    <div className="font-bold">{sp.title}</div>
                    <div className="text-sm">{sp.note}</div>
                  </div>
                ))}
              </div>
            )}
            {refSentence?.refSentenceId && (
              <div className="mt-3 rounded-card bg-paper-2 p-3 text-sm">
                <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">Bezug</div>
                {sentenceById.get(refSentence.refSentenceId)?.tokens.map((tk, i) => (
                  <span
                    key={`ref-${i}`}
                    className={cx(
                      refSentence.refFrom !== undefined &&
                        refSentence.refTo !== undefined &&
                        i >= refSentence.refFrom &&
                        i < refSentence.refTo &&
                        `grammar-${refSentence.colour} rounded px-0.5 font-semibold`,
                    )}
                  >
                    {tk.text}
                    {tk.ws}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 rounded-card border border-line p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-ink-3">
                {t("reader.sentence")}
              </div>
              <div className="font-medium">{sentenceText(sel.sentence)}</div>
              <div className="text-ink-2">{sel.sentence.translation}</div>
            </div>
            {!getEntryByLemma(sel.token.lemma) && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-ink-3">{t("dict.chooseList")}</div>
                <ListPicker value={listId} onChange={setListId} />
              </div>
            )}
          </div>
        )}
      </Sheet>

      <VariantPicker entry={pickEntry ?? null} open={!!pickEntry} onClose={afterPicker} />

      <Sheet open={showSummary} onClose={() => setShowSummary(false)} title={t("stories.vocab")}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {vocab.map(([lemma, n]) => {
            const known = knownLemmas.has(normaliseAnswer(lemma));
            const on = picked.has(lemma);
            return (
              <Chip
                key={lemma}
                active={on}
                tone={known ? "sage" : "amber"}
                onClick={() => {
                  const s = new Set(picked);
                  on ? s.delete(lemma) : s.add(lemma);
                  setPicked(s);
                }}
              >
                {lemma} <span className="opacity-60">×{n}</span>
              </Chip>
            );
          })}
        </div>
        <p className="mb-2 text-xs text-ink-3">
          Gelb = neu für dich, grün = schon in deinen Listen.
        </p>
        <ListPicker value={listId} onChange={setListId} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={!listId || picked.size === 0} onClick={addSelected}>
            {t("stories.addSelected")}
          </Button>
          <Button disabled={!listId || picked.size === 0} onClick={testVocab}>
            {t("stories.test")}
          </Button>
        </div>
      </Sheet>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper animate-pop">
          {toast}
        </div>
      )}
    </Page>
  );
}

function sentenceText(s: StorySentence) {
  return s.tokens
    .map((tk) => tk.text + tk.ws)
    .join("")
    .trim();
}
