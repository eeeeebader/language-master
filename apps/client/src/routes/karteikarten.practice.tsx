import type { SessionMode } from "@lm/schema";
import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { z } from "zod";
import { Button, Card, Chip, Page } from "@/components/ui";
import { db } from "@/db/db";
import { t } from "@/lib/i18n";
import type { Direction, Focus } from "@/lib/session-builder";

const Search = z.object({ lists: z.string().default("") });

export const Route = createFileRoute("/karteikarten/practice")({
  component: Practice,
  validateSearch: Search,
});

const MODES: { id: SessionMode; tone: "sage" | "rose" | "lavender" | "amber" | "sky" }[] = [
  { id: "classic", tone: "sage" },
  { id: "reaction", tone: "amber" },
  { id: "progressive", tone: "lavender" },
  { id: "forever", tone: "sky" },
];
const SAMPLES = [0, 15, 25, 50, 75, 100, 150, 200, 250];
const FOCUS: Focus[] = ["new", "easy", "ok", "hard", "failed"];
const OVERVIEWS = [0, 10, 15, 20];

function Practice() {
  const { lists: listParam } = Route.useSearch();
  const navigate = useNavigate();
  const listIds = listParam.split(",").filter(Boolean);
  const lists =
    useLiveQuery(() => db.lists.where("id").anyOf(listIds).toArray(), [listParam]) ?? [];
  const wordCount =
    useLiveQuery(async () => {
      const lw = await db.listWords.where("listId").anyOf(listIds).toArray();
      return new Set(lw.map((x) => x.wordId)).size;
    }, [listParam]) ?? 0;

  const [mode, setMode] = useState<SessionMode>("reaction");
  const [direction, setDirection] = useState<Direction>("both");
  const [sample, setSample] = useState(0);
  const [overview, setOverview] = useState(10);
  const [focus, setFocus] = useState<Set<Focus>>(new Set());
  const toggleFocus = (f: Focus) => {
    const n = new Set(focus);
    if (n.has(f)) n.delete(f);
    else n.add(f);
    setFocus(n);
  };
  const directional = mode === "progressive" || mode === "forever";

  function start() {
    navigate({
      to: "/karteikarten/session",
      search: {
        mode,
        lists: listIds.join(","),
        filter: "all",
        direction: directional ? direction : "t2n",
        sample,
        overview,
        focus: [...focus].join(","),
        onboarding: 0,
      },
    });
  }

  return (
    <Page
      title={t("cards.practiceSetup")}
      back={
        <Link to="/karteikarten" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Card className="mb-4">
        <div className="mb-1 text-sm text-ink-2">{t("cards.selectedLists")}</div>
        <div className="flex flex-wrap gap-1.5">
          {lists.map((l) => (
            <Chip key={l.id} tone={l.colour}>
              {l.title}
            </Chip>
          ))}
        </div>
        <div className="mt-2 text-sm text-ink-3">{t("cards.words", { n: wordCount })}</div>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {t("cards.mode")}
      </h2>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {MODES.map((m) => (
          <Card
            key={m.id}
            tone={mode === m.id ? m.tone : undefined}
            className={mode === m.id ? "border-transparent ring-2 ring-ink/80" : ""}
            onClick={() => setMode(m.id)}
          >
            <div className="font-bold">{t(`cards.mode.${m.id}` as "cards.mode.classic")}</div>
            <div className="text-xs text-ink-2">
              {t(`cards.mode.${m.id}.hint` as "cards.mode.classic.hint")}
            </div>
          </Card>
        ))}
      </div>

      {directional && (
        <div className="mb-4">
          <div className="mb-1 text-sm text-ink-2">{t("cards.direction")}</div>
          <div className="flex flex-wrap gap-2">
            {(["both", "t2n", "n2t"] as Direction[]).map((d) => (
              <Chip key={d} active={direction === d} onClick={() => setDirection(d)}>
                {t(`cards.direction.${d}` as "cards.direction.both")}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {mode !== "forever" && (
        <div className="mb-4">
          <div className="mb-1 text-sm text-ink-2">{t("cards.sample")}</div>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((n) => (
              <Chip key={n} active={sample === n} onClick={() => setSample(n)}>
                {n === 0 ? t("cards.sampleAll") : n}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="mb-1 text-sm text-ink-2">{t("cards.focus")}</div>
        <div className="flex flex-wrap gap-2">
          <Chip active={focus.size === 0} onClick={() => setFocus(new Set())}>
            {t("cards.focus.all")}
          </Chip>
          {FOCUS.map((f) => (
            <Chip key={f} active={focus.has(f)} onClick={() => toggleFocus(f)}>
              {t(`cards.focus.${f}` as "cards.focus.new")}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <div className="mb-1 text-sm text-ink-2">{t("cards.overview")}</div>
        <div className="flex flex-wrap gap-2">
          {OVERVIEWS.map((n) => (
            <Chip key={n} active={overview === n} onClick={() => setOverview(n)}>
              {n === 0 ? t("cards.overview.off") : `alle ${n}`}
            </Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">{t("cards.overviewHint")}</p>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 px-4">
        <div className="mx-auto max-w-lg">
          <Button
            full
            size="lg"
            className="shadow-lg"
            disabled={listIds.length === 0 || wordCount === 0}
            onClick={start}
          >
            {t("common.start")}
          </Button>
        </div>
      </div>
    </Page>
  );
}
