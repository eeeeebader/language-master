import type { StoryTheme } from "@lm/schema";
import { Archive, BookOpenText, CaretRight, Coins, Sparkle } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { z } from "zod";
import { PurchaseSheet } from "@/components/PurchaseSheet";
import { Button, Card, Chip, Page, ProgressBar, Sheet } from "@/components/ui";
import { GRAMMAR_FOCI_ES, THEME_LABELS } from "@/data/stories-es";
import { db } from "@/db/db";
import { useBilling } from "@/hooks/useBilling";
import { isCloudEnabled } from "@/lib/auth";
import { computeCoverage } from "@/lib/coverage";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { GENERATE_ERRORS, generateStory } from "@/lib/stories";

const Search = z.object({ checkout: z.enum(["success", "cancel"]).optional() });

export const Route = createFileRoute("/stories/")({ component: Stories, validateSearch: Search });

function Stories() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { billing, refresh } = useBilling();
  const stories = useLiveQuery(() => db.stories.filter((s) => !s.archived).toArray(), []) ?? [];
  const archived = useLiveQuery(() => db.stories.filter((s) => s.archived).toArray(), []) ?? [];
  const [showArchive, setShowArchive] = useState(false);
  const [purchase, setPurchase] = useState<{ open: boolean; reason?: string }>({ open: false });
  const [archivePick, setArchivePick] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const activeAi = stories.filter((s) => s.source === "ai");
  const atStoryLimit = activeAi.length >= billing.active_story_limit;

  // Back from Stripe Checkout: the webhook has (or will have) written the entitlement.
  useEffect(() => {
    if (!search.checkout) return;
    if (search.checkout === "success") {
      setToast("Danke! Dein Kauf wird gutgeschrieben …");
      refresh();
      const again = setTimeout(refresh, 4000);
      return () => clearTimeout(again);
    }
    setToast("Kauf abgebrochen.");
  }, [search.checkout, refresh]);
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(tm);
  }, [toast]);
  const progress = useLiveQuery(() => db.storyProgress.toArray(), []) ?? [];
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).toArray(), []) ?? [];
  const coverage = useLiveQuery(async () => {
    const words = await db.words.toArray();
    const states = await db.cardStates.toArray();
    const all = await db.stories.toArray();
    return Object.fromEntries(all.map((s) => [s.id, computeCoverage(s, words, states)]));
  }, []);

  const [novelty, setNovelty] = useState(0.1);
  const [failed, setFailed] = useState<"off" | "few" | "some" | "many">("few");
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [length, setLength] = useState<1 | 2 | 3>(1);
  const [theme, setTheme] = useState<StoryTheme>("daily_shopping");
  const [grammar, setGrammar] = useState(GRAMMAR_FOCI_ES[0] as string);
  const [sources, setSources] = useState<Set<string>>(new Set());
  const expectedNew = Math.round(([350, 750, 1200][length - 1] as number) * novelty * 0.6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive(id: string) {
    await db.stories.update(id, { archived: true });
    setArchivePick(false);
  }

  async function generate() {
    if (atStoryLimit) {
      setArchivePick(true);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await generateStory({
      language: "es",
      native: "de",
      novelty,
      failedWords: failed,
      pickedFailed: [],
      level,
      length,
      theme,
      grammarFocus: grammar,
      sourceLists: [...sources],
    });
    setBusy(false);
    if (r.ok) {
      play("levelup");
      refresh();
      navigate({ to: "/stories/$storyId", params: { storyId: r.storyId } });
    } else if (r.error === "no_tokens" || r.error === "daily_free_used") {
      refresh();
      setPurchase({ open: true, reason: GENERATE_ERRORS[r.error] });
    } else {
      const key =
        r.error === "generation_failed" && r.refunded ? "generation_failed_refunded" : r.error;
      setError(GENERATE_ERRORS[key] ?? `${r.error}${r.reason ? `: ${r.reason}` : ""}`);
    }
  }

  return (
    <Page title={t("stories.title")}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {t("stories.library")}
      </h2>
      <div className="mb-6 grid gap-2">
        {stories.map((s) => {
          const p = progress.find((x) => x.storyId === s.id);
          const c = coverage?.[s.id];
          const pct = c?.total ? Math.round(((c.known + c.learning) / c.total) * 100) : 0;
          return (
            <Card
              key={s.id}
              className="flex items-center gap-3"
              onClick={() => navigate({ to: "/stories/$storyId", params: { storyId: s.id } })}
            >
              <BookOpenText size={28} weight="duotone" className="text-sky-deep" />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{s.title}</div>
                <div className="text-sm text-ink-2">
                  {THEME_LABELS[s.theme] ?? s.theme} · {s.grammarFocus} ·{" "}
                  {s.source === "official" ? "Offizieller Text" : "KI"}
                  {p?.finishedAt && <span className="ml-1 text-sage-deep">· gelesen</span>}
                </div>
                {c && (
                  <div className="mt-2">
                    <ProgressBar
                      parts={[
                        { value: c.known, colour: "sage" },
                        { value: c.learning, colour: "sky" },
                        { value: c.struggling, colour: "amber" },
                        { value: c.new, colour: "line" },
                      ]}
                    />
                    <div className="mt-1 text-xs text-ink-3">
                      {t("stories.coverage")} {pct} % · {c.new} {t("stories.newWords")}
                    </div>
                  </div>
                )}
              </div>
              <CaretRight className="text-ink-3" />
            </Card>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            className="mb-2 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-ink-3"
            onClick={() => setShowArchive((v) => !v)}
          >
            <Archive size={14} /> Archiv ({archived.length}) {showArchive ? "▴" : "▾"}
          </button>
          {showArchive &&
            archived.map((s) => (
              <Card
                key={s.id}
                className="mb-2 flex items-center gap-3"
                onClick={() => navigate({ to: "/stories/$storyId", params: { storyId: s.id } })}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{s.title}</div>
                  <div className="text-sm text-ink-2">
                    {THEME_LABELS[s.theme] ?? s.theme} ·{" "}
                    {new Date(s.createdAt).toLocaleDateString("de-DE")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    db.stories.update(s.id, { archived: false });
                  }}
                >
                  Wiederherstellen
                </Button>
              </Card>
            ))}
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {t("stories.new")}
      </h2>
      {isCloudEnabled && (
        <Card className="mb-3 flex items-center gap-3">
          <Coins size={24} className="text-amber-deep" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">
              {billing.free_left > 0
                ? `${billing.free_left} freie Geschichte heute`
                : "Freie Geschichte heute verbraucht"}{" "}
              · {billing.story_tokens} Tokens
              {billing.is_premium && (
                <span className="ml-1 rounded-chip bg-lavender-soft px-2 py-0.5 text-xs text-lavender-deep">
                  Premium
                </span>
              )}
            </div>
            <div className="text-ink-2">
              {activeAi.length}/{billing.active_story_limit} aktive Geschichten
              {billing.is_premium ? "" : " (kostenlos)"}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setPurchase({ open: true })}>
            {billing.is_premium ? "Tokens" : "Premium"}
          </Button>
        </Card>
      )}
      {!isCloudEnabled && (
        <Card tone="sky" className="mb-3 border-transparent text-sm">
          <Sparkle className="mr-1 inline" /> {t("stories.offlineNote")}
        </Card>
      )}

      <Card className="mb-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">{t("stories.novelty")}</span>
          <span className="text-sm text-ink-2">
            ≈ {Math.round((1 - novelty) * 100)} % bekannt · ≈ {expectedNew} neue Wörter
          </span>
        </div>
        <input
          type="range"
          min={0.02}
          max={0.2}
          step={0.01}
          value={novelty}
          onChange={(e) => setNovelty(Number(e.target.value))}
          className="mt-2 w-full accent-sky-deep"
        />
        <div className="flex justify-between text-xs text-ink-3">
          <span>sanft</span>
          <span>Immersion</span>
        </div>
      </Card>

      <Card className="mb-3">
        <div className="mb-2 font-bold">{t("stories.failed")}</div>
        <div className="flex gap-2">
          {(["off", "few", "some", "many"] as const).map((f) => (
            <Chip key={f} active={failed === f} onClick={() => setFailed(f)}>
              {{ off: "aus", few: "wenige (3)", some: "einige (6)", many: "viele (10)" }[f]}
            </Chip>
          ))}
        </div>
      </Card>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Card>
          <div className="mb-2 font-bold">{t("stories.level")}</div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <Chip key={n} active={level === n} onClick={() => setLevel(n)}>
                {n}
              </Chip>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-2 font-bold">{t("stories.length")}</div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n) => (
              <Chip key={n} active={length === n} onClick={() => setLength(n)}>
                {[5, 10, 15][n - 1]} min
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mb-3">
        <div className="mb-2 font-bold">{t("stories.theme")}</div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(THEME_LABELS) as StoryTheme[]).map((k) => (
            <Chip key={k} active={theme === k} onClick={() => setTheme(k)}>
              {THEME_LABELS[k]}
            </Chip>
          ))}
        </div>
      </Card>

      <Card className="mb-3">
        <div className="mb-2 font-bold">{t("stories.grammar")}</div>
        <div className="flex flex-wrap gap-2">
          {GRAMMAR_FOCI_ES.map((g) => (
            <Chip key={g} active={grammar === g} onClick={() => setGrammar(g)}>
              {g}
            </Chip>
          ))}
        </div>
      </Card>

      <Card className="mb-5">
        <div className="mb-2 font-bold">{t("stories.sources")}</div>
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => (
            <Chip
              key={l.id}
              active={sources.has(l.id)}
              tone={sources.has(l.id) ? undefined : l.colour}
              onClick={() => {
                const n = new Set(sources);
                n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                setSources(n);
              }}
            >
              {l.title}
            </Chip>
          ))}
        </div>
      </Card>

      {error && (
        <p className="mb-2 rounded-card bg-rose-soft p-3 text-sm text-rose-deep">{error}</p>
      )}
      <Button full size="lg" disabled={!isCloudEnabled || busy} onClick={generate}>
        <Sparkle /> {busy ? "Wird erstellt …" : t("stories.generate")}
      </Button>

      <PurchaseSheet
        open={purchase.open}
        reason={purchase.reason}
        billing={billing}
        onClose={() => setPurchase({ open: false })}
      />

      <Sheet open={archivePick} onClose={() => setArchivePick(false)} title="Platz schaffen">
        <p className="mb-3 text-sm text-ink-2">
          {billing.is_premium
            ? `Premium hält bis zu ${billing.active_story_limit} Geschichten je Sprache.`
            : `Kostenlos bleiben ${billing.active_story_limit} Geschichten aktiv. Welche möchtest du archivieren? Premium erweitert das Archiv auf 50 je Sprache.`}
        </p>
        <div className="grid gap-2">
          {activeAi.map((s) => (
            <Card key={s.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-bold">{s.title}</div>
                <div className="text-sm text-ink-2">
                  {new Date(s.createdAt).toLocaleDateString("de-DE")}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => archive(s.id)}>
                Archivieren
              </Button>
            </Card>
          ))}
        </div>
        {!billing.is_premium && (
          <Button
            full
            variant="ghost"
            className="mt-3"
            onClick={() => {
              setArchivePick(false);
              setPurchase({ open: true });
            }}
          >
            Premium ansehen
          </Button>
        )}
      </Sheet>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper animate-pop">
          {toast}
        </div>
      )}
    </Page>
  );
}
