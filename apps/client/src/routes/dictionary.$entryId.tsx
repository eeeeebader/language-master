import { ArrowLeft, Plus, SpeakerHigh } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Page } from "@/components/ui";
import { VariantPicker } from "@/components/VariantPicker";
import { getEntry } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { speak } from "@/lib/tts";

export const Route = createFileRoute("/dictionary/$entryId")({ component: Entry });

const PERSONS = ["yo", "tú", "él / ella / usted", "nosotros", "vosotros", "ellos / ustedes"];

function Entry() {
  const { entryId } = Route.useParams();
  const e = getEntry(entryId);
  const [pick, setPick] = useState<string | null>(null);
  if (!e) return <Page title="?">Eintrag nicht gefunden.</Page>;

  return (
    <Page
      back={
        <Link to="/dictionary" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-extrabold">
            {e.article && <span className="font-normal text-ink-2">{e.article} </span>}
            {e.lemma}
          </h1>
          <button
            type="button"
            className="rounded-full bg-sky-soft p-2 text-sky-deep"
            onClick={() => speak(e.lemma)}
            aria-label="Aussprache"
          >
            <SpeakerHigh size={20} />
          </button>
          <button
            type="button"
            className="ml-auto rounded-full bg-sage-soft p-2 text-sage-deep"
            onClick={() => setPick("lemma")}
            aria-label={t("dict.addToList")}
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>
        <div className="mt-1 text-ink-2">
          {e.ipa && <span className="mr-2 font-mono">/{e.ipa}/</span>}
          <span className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs">{e.pos}</span>
          {e.gender && (
            <span className="ml-1 rounded-chip bg-rose-soft px-2 py-0.5 text-xs text-rose-deep">
              {e.gender === "m" ? "maskulin" : e.gender === "f" ? "feminin" : "m/f"}
            </span>
          )}
        </div>
      </div>

      <Card className="mb-3">
        {e.glosses.map((g) => (
          <div key={g.text} className="py-1">
            <span className="text-lg font-semibold">{g.text}</span>
            {g.note && <span className="ml-2 text-sm text-ink-2">({g.note})</span>}
          </div>
        ))}
      </Card>

      {(e.plural || e.genderPair) && (
        <Card className="mb-3 grid gap-2">
          {e.plural && (
            <Row
              label={t("dict.variant.plural")}
              value={e.plural}
              onAdd={() => setPick("plural")}
            />
          )}
          {e.genderPair && (
            <Row
              label={t("dict.variant.gender_pair")}
              value={`${e.genderPair[0]} / ${e.genderPair[1]}`}
              onAdd={() => setPick("gender_pair")}
            />
          )}
        </Card>
      )}

      {e.conjugations &&
        Object.entries(e.conjugations).map(([tense, forms]) => (
          <Card key={tense} className="mb-3">
            <div className="mb-2 font-bold">
              {t("dict.conjugation")} · {tense}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {forms.map((f, i) => (
                <div
                  key={`${tense}-${PERSONS[i]}`}
                  className="flex items-center justify-between rounded-chip px-2 py-1 hover:bg-paper-2"
                >
                  <span>
                    <span className="text-ink-3">{PERSONS[i]} </span>
                    <span className="font-semibold text-sage-deep">{f}</span>
                  </span>
                  <button
                    type="button"
                    className="text-ink-3"
                    onClick={() => setPick("conjugation")}
                    aria-label={t("dict.addToList")}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))}

      {e.examples.length > 0 && (
        <Card className="mb-3">
          <div className="mb-2 font-bold">{t("dict.examples")}</div>
          {e.examples.map((ex) => (
            <div key={ex.text} className="py-1.5">
              <div className="flex items-center gap-2 font-medium">
                {ex.text}
                <button
                  type="button"
                  className="text-sky-deep"
                  onClick={() => speak(ex.text)}
                  aria-label="Aussprache"
                >
                  <SpeakerHigh size={16} />
                </button>
              </div>
              <div className="text-sm text-ink-2">{ex.translation}</div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-ink-3">
        Wörterbuchdaten: Wiktionary und WikDict, CC BY-SA 4.0; Häufigkeiten: FrequencyWords (MIT).
      </p>
      <VariantPicker
        entry={pick ? e : null}
        open={!!pick}
        onClose={() => setPick(null)}
        preselect={pick ?? undefined}
      />
    </Page>
  );
}

function Row({ label, value, onAdd }: { label: string; value: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs text-ink-3">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
      <button
        type="button"
        className="rounded-full bg-sage-soft p-2 text-sage-deep"
        onClick={onAdd}
        aria-label={t("dict.addToList")}
      >
        <Plus size={16} weight="bold" />
      </button>
    </div>
  );
}
