import type { LectureBlock } from "@lm/schema";
import { Plus, SpeakerHigh } from "@phosphor-icons/react";
import { useState } from "react";
import { getEntryByLemma } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { speak } from "@/lib/tts";
import { Button, Card, Chip, cx, Markdownish } from "./ui";

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

export function Block({
  block,
  onQuickCheck,
  onVocabBundle,
}: {
  block: LectureBlock;
  onQuickCheck?: (passed: boolean) => void;
  onVocabBundle?: (lemmas: string[]) => void;
}) {
  switch (block.type) {
    case "heading": {
      const Tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
      return <Tag className="mt-4 text-xl font-bold">{block.text.de}</Tag>;
    }
    case "prose":
      return <Markdownish text={block.markdown.de ?? ""} />;
    case "alphabet_grid":
      return <AlphabetGrid letters={block.letters} />;
    case "number_table":
      return (
        <Card>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {block.rows.map((r) => (
              <button
                type="button"
                key={r.value}
                className="flex items-center justify-between rounded-chip px-3 py-1.5 text-left hover:bg-paper-2"
                onClick={() => speak(r.word)}
              >
                <span className="tabular-nums text-ink-3">{r.value}</span>
                <span className="font-semibold">{r.word}</span>
              </button>
            ))}
          </div>
          {block.patternNote && <p className="mt-3 text-sm text-ink-2">{block.patternNote.de}</p>}
        </Card>
      );
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
                <div key={ex.text} className="rounded-card bg-white/70 px-3 py-1.5">
                  <span className="font-semibold">{ex.text}</span> <AudioButton text={ex.text} />
                  <div className="text-sm text-ink-2">{ex.translation.de}</div>
                </div>
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
            {block.verb} <span className="font-normal text-ink-2">· {block.tense.de}</span>
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
          {block.rows.map(([l, r]) => (
            <div key={`${l}-${r}`} className="grid grid-cols-2 border-t border-line text-sm">
              <div className="px-3 py-2">{l}</div>
              <div className="px-3 py-2">{r}</div>
            </div>
          ))}
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
          {block.links.length > 0 && (
            <div className="mt-2 text-xs text-ink-3">
              Verbunden:{" "}
              {block.links
                .map(([a, b]) => `${block.tokens[a]?.text} → ${block.tokens[b]?.text}`)
                .join(" · ")}
            </div>
          )}
          {block.caption && <p className="mt-2 text-sm text-ink-2">{block.caption.de}</p>}
        </Card>
      );
    case "quick_check":
      return <QuickCheck questions={block.questions} onDone={onQuickCheck} />;
    case "vocab_bundle":
      return (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-bold">{block.title.de}</div>
            <Button size="sm" variant="secondary" onClick={() => onVocabBundle?.(block.lemmas)}>
              <Plus size={14} /> {t("lectures.addAll")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {block.lemmas.map((l) => {
              const e = getEntryByLemma(l);
              return (
                <span key={l} className="rounded-chip bg-paper-2 px-2.5 py-1 text-sm">
                  <b>{l}</b>
                  {e && <span className="text-ink-2"> · {e.glosses[0]?.text}</span>}
                </span>
              );
            })}
          </div>
        </Card>
      );
    default:
      return null;
  }
}

function AlphabetGrid({
  letters,
}: {
  letters: {
    glyph: string;
    ipa: string;
    example: string;
    translation: Record<string, string | undefined>;
  }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const sel = letters.find((l) => l.glyph === open);
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5">
        {letters.map((l) => (
          <button
            type="button"
            key={l.glyph}
            onClick={() => {
              setOpen(l.glyph);
              speak(l.example);
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
          <div className="mt-1 text-lg font-semibold">
            {sel.example} <AudioButton text={sel.example} />
          </div>
          <div className="text-sm text-ink-2">{sel.translation.de}</div>
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
  slots: { label: Record<string, string | undefined>; options: string[] }[];
}) {
  const [picked, setPicked] = useState<number[]>(slots.map(() => 0));
  const sentence = slots.map((s, i) => s.options[picked[i] ?? 0]).join(" ");
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
                  key={o}
                  active={picked[i] === j}
                  onClick={() => setPicked(picked.map((p, k) => (k === i ? j : p)))}
                >
                  {o}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => speak(sentence)}
        className="mt-3 w-full rounded-card bg-sage-soft px-4 py-3 text-left text-lg font-semibold text-sage-deep"
      >
        {sentence} <SpeakerHigh size={18} className="ml-1 inline" />
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
    <Card tone="lavender" className="border-transparent">
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
                    onClick={() => setAnswers(answers.map((x, k) => (k === i ? j : x)))}
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
        <Button full className="mt-4" onClick={() => onDone?.(correct === questions.length)}>
          {correct}/{questions.length} richtig · {t("lectures.gotIt")}
        </Button>
      )}
    </Card>
  );
}
