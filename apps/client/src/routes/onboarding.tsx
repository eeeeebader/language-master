import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, Page } from "@/components/ui";
import { DICTIONARY_ES, STARTER_LEMMAS } from "@/data/dictionary-es";
import { db } from "@/db/db";
import {
  addDictionaryWord,
  createList,
  createSettings,
  getSettings,
  saveSettings,
} from "@/db/repo";
import { usePackState } from "@/hooks/usePack";
import { variantOptions } from "@/lib/dictionary";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

async function createStarterList() {
  const existing = await db.lists.filter((l) => l.isSystem && l.title === "Erste Wörter").first();
  if (existing) return existing;
  const list = await createList(
    "es",
    "Erste Wörter",
    "amber",
    true,
    "Dich vorstellen: die ersten Überlebenswörter.",
  );
  for (const lemma of STARTER_LEMMAS) {
    const e = DICTIONARY_ES.find((d) => d.lemma === lemma);
    if (!e) continue;
    const opts = variantOptions(e);
    const chosen = opts
      .filter(
        (o) =>
          o.kind === "lemma" ||
          o.kind === "gender_pair" ||
          (o.kind === "article" && e.pos === "noun"),
      )
      .filter((o) => !(o.kind === "lemma" && opts.some((x) => x.kind === "article")));
    await addDictionaryWord(
      e,
      chosen.map(({ kind, front, back }) => ({ kind, front, back })),
      list.id,
    );
  }
  return list;
}

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [over16, setOver16] = useState<boolean | null>(null);
  const [legal, setLegal] = useState(false);
  const [busy, setBusy] = useState(false);
  const pack = usePackState();
  const pct =
    pack.status === "downloading"
      ? Math.round((pack.received / Math.max(1, pack.total)) * 100)
      : null;

  async function finish(startSession: boolean) {
    setBusy(true);
    if (!(await getSettings()))
      await createSettings({ username: name.trim() || "Lernende*r", isOver16: true });
    await saveSettings({ onboardingDone: true });
    const list = await createStarterList();
    if (startSession)
      navigate({
        to: "/karteikarten/session",
        search: {
          mode: "classic",
          lists: list.id,
          filter: "all",
          direction: "t2n",
          sample: 0,
          onboarding: 1,
        },
      });
    else navigate({ to: "/tour" });
  }

  return (
    <Page>
      <div className="mx-auto mt-6 max-w-md">
        <div className="mb-6 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-chip ${i <= step ? "bg-ink" : "bg-line"}`}
            />
          ))}
        </div>

        {step === 0 && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("onb.welcome")}</h1>
            <p className="mt-2 text-ink-2">{t("onb.tagline")}</p>
            <label htmlFor="username" className="mt-8 block font-semibold">
              {t("onb.username")}
            </label>
            <input
              id="username"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              className="mt-2 w-full rounded-card border border-line bg-white px-4 py-3 text-lg outline-none focus:border-ink"
              placeholder="Elias"
            />
            <p className="mt-3 text-sm text-ink-3">{t("onb.noAccount")}</p>
            <Button
              full
              size="lg"
              className="mt-8"
              disabled={!name.trim()}
              onClick={() => setStep(1)}
            >
              {t("common.next")}
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("onb.languages")}</h1>
            <Card className="mt-6">
              <div className="text-sm text-ink-2">{t("onb.native")}</div>
              <div className="text-xl font-bold">🇩🇪 Deutsch</div>
            </Card>
            <Card className="mt-3">
              <div className="text-sm text-ink-2">{t("onb.target")}</div>
              <div className="text-xl font-bold">🇪🇸 Español</div>
            </Card>
            <p className="mt-3 text-sm text-ink-3">
              Weitere Sprachen folgen, sobald ihre Wörterbuchpakete fertig sind.
            </p>
            <Button full size="lg" className="mt-8" onClick={() => setStep(2)}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">Kurz noch</h1>
            <label className="mt-6 flex items-start gap-3 rounded-card border border-line bg-white p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={over16 === true}
                onChange={(e) => setOver16(e.target.checked ? true : null)}
              />
              <span className="font-medium">{t("onb.age")}</span>
            </label>
            <label className="mt-3 flex items-start gap-3 rounded-card border border-line bg-white p-4">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={legal}
                onChange={(e) => setLegal(e.target.checked)}
              />
              <span className="font-medium">
                Ich akzeptiere die{" "}
                <a className="underline" href="/legal/agb" target="_blank" rel="noreferrer">
                  AGB
                </a>{" "}
                und die{" "}
                <a className="underline" href="/legal/datenschutz" target="_blank" rel="noreferrer">
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>
            <button
              type="button"
              className="mt-3 text-sm text-ink-3 underline"
              onClick={() => setOver16(false)}
            >
              Ich bin jünger als 16
            </button>
            {over16 === false && (
              <p className="mt-3 rounded-card bg-rose-soft p-3 text-rose-deep">
                {t("onb.ageRefused")}
              </p>
            )}
            <Button
              full
              size="lg"
              className="mt-8"
              disabled={over16 !== true || !legal}
              onClick={() => setStep(3)}
            >
              {t("common.next")}
            </Button>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("onb.firstSession")}</h1>
            <Card tone="sage" className="mt-6 border-transparent">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-sage-deep"
                  style={{
                    background:
                      pct !== null
                        ? `conic-gradient(var(--color-sage-deep) ${pct}%, white 0)`
                        : "white",
                  }}
                >
                  {pct !== null ? `${pct}%` : "✓"}
                </div>
                <div>
                  <div className="font-bold">{t("onb.dictionary")}</div>
                  <div className="text-sm text-ink-2">
                    {pack.status === "ready"
                      ? `Paket v${pack.version} geladen – ${pack.lemmas.toLocaleString("de-DE")} Wörter offline.`
                      : pct !== null
                        ? "Wird geladen – du kannst schon loslegen."
                        : t("onb.dictionaryReady")}
                  </div>
                </div>
              </div>
            </Card>
            <p className="mt-6 text-ink-2">{t("onb.firstSessionHint")}</p>
            <p className="mt-2 italic text-ink-2">
              ¡Hola! Me llamo {name.trim() || "…"}. Me encanta aprender idiomas nuevos.
            </p>
            <Button full size="lg" className="mt-8" disabled={busy} onClick={() => finish(true)}>
              {t("common.start")}
            </Button>
            <Button
              full
              variant="ghost"
              className="mt-2"
              disabled={busy}
              onClick={() => finish(false)}
            >
              {t("common.skip")}
            </Button>
          </>
        )}
      </div>
    </Page>
  );
}
