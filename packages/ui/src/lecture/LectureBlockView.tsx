import type { LectureBlock, NativeLanguage } from "@lm/schema";
import { useState } from "react";
import { cx } from "../cx";
import {
  AudioButton,
  COLOUR_BG,
  COLOUR_TX,
  LetterTile,
  Markdownish,
  NumberChip,
  type OnPlay,
  PatternSlot,
  StressMark,
} from "./primitives";

export interface LectureBlockViewProps {
  block: LectureBlock;
  locale?: NativeLanguage;
  onPlay?: OnPlay;
  /** Called with `passed` when a quick check is completed. */
  onQuickCheck?: (passed: boolean) => void;
  /** Called with the lemmas of a vocab bundle when the learner wants to add them all. */
  onVocabBundle?: (lemmas: string[]) => void;
  /** Optional gloss lookup for vocab bundles (lemma -> first gloss). */
  glossFor?: (lemma: string) => string | undefined;
  labels?: Partial<{
    quickCheck: string;
    gotIt: string;
    addAll: string;
    exceptions: string;
    linked: string;
    select: string;
  }>;
}

const L = {
  quickCheck: "Kurzer Check",
  gotIt: "Verstanden",
  addAll: "Alle zu einer Liste hinzufügen",
  exceptions: "Ausnahmen",
  linked: "Verbunden",
  select: "Auswahl",
};

const card = "rounded-card border border-line bg-white/70 p-4";

export function LectureBlockView({
  block,
  locale = "de",
  onPlay,
  onQuickCheck,
  onVocabBundle,
  glossFor,
  labels,
}: LectureBlockViewProps) {
  const l = { ...L, ...labels };
  const i18n = (m: Partial<Record<NativeLanguage, string>> | undefined) =>
    m?.[locale] ?? m?.de ?? "";
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return <Tag className="mt-4 text-xl font-bold">{i18n(block.text)}</Tag>;
    }
    case "prose":
      return <Markdownish text={i18n(block.markdown)} />;
    case "alphabet_grid":
      return <AlphabetGrid letters={block.letters} locale={locale} onPlay={onPlay} />;
    case "number_table":
      return (
        <div className={card}>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {block.rows.map((r) => (
              <NumberChip key={r.value} value={r.value} word={r.word} onPlay={onPlay} />
            ))}
          </div>
          {block.patternNote && (
            <p className="mt-3 text-sm text-ink-2">{i18n(block.patternNote)}</p>
          )}
        </div>
      );
    case "rule_card":
      return (
        <div className={cx(card, "border-transparent", COLOUR_BG[block.colour])}>
          <div className={cx("font-bold", COLOUR_TX[block.colour])}>{i18n(block.title)}</div>
          <div className="mt-1">
            <Markdownish text={i18n(block.rule)} />
          </div>
          {block.examples.length > 0 && (
            <div className="mt-2 space-y-1">
              {block.examples.map((ex) => (
                <div key={ex.text} className="rounded-card bg-white/70 px-3 py-1.5">
                  <span className="font-semibold">{ex.text}</span>{" "}
                  <AudioButton text={ex.text} onPlay={onPlay} />
                  <div className="text-sm text-ink-2">{i18n(ex.translation)}</div>
                </div>
              ))}
            </div>
          )}
          {block.exceptions.length > 0 && (
            <div className="mt-2 text-sm">
              <span className="font-semibold">{l.exceptions}: </span>
              {block.exceptions.map((ex) => (
                <span key={ex.text}>
                  <span className="font-medium">{ex.text}</span>{" "}
                  <span className="text-ink-2">({i18n(ex.translation)})</span>{" "}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    case "pattern_builder":
      return (
        <PatternBuilder
          intro={block.intro ? i18n(block.intro) : undefined}
          slots={block.slots.map((s) => ({
            label: i18n(s.label),
            options: s.options.map((o) => (typeof o === "string" ? o : o.text)),
          }))}
          onPlay={onPlay}
        />
      );
    case "conjugation_mini":
      return (
        <div className={card}>
          <div className="mb-2 font-bold">
            {block.verb} <span className="font-normal text-ink-2">· {i18n(block.tense)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {block.persons.map((p) => (
              <button
                type="button"
                key={p.person}
                className="flex justify-between rounded-chip px-2 py-1 text-left hover:bg-paper-2"
                onClick={() => onPlay?.(p.form)}
              >
                <span className="text-sm text-ink-3">{p.person}</span>
                <span className="font-semibold text-sage-deep">{p.form}</span>
              </button>
            ))}
          </div>
        </div>
      );
    case "dialogue":
      return (
        <div className="space-y-2">
          {block.lines.map((line, i) => (
            <div
              key={`${line.speaker}-${line.text}`}
              className={cx("flex", i % 2 ? "justify-end" : "justify-start")}
            >
              <button
                type="button"
                onClick={() => onPlay?.(line.text)}
                className={cx(
                  "max-w-[85%] rounded-card px-4 py-2 text-left",
                  i % 2 ? "bg-sky-soft" : "border border-line bg-white",
                )}
              >
                <div className="text-xs text-ink-3">{line.speaker}</div>
                <div className="font-semibold">{line.text}</div>
                <div className="text-sm text-ink-2">{i18n(line.translation)}</div>
              </button>
            </div>
          ))}
        </div>
      );
    case "compare":
      return (
        <div className={cx(card, "overflow-hidden p-0")}>
          <div className="grid grid-cols-2 bg-paper-2 text-sm font-bold">
            <div className="px-3 py-2">{i18n(block.left)}</div>
            <div className="px-3 py-2">{i18n(block.right)}</div>
          </div>
          {block.rows.map(([a, b]) => (
            <div key={`${a}-${b}`} className="grid grid-cols-2 border-t border-line text-sm">
              <div className="px-3 py-2">{a}</div>
              <div className="px-3 py-2">{b}</div>
            </div>
          ))}
        </div>
      );
    case "constraint_visual":
      return (
        <div className={card}>
          <div className="flex flex-wrap items-end gap-1 text-xl font-semibold">
            {block.tokens.map((tk, i) => (
              <span
                key={`${tk.text}-${String(i)}`}
                className={cx("relative rounded px-1", tk.colour && `grammar-${tk.colour}`)}
              >
                <StressMark stressed={tk.stressed}>{tk.text}</StressMark>
              </span>
            ))}
          </div>
          {block.links.length > 0 && (
            <div className="mt-2 text-xs text-ink-3">
              {l.linked}:{" "}
              {block.links
                .map(([a, b]) => `${block.tokens[a]?.text} → ${block.tokens[b]?.text}`)
                .join(" · ")}
            </div>
          )}
          {block.caption && <p className="mt-2 text-sm text-ink-2">{i18n(block.caption)}</p>}
        </div>
      );
    case "quick_check":
      return (
        <QuickCheck
          questions={block.questions.map((q) => ({
            prompt: i18n(q.prompt),
            options: q.options,
            answer: q.answer,
          }))}
          onDone={onQuickCheck}
          labels={l}
        />
      );
    case "vocab_bundle": {
      const items = [
        ...block.lemmas.map((x) =>
          typeof x === "string"
            ? { text: x, gloss: glossFor?.(x) }
            : { text: x.lemma, gloss: i18n(x.translation) },
        ),
        ...block.phrases.map((p) => ({ text: p.text, gloss: i18n(p.translation) })),
      ];
      return (
        <div className={card}>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-bold">{i18n(block.title)}</div>
            {onVocabBundle && (
              <button
                type="button"
                className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm font-semibold"
                onClick={() => onVocabBundle(items.map((x) => x.text))}
              >
                + {l.addAll}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map((x) => (
              <span key={x.text} className="rounded-chip bg-paper-2 px-2.5 py-1 text-sm">
                <b>{x.text}</b>
                {x.gloss && <span className="text-ink-2"> · {x.gloss}</span>}
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "word_list":
      return (
        <div className={card}>
          {block.title && <div className="mb-2 font-bold">{i18n(block.title)}</div>}
          <div className="grid gap-1">
            {block.words.map((w) => (
              <button
                type="button"
                key={w.text}
                className="rounded-chip px-3 py-1.5 text-left hover:bg-paper-2"
                onClick={() => onPlay?.(w.text)}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{w.text}</span>
                  <span className="text-sm text-ink-2">{i18n(w.translation)}</span>
                </div>
                {w.note && <div className="text-xs text-ink-3">{i18n(w.note)}</div>}
              </button>
            ))}
          </div>
        </div>
      );
    case "calculator":
    case "clock":
    case "calendar":
      return (
        <div className={`${card} text-sm text-ink-2`}>
          <div className="font-bold text-ink">
            {block.type === "calculator"
              ? "Rechner"
              : block.type === "clock"
                ? "Interaktive Uhr"
                : "Interaktiver Kalender"}
          </div>
          {block.intro && <div className="mt-1">{i18n(block.intro)}</div>}
          <div className="mt-1 text-xs text-ink-3">
            Interaktives Element – in der App bedienbar.
          </div>
        </div>
      );
    default:
      return null;
  }
}

function AlphabetGrid({
  letters,
  locale,
  onPlay,
}: {
  letters: {
    glyph: string;
    ipa: string;
    example: string;
    translation: Partial<Record<NativeLanguage, string>>;
  }[];
  locale: NativeLanguage;
  onPlay?: OnPlay;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sel = letters.find((x) => x.glyph === open);
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {letters.map((x) => (
          <LetterTile
            key={x.glyph}
            glyph={x.glyph}
            active={open === x.glyph}
            onSelect={() => {
              setOpen(x.glyph);
              onPlay?.(x.example);
            }}
          />
        ))}
      </div>
      {sel && (
        <div className={cx(card, "mt-3")} key={sel.glyph}>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{sel.glyph}</span>
            <span className="font-mono text-ink-2">/{sel.ipa}/</span>
          </div>
          <div className="mt-1 text-lg font-semibold">
            {sel.example} <AudioButton text={sel.example} onPlay={onPlay} />
          </div>
          <div className="text-sm text-ink-2">{sel.translation[locale] ?? sel.translation.de}</div>
        </div>
      )}
    </div>
  );
}

function PatternBuilder({
  intro,
  slots,
  onPlay,
}: {
  intro?: string;
  slots: { label: string; options: string[] }[];
  onPlay?: OnPlay;
}) {
  const [picked, setPicked] = useState<number[]>(slots.map(() => 0));
  const sentence = slots.map((s, i) => s.options[picked[i] ?? 0]).join(" ");
  return (
    <div className={card}>
      {intro && <div className="mb-2 text-sm text-ink-2">{intro}</div>}
      <div className="space-y-2">
        {slots.map((s, i) => (
          <PatternSlot
            key={s.label}
            label={s.label}
            options={s.options}
            selected={picked[i] ?? 0}
            onSelect={(j) => setPicked(picked.map((p, k) => (k === i ? j : p)))}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onPlay?.(sentence)}
        className="mt-3 w-full rounded-card bg-sage-soft px-4 py-3 text-left text-lg font-semibold text-sage-deep"
      >
        {sentence}
      </button>
    </div>
  );
}

function QuickCheck({
  questions,
  onDone,
  labels,
}: {
  questions: { prompt: string; options: string[]; answer: number }[];
  onDone?: (passed: boolean) => void;
  labels: typeof L;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const complete = answers.every((a) => a !== null);
  const correct = answers.filter((a, i) => a === questions[i]?.answer).length;
  return (
    <div className={cx(card, "border-transparent bg-lavender-soft")}>
      <div className="mb-2 font-bold text-lavender-deep">{labels.quickCheck}</div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.prompt}>
            <div className="mb-1 font-medium">{q.prompt}</div>
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((o, j) => {
                const a = answers[i];
                const state =
                  a === null ? "idle" : j === q.answer ? "right" : a === j ? "wrong" : "idle";
                return (
                  <button
                    type="button"
                    key={o}
                    disabled={a !== null}
                    onClick={() => setAnswers(answers.map((x, k) => (k === i ? j : x)))}
                    className={cx(
                      "rounded-chip border px-3 py-1.5 text-sm font-medium",
                      state === "right"
                        ? "border-sage bg-sage-soft text-sage-deep"
                        : state === "wrong"
                          ? "border-rose bg-rose-soft text-rose-deep"
                          : "border-line bg-white",
                    )}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {complete && (
        <button
          type="button"
          className="mt-4 w-full rounded-chip bg-ink px-4 py-2.5 font-semibold text-paper"
          onClick={() => onDone?.(correct === questions.length)}
        >
          {correct}/{questions.length} · {labels.gotIt}
        </button>
      )}
    </div>
  );
}
