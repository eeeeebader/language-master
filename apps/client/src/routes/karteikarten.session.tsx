import type { Grade, PromptKind, SessionMode, WordSentence } from "@lm/schema";
import {
  answersMatch,
  calibrateBase,
  createSession,
  inferGrade,
  isFinished,
  pickDistractors,
  answer as planAnswer,
  skip as planSkip,
  regradeLast,
  remaining,
  type SessionCard,
  type SessionState,
  shuffle,
  summarise,
  toLocalDay,
} from "@lm/srs";
import { ChatCircleText, X } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Confetti } from "@/components/Confetti";
import { FlipCard } from "@/components/FlipCard";
import { GradeChips } from "@/components/GradeChips";
import { Button, Card, cx, Page, Sheet } from "@/components/ui";
import { db } from "@/db/db";
import { bumpActivity, getSettings, overrideReview, recordReview } from "@/db/repo";
import * as haptics from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { maybeAskPermission, rescheduleNotifications } from "@/lib/notifications";
import { buildSession, type Direction, newCardsSeenToday } from "@/lib/session-builder";
import { play } from "@/lib/sound";

const Search = z.object({
  mode: z.enum(["classic", "reaction", "progressive", "forever"]).default("reaction"),
  lists: z.string().default(""),
  filter: z.enum(["all", "due", "failed", "new"]).default("all"),
  direction: z.enum(["t2n", "n2t"]).default("t2n"),
  sample: z.coerce.number().default(0),
  onboarding: z.coerce.number().default(0),
});

export const Route = createFileRoute("/karteikarten/session")({
  component: Session,
  validateSearch: Search,
});

interface Pool {
  id: string;
  pos: SessionCard["pos"];
  back: string;
}

type Stage = "loading" | "empty" | "front" | "revealed" | "result" | "done";

function Session() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [state, setState] = useState<SessionState | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [pool, setPool] = useState<Pool[]>([]);
  const [baseMs, setBaseMs] = useState(1500);
  const [typed, setTyped] = useState("");
  const [choices, setChoices] = useState<Pool[]>([]);
  const [lastGrade, setLastGrade] = useState<Grade | null>(null);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [lastCard, setLastCard] = useState<SessionCard | null>(null);
  const [sentences, setSentences] = useState<WordSentence[] | null>(null);
  const [newLimitLeft, setNewLimitLeft] = useState(0);
  const shownAt = useRef(0);
  const reactionRef = useRef<number | null>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mode: SessionMode = search.mode;
  const direction: Direction = search.direction;

  const current = state?.current ? state.cards[state.current] : undefined;
  const phase = current && state ? state.phase[current.variantId] : undefined;
  const useChoice = mode === "progressive" && phase === "choice";
  const useTyping = mode === "progressive" && phase === "typing";
  const promptKind: PromptKind = useChoice
    ? "choice"
    : direction === "t2n"
      ? "target_to_native"
      : "native_to_target";

  // Build the session once from the initial search params.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      const listIds = search.lists ? search.lists.split(",").filter(Boolean) : [];
      let forever: { newLimit: number } | undefined;
      if (mode === "forever") {
        const seen = await newCardsSeenToday();
        const limit = Math.max(0, (settings?.dailyNewCards ?? 10) - seen);
        forever = { newLimit: limit };
        setNewLimitLeft(limit);
      }
      const cards = await buildSession({
        language: "es",
        listIds,
        filter: search.filter,
        direction,
        sample: search.sample || null,
        forever,
      });
      const allVariants = await db.variants.toArray();
      const words = new Map((await db.words.toArray()).map((w) => [w.id, w]));
      setPool(
        allVariants.map((v) => ({
          id: v.id,
          pos: words.get(v.wordId)?.pos ?? "other",
          back: direction === "t2n" ? v.back : v.front,
        })),
      );
      const recent = await db.events.orderBy("reviewedAt").reverse().limit(50).toArray();
      setBaseMs(
        calibrateBase(
          recent
            .filter((e) => e.reactionMs && e.grade < 4 && !e.manual)
            .map((e) => ({ reactionMs: e.reactionMs as number, answerLength: 6 })),
        ),
      );
      if (cards.length === 0) {
        setStage("empty");
        return;
      }
      setState(createSession(cards, { mode }, Date.now()));
      setStage("front");
    })();
  }, []);

  // Start the timer whenever a new card is shown.
  useEffect(() => {
    if (stage === "front" && current) {
      shownAt.current = performance.now();
      reactionRef.current = null;
      setTyped("");
      if (useChoice) {
        const target: Pool = { id: current.variantId, pos: current.pos, back: current.back };
        const d = pickDistractors(target, pool, 3);
        setChoices(shuffle([target, ...d]));
      }
    }
  }, [stage, current, useChoice, pool]);

  const finish = useCallback(async (s: SessionState) => {
    setStage("done");
    play("done");
    haptics.success();
    const sum = summarise(s, Date.now());
    await bumpActivity(toLocalDay(new Date()), {
      minutes: Math.round((sum.durationMs / 60_000) * 10) / 10,
    });
  }, []);

  const commit = useCallback(
    async (grade: Grade, reactionMs: number | null, manual: boolean, correct: boolean | null) => {
      if (!state || !current) return;
      const ev = await recordReview({
        variantId: current.variantId,
        wordId: current.wordId,
        grade,
        reactionMs,
        mode,
        promptKind: manual ? null : promptKind,
        manual,
      });
      setLastEventId(ev.id);
      setLastGrade(grade);
      setLastCorrect(correct);
      setLastCard(current);
      const next = planAnswer(state, grade, Date.now());
      setState(next);
      if (grade <= 2) play(grade === 1 ? "easy" : "correct");
      else play("error");
      if (grade === 4) haptics.warn();
      else haptics.tap();
      if (manual && mode === "classic") {
        if (isFinished(next)) finish(next);
        else setStage("front");
        return;
      }
      setStage("result");
      autoRef.current = setTimeout(() => proceed(next), 1600);
    },
    // biome-ignore lint/correctness/useExhaustiveDependencies: proceed/finish are stable closures over state
    [state, current, mode, promptKind, proceed, finish],
  );

  function proceed(s: SessionState | null = state) {
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = null;
    if (!s) return;
    if (isFinished(s)) finish(s);
    else setStage("front");
  }

  async function override(g: Grade) {
    if (!state || !lastEventId || g === lastGrade) return;
    if (autoRef.current) clearTimeout(autoRef.current);
    autoRef.current = null;
    await overrideReview(lastEventId, g);
    const next = regradeLast(state, g, Date.now());
    setState(next);
    setLastGrade(g);
    play("tap");
  }

  function reveal() {
    reactionRef.current = performance.now() - shownAt.current;
    play("flip");
    setStage("revealed");
  }

  async function confirm(correct: boolean) {
    if (!current) return;
    const ms = Math.round(reactionRef.current ?? performance.now() - shownAt.current);
    const profile = await db.profiles.get([current.variantId, promptKind]);
    const grade = inferGrade({
      reactionMs: ms,
      correct,
      answerLength: current.back.length,
      profile,
      baseMs,
    });
    commit(grade, ms, false, correct);
  }

  async function choose(c: Pool) {
    if (!current) return;
    const ms = Math.round(performance.now() - shownAt.current);
    const correct = c.id === current.variantId;
    const profile = await db.profiles.get([current.variantId, "choice"]);
    const grade = inferGrade({
      reactionMs: ms,
      correct,
      answerLength: current.back.length,
      profile,
      baseMs,
    });
    commit(grade, ms, false, correct);
  }

  async function checkTyped() {
    if (!current) return;
    const ms = Math.round(performance.now() - shownAt.current);
    const correct = answersMatch(typed, current.back);
    const profile = await db.profiles.get([current.variantId, promptKind]);
    const grade = inferGrade({
      reactionMs: ms,
      correct,
      answerLength: current.back.length,
      profile,
      baseMs,
    });
    commit(grade, ms, false, correct);
  }

  async function openSentences() {
    if (!current) return;
    setSentences(await db.sentences.where("wordId").equals(current.wordId).toArray());
  }

  function doSkip() {
    if (!state) return;
    const next = planSkip(state, Date.now());
    setState(next);
    if (isFinished(next)) finish(next);
  }

  async function addMoreNew() {
    if (!state) return;
    const have = new Set(Object.keys(state.cards));
    const more = (
      await buildSession({
        language: "es",
        listIds: [],
        filter: "new",
        direction,
        sample: null,
        forever: { newLimit: 10 + have.size },
      })
    )
      .filter((c) => !have.has(c.variantId))
      .slice(0, 10);
    if (more.length === 0) return;
    const cards = [...Object.values(state.cards), ...more];
    setState(
      createSession(
        more.length
          ? cards.filter(
              (c) => !state.cleared.includes(c.variantId) && !state.skipped.includes(c.variantId),
            )
          : cards,
        { mode },
        Date.now(),
      ),
    );
    setNewLimitLeft(0);
    setStage("front");
  }

  const summary = useMemo(() => (state ? summarise(state, Date.now()) : null), [state]);

  function close() {
    if (search.onboarding) navigate({ to: "/tour" });
    else navigate({ to: "/karteikarten" });
  }

  // ---------- render ----------

  if (stage === "loading") return <Page>…</Page>;

  if (stage === "empty") {
    return (
      <Page title={t("cards.title")}>
        <Card className="text-center">
          <p className="mb-4 text-ink-2">{t("cards.empty")}</p>
          <Button onClick={close}>{t("common.back")}</Button>
        </Card>
      </Page>
    );
  }

  if (stage === "done" && state && summary) {
    const skippedCards = summary.skipped
      .map((id) => state.cards[id])
      .filter((c): c is SessionCard => !!c);
    return (
      <Page>
        <Confetti />
        <div className="mx-auto mt-10 max-w-md text-center">
          <h1 className="text-3xl font-extrabold">{t("session.summary")}</h1>
          <p className="mt-2 text-xl text-ink-2">{t("session.cleared", { n: summary.cleared })}</p>
          <div className="mt-6 grid grid-cols-4 gap-2">
            {([1, 2, 3, 4] as Grade[]).map((g) => (
              <Card
                key={g}
                className="border-transparent"
                tone={g === 1 ? "sage" : g === 2 ? "sky" : g === 3 ? "amber" : "rose"}
              >
                <div className="text-2xl font-extrabold">{summary.byGrade[g]}</div>
                <div className="text-xs">{t(`grade.${g}` as "grade.1")}</div>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-sm text-ink-3">
            {Math.round(summary.durationMs / 1000)} s · {summary.answers} Antworten
          </p>
          {skippedCards.length > 0 && (
            <Card className="mt-4 text-left">
              <div className="mb-1 text-sm font-semibold text-ink-2">{t("session.skipped")}</div>
              <div className="flex flex-wrap gap-1.5">
                {skippedCards.map((c) => (
                  <span
                    key={c.variantId}
                    className="rounded-chip bg-rose-soft px-2 py-0.5 text-sm text-rose-deep"
                  >
                    {c.front}
                  </span>
                ))}
              </div>
            </Card>
          )}
          {mode === "forever" && (
            <Button full variant="secondary" className="mt-6" onClick={addMoreNew}>
              {t("session.moreNew", { n: 10 })}
            </Button>
          )}
          <Button full size="lg" className="mt-3" onClick={close}>
            {search.onboarding ? t("common.next") : t("session.toHome")}
          </Button>
        </div>
      </Page>
    );
  }

  if (!state || !current) return null;
  // While the result panel is open, keep showing the card that was just answered.
  const shown = stage === "result" && lastCard ? lastCard : current;
  const left = remaining(state);
  const total = Object.keys(state.cards).length;
  const progress = total ? ((total - left) / total) * 100 : 0;

  return (
    <Page>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={close}
          className="rounded-full p-2 hover:bg-paper-2"
          aria-label={t("session.stop")}
        >
          <X size={22} />
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-chip bg-paper-2">
          <div
            className="h-full rounded-chip bg-sage transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm tabular-nums text-ink-2">
          {t("session.remaining", { n: left })}
        </span>
      </div>

      <div
        key={`${shown.variantId}-${phase ?? ""}-${state.answers.length}`}
        className="animate-pop"
      >
        {mode === "classic" && (
          <>
            <FlipCard
              front={shown.front}
              back={shown.back}
              flipped={stage !== "front"}
              onFlip={() => stage === "front" && reveal()}
              footer={
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-chip bg-white px-3 py-1 text-sm text-ink-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    openSentences();
                  }}
                >
                  <ChatCircleText size={16} /> {t("session.sentences")}
                </button>
              }
            />
            <div className="mt-6">
              {stage === "front" ? (
                <Button full size="lg" variant="secondary" onClick={reveal}>
                  {t("session.showAnswer")}
                </Button>
              ) : (
                <GradeChips onPick={(g) => commit(g, null, true, null)} />
              )}
            </div>
          </>
        )}

        {(mode === "reaction" || mode === "forever") && (
          <>
            <FlipCard
              front={shown.front}
              back={shown.back}
              flipped={stage !== "front"}
              onFlip={() => stage === "front" && reveal()}
            />
            <div className="mt-6">
              {stage === "front" && (
                <Button full size="lg" variant="secondary" onClick={reveal}>
                  {t("common.show")}
                </Button>
              )}
              {stage === "revealed" && (
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" variant="danger" onClick={() => confirm(false)}>
                    {t("session.wrong")}
                  </Button>
                  <Button size="lg" className="bg-sage-deep" onClick={() => confirm(true)}>
                    {t("session.correct")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {mode === "progressive" && (
          <>
            <Card className="min-h-[200px] flex flex-col items-center justify-center text-center">
              <div className="text-xs uppercase tracking-wide text-ink-3">
                {useChoice ? "Auswahl" : "Tippen"}
              </div>
              <div className="mt-2 text-3xl font-extrabold">{shown.front}</div>
              {stage !== "front" && (
                <div className="mt-3 text-xl font-semibold text-sage-deep">{shown.back}</div>
              )}
            </Card>
            {stage === "front" && useChoice && (
              <div className="mt-4 grid grid-cols-1 gap-2">
                {choices.map((c) => (
                  <Button key={c.id} variant="secondary" size="lg" onClick={() => choose(c)}>
                    {c.back}
                  </Button>
                ))}
              </div>
            )}
            {stage === "front" && useTyping && (
              <div className="mt-4 flex gap-2">
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkTyped()}
                  placeholder={t("session.typeAnswer")}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="flex-1 rounded-chip border border-line bg-white px-4 py-3 text-lg outline-none focus:border-ink"
                />
                <Button size="lg" onClick={checkTyped}>
                  {t("session.check")}
                </Button>
              </div>
            )}
          </>
        )}

        {stage === "result" && lastGrade && (
          <Card className={cx("mt-4", lastCorrect === false ? "bg-rose-soft" : "bg-sage-soft")}>
            {lastCorrect === false && mode === "progressive" && (
              <div className="mb-2 text-center text-sm text-rose-deep">
                Richtig wäre: <b>{shown.back}</b>
              </div>
            )}
            <div className="mb-2 text-center text-sm">
              {t("session.inferred", { grade: t(`grade.${lastGrade}` as "grade.1") })} ·{" "}
              <span className="text-ink-2">{t("session.override")}</span>
            </div>
            <GradeChips size="md" value={lastGrade} onPick={override} />
            <Button full variant="ghost" className="mt-2" onClick={() => proceed()}>
              {t("common.next")}
            </Button>
          </Card>
        )}
      </div>

      {stage === "front" && (
        <div className="mt-6 flex justify-center">
          <Button variant="ghost" size="sm" onClick={doSkip}>
            {t("common.skip")}
          </Button>
        </div>
      )}
      {mode === "forever" && newLimitLeft === 0 && left <= 1 && (
        <p className="mt-3 text-center text-xs text-ink-3">
          Tageslimit für neue Karten erreicht – du kannst gleich trotzdem weitere dazunehmen.
        </p>
      )}

      <Sheet
        open={sentences !== null}
        onClose={() => setSentences(null)}
        title={t("session.sentences")}
      >
        {sentences?.length === 0 && <p className="text-ink-2">Noch keine Sätze zu diesem Wort.</p>}
        <div className="space-y-3">
          {sentences?.map((s) => (
            <div key={s.id} className="rounded-card bg-white p-3">
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
          ))}
        </div>
      </Sheet>
    </Page>
  );
}
