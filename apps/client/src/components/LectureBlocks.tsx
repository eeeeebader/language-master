import type { LectureBlock } from "@lm/schema";
import { Plus, SpeakerHigh } from "@phosphor-icons/react";
import { useState } from "react";
import { getEntryByLemma } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import {
  DAYS_DE,
  DAYS_ES,
  dateToSpanish,
  MONTHS_DE,
  MONTHS_ES,
  numberToSpanish,
  timeToSpanish,
} from "@/lib/spanish";
import { speak } from "@/lib/tts";
import { Button, Card, Chip, cx, Markdownish } from "./ui";
import type { VocabItem } from "./VocabSheet";

const COLOUR_BG = {
  sage: "bg-sage-soft",
  rose: "bg-rose-soft",
  lavender: "bg-lavender-soft",
  amber: "bg-amber-soft",
  sky: "bg-sky-soft",
} as const;
const COLOUR_TX = {
  sage: "text-sage-deep",
  rose: "text-rose-deep",
  lavender: "text-lavender-deep",
  amber: "text-amber-deep",
  sky: "text-sky-deep",
} as const;

type OnWord = (item: VocabItem) => void;

export function AudioButton({ text, size = 16 }: { text: string; size?: number }) {
  return (
    <button
      type="button"
      className="inline-flex items-center text-sky-deep"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      aria-label="Aussprache"
    >
      <SpeakerHigh size={size} />
    </button>
  );
}

/** A tappable Spanish word: speaks it and opens the word drawer. */
function Word({
  text,
  translation,
  onWord,
  className,
}: {
  text: string;
  translation?: string;
  onWord?: OnWord;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cx(
        "rounded-chip px-2 py-0.5 text-left font-semibold underline decoration-dotted decoration-sky underline-offset-4 hover:bg-sky-soft",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
        onWord?.({ text, translation });
      }}
    >
      {text}
    </button>
  );
}

/** "gato · gente" with "Katze · Leute" → paired words. */
function splitPairs(text: string, translation?: string): { text: string; translation?: string }[] {
  const ws = text.split(" · ");
  const ts = (translation ?? "").split(" · ");
  return ws.map((w, i) => ({ text: w.trim(), translation: ts[i]?.trim() || translation }));
}

export function Block({
  block,
  onQuickCheck,
  onVocabBundle,
  onWord,
  hiddenLemmas,
}: {
  block: LectureBlock;
  onQuickCheck?: (passed: boolean) => void;
  onVocabBundle?: (items: VocabItem[]) => void;
  onWord?: OnWord;
  /** Words already offered by earlier lectures; left out of this bundle. */
  hiddenLemmas?: Set<string>;
}) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return <Tag className="mt-4 text-xl font-bold">{block.text.de}</Tag>;
    }
    case "prose":
      return <Markdownish text={block.markdown.de ?? ""} />;
    case "alphabet_grid":
      return <AlphabetGrid letters={block.letters} onWord={onWord} />;
    case "number_table": {
      const long = block.rows.some((r) => r.word.length > 12);
      return (
        <Card>
          <div
            className={cx(
              "grid gap-1",
              long ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {block.rows.map((r) => (
              <button
                type="button"
                key={r.value}
                className="flex items-center justify-between rounded-chip px-3 py-1.5 text-left hover:bg-paper-2"
                onClick={() => {
                  speak(r.word);
                  onWord?.({ text: r.word, translation: String(r.value) });
                }}
              >
                <span className="tabular-nums text-ink-3">{r.value}</span>
                <span className="font-semibold">{r.word}</span>
              </button>
            ))}
          </div>
          {block.patternNote && (
            <div className="mt-3 text-sm text-ink-2">
              <Markdownish text={block.patternNote.de ?? ""} />
            </div>
          )}
        </Card>
      );
    }
    case "word_list": {
      const compact = block.words.every((x) => x.text.length <= 12 && !x.note);
      return (
        <Card>
          {block.title && <div className="mb-2 font-bold">{block.title.de}</div>}
          <div className={cx("grid gap-1", compact && "sm:grid-cols-2")}>
            {block.words.map((x) => (
              <button
                type="button"
                key={x.text}
                className="rounded-chip px-3 py-1.5 text-left hover:bg-paper-2"
                onClick={() => {
                  speak(x.text);
                  onWord?.({ text: x.text, translation: x.translation.de });
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{x.text}</span>
                  <span className="shrink-0 text-right text-sm text-ink-2">{x.translation.de}</span>
                </div>
                {x.note && <div className="text-xs text-ink-3">{x.note.de}</div>}
              </button>
            ))}
          </div>
        </Card>
      );
    }
    case "rule_card":
      return (
        <Card className={cx("border-transparent", COLOUR_BG[block.colour])}>
          <div className={cx("font-bold", COLOUR_TX[block.colour])}>{block.title.de}</div>
          <div className="mt-1">
            <Markdownish text={block.rule.de ?? ""} />
          </div>
          {block.examples.length > 0 && (
            <div className="mt-2 space-y-1">
              {block.examples.map((ex) => (
                <Example
                  key={ex.text}
                  text={ex.text}
                  translation={ex.translation.de}
                  onWord={onWord}
                />
              ))}
            </div>
          )}
          {block.exceptions.length > 0 && (
            <div className="mt-2 text-sm">
              <span className="font-semibold">Ausnahmen: </span>
              {block.exceptions.map((ex) => (
                <span key={ex.text}>
                  <span className="font-medium">{ex.text}</span>{" "}
                  <span className="text-ink-2">({ex.translation.de})</span>{" "}
                </span>
              ))}
            </div>
          )}
        </Card>
      );
    case "pattern_builder":
      return <PatternBuilder intro={block.intro?.de} slots={block.slots} />;
    case "conjugation_mini":
      return (
        <Card>
          <div className="mb-2 font-bold">
            <Word text={block.verb} onWord={onWord} className="-ml-2" />
            <span className="font-normal text-ink-2"> · {block.tense.de}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {block.persons.map((p) => (
              <button
                type="button"
                key={p.person}
                className="flex justify-between rounded-chip px-2 py-1 text-left hover:bg-paper-2"
                onClick={() => speak(p.form)}
              >
                <span className="text-sm text-ink-3">{p.person}</span>
                <span className="font-semibold text-sage-deep">{p.form}</span>
              </button>
            ))}
          </div>
        </Card>
      );
    case "dialogue":
      return (
        <div className="space-y-2">
          {block.lines.map((l, i) => (
            <div
              key={`${l.speaker}-${i}`}
              className={cx("flex", i % 2 ? "justify-end" : "justify-start")}
            >
              <button
                type="button"
                onClick={() => speak(l.text)}
                className={cx(
                  "max-w-[85%] rounded-card px-4 py-2 text-left",
                  i % 2 ? "bg-sky-soft" : "bg-white border border-line",
                )}
              >
                <div className="text-xs text-ink-3">{l.speaker}</div>
                <div className="font-semibold">{l.text}</div>
                <div className="text-sm text-ink-2">{l.translation.de}</div>
              </button>
            </div>
          ))}
        </div>
      );
    case "compare":
      return (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-2 bg-paper-2 text-sm font-bold">
            <div className="px-3 py-2">{block.left.de}</div>
            <div className="px-3 py-2">{block.right.de}</div>
          </div>
          {block.rows.map(([l, r, tr]) => {
            const cell = (text: string, other: string, active: boolean) =>
              active ? (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left font-medium hover:bg-sky-soft"
                  onClick={() => {
                    speak(text);
                    onWord?.({ text, translation: tr ?? other });
                  }}
                >
                  {text}
                </button>
              ) : (
                <div className="px-3 py-2">{text}</div>
              );
            return (
              <div key={`${l}-${r}`} className="grid grid-cols-2 border-t border-line text-sm">
                {cell(l, r, block.vocab === "left" || block.vocab === "both")}
                {cell(r, l, block.vocab === "right" || block.vocab === "both")}
              </div>
            );
          })}
        </Card>
      );
    case "constraint_visual":
      return (
        <Card>
          <div className="flex flex-wrap items-end gap-1 text-xl font-semibold">
            {block.tokens.map((tk, i) => (
              <span
                key={`${tk.text}-${i}`}
                className={cx(
                  "relative rounded px-1",
                  tk.colour && `grammar-${tk.colour}`,
                  tk.stressed &&
                    "underline decoration-amber-deep decoration-4 underline-offset-4 text-amber-deep",
                )}
              >
                {tk.text}
              </span>
            ))}
          </div>
          {block.caption && (
            <div className="mt-2 flex flex-wrap gap-1 text-sm text-ink-2">
              {splitPairs(block.caption.de ?? "").map((w) => (
                <Word key={w.text} text={w.text} onWord={onWord} className="font-medium" />
              ))}
            </div>
          )}
        </Card>
      );
    case "quick_check":
      return <QuickCheck questions={block.questions} onDone={onQuickCheck} />;
    case "vocab_bundle": {
      const items: VocabItem[] = [
        ...block.lemmas.map((l) =>
          typeof l === "string"
            ? { text: l, translation: getEntryByLemma(l)?.glosses[0]?.text }
            : { text: l.lemma, translation: l.translation.de },
        ),
        ...block.phrases.map((p) => ({ text: p.text, translation: p.translation.de })),
      ].filter((i) => !hiddenLemmas?.has(i.text.toLowerCase()));
      if (items.length === 0) return null;
      return (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="font-bold">{block.title.de}</div>
            <Button size="sm" variant="secondary" onClick={() => onVocabBundle?.(items)}>
              <Plus size={14} /> {t("lectures.addAll")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map((i) => (
              <button
                type="button"
                key={i.text}
                className="rounded-chip bg-paper-2 px-2.5 py-1 text-left text-sm hover:bg-sky-soft"
                onClick={() => {
                  speak(i.text);
                  onWord?.(i);
                }}
              >
                <b>{i.text}</b>
                {i.translation && <span className="text-ink-2"> · {i.translation}</span>}
              </button>
            ))}
          </div>
        </Card>
      );
    }
    case "calculator":
      return <Calculator intro={block.intro?.de} />;
    case "clock":
      return <Clock intro={block.intro?.de} />;
    case "calendar":
      return <Calendar intro={block.intro?.de} />;
    default:
      return null;
  }
}

/** Rule-card example: single words become tappable, sentences get a speaker. */
function Example({
  text,
  translation,
  onWord,
}: {
  text: string;
  translation?: string;
  onWord?: OnWord;
}) {
  const parts: { text: string; translation?: string }[] = text.includes(" · ")
    ? splitPairs(text, translation)
    : text.split(/,\s+/).map((w) => ({ text: w }));
  // " · " lists are always word lists; comma lists only when no part looks like a sentence.
  const wordish = text.includes(" · ")
    ? true
    : parts.length > 1 &&
      parts.every((p) => p.text.split(" ").length <= 3 && !/[.!?]$/.test(p.text));
  if (wordish) {
    const ts = (translation ?? "").split(/\s*(?:·|,)\s*/);
    return (
      <div className="rounded-card bg-white/70 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {parts.map((p, i) => (
            <Word key={p.text} text={p.text} translation={p.translation ?? ts[i]} onWord={onWord} />
          ))}
        </div>
        {translation && <div className="px-2 text-sm text-ink-2">{translation}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-card bg-white/70 px-3 py-1.5">
      <span className="font-semibold">{text}</span> <AudioButton text={text} />
      {translation && <div className="text-sm text-ink-2">{translation}</div>}
    </div>
  );
}

function AlphabetGrid({
  letters,
  onWord,
}: {
  letters: {
    glyph: string;
    ipa: string;
    example: string;
    translation: Record<string, string | undefined>;
  }[];
  onWord?: OnWord;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sel = letters.find((l) => l.glyph === open);
  const pairs = sel ? splitPairs(sel.example, sel.translation.de) : [];
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {letters.map((l) => (
          <button
            type="button"
            key={l.glyph}
            onClick={() => {
              setOpen(l.glyph);
              speak(l.example.split(" · ")[0] ?? l.example);
            }}
            className={cx(
              "aspect-square rounded-card border text-xl font-bold transition-all",
              open === l.glyph
                ? "bg-ink text-paper border-ink"
                : "bg-white border-line hover:bg-paper-2",
            )}
          >
            {l.glyph}
          </button>
        ))}
      </div>
      {sel && (
        <Card className="mt-3 animate-pop" key={sel.glyph}>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{sel.glyph}</span>
            <span className="font-mono text-ink-2">/{sel.ipa}/</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-1 gap-y-1">
            {pairs.map((p) => (
              <span key={p.text} className="inline-flex items-center">
                <Word
                  text={p.text}
                  translation={p.translation}
                  onWord={onWord}
                  className="text-lg"
                />
                <span className="text-sm text-ink-2">{p.translation}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PatternBuilder({
  intro,
  slots,
}: {
  intro?: string;
  slots: {
    label: Record<string, string | undefined>;
    options: (string | { text: string; translation: Record<string, string | undefined> })[];
  }[];
}) {
  const [picked, setPicked] = useState<number[]>(slots.map(() => 0));
  const text = (o: (typeof slots)[number]["options"][number]) =>
    typeof o === "string" ? o : o.text;
  const tr = (o: (typeof slots)[number]["options"][number]) =>
    typeof o === "string" ? "" : (o.translation.de ?? "");
  const chosen = slots.map((s, i) => s.options[picked[i] ?? 0]).filter((o) => o !== undefined);
  const sentence = chosen
    .map(text)
    .join(" ")
    .replace(/\s+([,.?!])/g, "$1");
  const translation = chosen
    .map(tr)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.?!])/g, "$1");
  return (
    <Card>
      {intro && <div className="mb-2 text-sm text-ink-2">{intro}</div>}
      <div className="space-y-2">
        {slots.map((s, i) => (
          <div key={s.label.de}>
            <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">{s.label.de}</div>
            <div className="flex flex-wrap gap-1.5">
              {s.options.map((o, j) => (
                <Chip
                  key={text(o)}
                  active={picked[i] === j}
                  onClick={() => setPicked(picked.map((p, k) => (k === i ? j : p)))}
                >
                  {text(o)}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => speak(sentence)}
        className="mt-3 w-full rounded-card bg-sage-soft px-4 py-3 text-left text-sage-deep"
      >
        <span className="text-lg font-semibold">
          {sentence} <SpeakerHigh size={18} className="ml-1 inline" />
        </span>
        {translation && <div className="mt-0.5 text-sm text-sage-deep/80">{translation}</div>}
      </button>
    </Card>
  );
}

function QuickCheck({
  questions,
  onDone,
}: {
  questions: { prompt: Record<string, string | undefined>; options: string[]; answer: number }[];
  onDone?: (passed: boolean) => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const complete = answers.every((a) => a !== null);
  const correct = answers.filter((a, i) => a === questions[i]?.answer).length;
  return (
    <Card tone="lavender" className="border-transparent" testId="quick-check">
      <div className="mb-2 font-bold text-lavender-deep">{t("lectures.quickCheck")}</div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={q.prompt.de}>
            <div className="mb-1 font-medium">{q.prompt.de}</div>
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
                    onClick={() => {
                      const next = answers.map((x, k) => (k === i ? j : x));
                      setAnswers(next);
                      if (next.every((x) => x !== null))
                        onDone?.(
                          next.filter((x, k) => x === questions[k]?.answer).length ===
                            questions.length,
                        );
                    }}
                    className={cx(
                      "rounded-chip border px-3 py-1.5 text-sm font-medium",
                      state === "right"
                        ? "bg-sage-soft border-sage text-sage-deep"
                        : state === "wrong"
                          ? "bg-rose-soft border-rose text-rose-deep"
                          : "bg-white border-line",
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
        <div className="mt-3 text-sm font-semibold text-lavender-deep">
          {correct}/{questions.length} richtig
        </div>
      )}
    </Card>
  );
}

// ---------- interactive widgets ----------

function SpeakLine({ es, de }: { es: string; de?: string }) {
  return (
    <button
      type="button"
      onClick={() => speak(es)}
      className="mt-3 w-full rounded-card bg-sage-soft px-4 py-3 text-left text-sage-deep"
    >
      <span className="text-lg font-semibold">
        {es} <SpeakerHigh size={18} className="ml-1 inline" />
      </span>
      {de && <div className="mt-0.5 text-sm text-sage-deep/80">{de}</div>}
    </button>
  );
}

const OPS = [
  { sym: "+", es: "más", de: "plus", fn: (a: number, b: number) => a + b },
  { sym: "−", es: "menos", de: "minus", fn: (a: number, b: number) => a - b },
  { sym: "×", es: "por", de: "mal", fn: (a: number, b: number) => a * b },
  {
    sym: "÷",
    es: "entre",
    de: "geteilt durch",
    fn: (a: number, b: number) => (b === 0 ? Number.NaN : a / b),
  },
] as const;

function Calculator({ intro }: { intro?: string }) {
  const [a, setA] = useState(12);
  const [b, setB] = useState(7);
  const [op, setOp] = useState(0);
  const o = OPS[op] as (typeof OPS)[number];
  const raw = o.fn(a, b);
  const result = Number.isFinite(raw) ? Math.round(raw * 100) / 100 : Number.NaN;
  const es = Number.isFinite(result)
    ? `${numberToSpanish(a)} ${o.es} ${numberToSpanish(b)} son ${numberToSpanish(result)}`
    : "No se puede dividir entre cero";
  const de = Number.isFinite(result)
    ? `${a} ${o.de} ${b} ist ${result}`
    : "Durch null kann man nicht teilen";
  const field = (v: number, set: (n: number) => void) => (
    <input
      type="number"
      value={v}
      onChange={(e) => set(Math.max(-9999, Math.min(9999, Number(e.target.value) || 0)))}
      className="w-24 rounded-chip border border-line bg-white px-3 py-2 text-center text-lg font-semibold outline-none focus:border-ink"
    />
  );
  return (
    <Card>
      {intro && <div className="mb-2 text-sm text-ink-2">{intro}</div>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {field(a, setA)}
        <div className="flex gap-1">
          {OPS.map((x, i) => (
            <Chip key={x.sym} active={op === i} onClick={() => setOp(i)}>
              {x.sym}
            </Chip>
          ))}
        </div>
        {field(b, setB)}
        <span className="text-lg text-ink-3">=</span>
        <span className="min-w-12 text-center text-lg font-bold tabular-nums">
          {Number.isFinite(result) ? result : "–"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1 text-xs text-ink-3">
        {OPS.map((x) => (
          <span key={x.sym} className="rounded-chip bg-paper-2 px-2 py-0.5">
            {x.sym} {x.es}
          </span>
        ))}
        <span className="rounded-chip bg-paper-2 px-2 py-0.5">= son / es igual a</span>
      </div>
      <SpeakLine es={es} de={de} />
      <div className="mt-2 grid grid-cols-2 gap-1 text-sm">
        <button
          type="button"
          className="rounded-chip px-2 py-1 text-left hover:bg-paper-2"
          onClick={() => speak(numberToSpanish(a))}
        >
          {a} · <b>{numberToSpanish(a)}</b>
        </button>
        <button
          type="button"
          className="rounded-chip px-2 py-1 text-left hover:bg-paper-2"
          onClick={() => speak(numberToSpanish(b))}
        >
          {b} · <b>{numberToSpanish(b)}</b>
        </button>
      </div>
    </Card>
  );
}

function Clock({ intro }: { intro?: string }) {
  const [h, setH] = useState(15);
  const [m, setM] = useState(45);
  const [drag, setDrag] = useState<"h" | "m" | null>(null);
  const R = 100;
  const hourAngle = ((h % 12) + m / 60) * 30;
  const minAngle = m * 6;
  const hand = (angle: number, len: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: R + Math.cos(rad) * len, y: R + Math.sin(rad) * len };
  };
  const hp = hand(hourAngle, 52);
  const mp = hand(minAngle, 78);
  const { es, de } = timeToSpanish(h, m);

  function setFromPointer(e: React.PointerEvent<SVGSVGElement>, which: "h" | "m") {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 * R - R;
    const y = ((e.clientY - rect.top) / rect.height) * 2 * R - R;
    const angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    const a = (angle + 360) % 360;
    if (which === "m") setM((Math.round(a / 6 / 5) * 5) % 60);
    else {
      const hh = Math.round(a / 30) % 12;
      setH(h >= 12 ? hh + 12 : hh);
    }
  }
  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 * R - R;
    const y = ((e.clientY - rect.top) / rect.height) * 2 * R - R;
    const which: "h" | "m" = Math.hypot(x, y) < 62 ? "h" : "m";
    setDrag(which);
    setFromPointer(e, which);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  return (
    <Card>
      {intro && <div className="mb-2 text-sm text-ink-2">{intro}</div>}
      <div className="mx-auto max-w-[240px]">
        <svg
          viewBox={`0 0 ${2 * R} ${2 * R}`}
          className="w-full touch-none select-none"
          role="img"
          aria-label="Uhr"
          onPointerDown={onDown}
          onPointerMove={(e) => drag && setFromPointer(e, drag)}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
        >
          <circle cx={R} cy={R} r={R - 2} fill="#fff" stroke="#e7e1d8" strokeWidth={3} />
          {Array.from({ length: 12 }, (_, i) => {
            const p = hand(i * 30, 84);
            const q = hand(i * 30, 92);
            return (
              <line
                key={`tick-${i.toString()}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke="#a39d94"
                strokeWidth={i % 3 === 0 ? 3 : 1.5}
              />
            );
          })}
          {Array.from({ length: 12 }, (_, i) => {
            const p = hand(i * 30, 70);
            return (
              <text
                key={`num-${i.toString()}`}
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fontSize={12}
                fill="#6b665f"
              >
                {i === 0 ? 12 : i}
              </text>
            );
          })}
          <line
            x1={R}
            y1={R}
            x2={hp.x}
            y2={hp.y}
            stroke="#2b2a28"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <line
            x1={R}
            y1={R}
            x2={mp.x}
            y2={mp.y}
            stroke="#5a7a4a"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <circle cx={R} cy={R} r={5} fill="#2b2a28" />
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <Chip active={h < 12} onClick={() => setH(h % 12)}>
          vormittags
        </Chip>
        <Chip active={h >= 12} onClick={() => setH((h % 12) + 12)}>
          nachmittags
        </Chip>
        <span className="ml-2 font-mono text-lg tabular-nums">
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}
        </span>
      </div>
      <SpeakLine es={es} de={de} />
    </Card>
  );
}

function Calendar({ intro }: { intro?: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const sel = new Date(year, month, Math.min(day, days));
  const { es, de } = dateToSpanish(sel);
  const dow = (sel.getDay() + 6) % 7;
  const weekend = dow >= 5;
  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }
  return (
    <Card>
      {intro && <div className="mb-2 text-sm text-ink-2">{intro}</div>}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-chip px-3 py-1 hover:bg-paper-2"
          onClick={() => shift(-1)}
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
        <button type="button" className="font-bold" onClick={() => speak(MONTHS_ES[month] ?? "")}>
          {MONTHS_ES[month]}{" "}
          <span className="font-normal text-ink-2">
            · {MONTHS_DE[month]} {year}
          </span>
        </button>
        <button
          type="button"
          className="rounded-chip px-3 py-1 hover:bg-paper-2"
          onClick={() => shift(1)}
          aria-label="Nächster Monat"
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-ink-3">
        {DAYS_ES.map((d, i) => (
          <button
            type="button"
            key={d}
            className={cx("rounded-chip py-1 hover:bg-paper-2", i >= 5 && "text-rose-deep")}
            onClick={() => speak(d)}
            title={DAYS_DE[i]}
          >
            {d.slice(0, 2)}
          </button>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i.toString()}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const isSel = n === sel.getDate();
          const isToday =
            n === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          return (
            <button
              type="button"
              key={`d-${n.toString()}`}
              onClick={() => {
                setDay(n);
                speak(dateToSpanish(new Date(year, month, n)).es);
              }}
              className={cx(
                "aspect-square rounded-chip text-sm tabular-nums",
                isSel ? "bg-ink font-bold text-paper" : "hover:bg-paper-2",
                !isSel && isToday && "ring-1 ring-sage",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-center text-xs text-ink-3">
        {DAYS_ES[dow]} · {DAYS_DE[dow]} ·{" "}
        {weekend ? "fin de semana (Wochenende)" : "día laborable (Werktag)"}
      </div>
      <SpeakLine es={es} de={de} />
    </Card>
  );
}
