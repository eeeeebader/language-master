import type { SessionMode } from "@lm/schema";
import { isDue } from "@lm/srs";
import { CaretRight, Plus, Trash } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button, Card, Chip, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { createList, softDeleteList } from "@/db/repo";
import { t } from "@/lib/i18n";
import type { Direction, Filter } from "@/lib/session-builder";

export const Route = createFileRoute("/karteikarten/")({ component: Karteikarten });

const MODES: { id: SessionMode; tone: "sage" | "rose" | "lavender" | "amber" | "sky" }[] = [
  { id: "classic", tone: "sage" },
  { id: "reaction", tone: "amber" },
  { id: "progressive", tone: "lavender" },
  { id: "forever", tone: "sky" },
];

function Karteikarten() {
  const navigate = useNavigate();
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).toArray(), []) ?? [];
  const counts =
    useLiveQuery(async () => {
      const now = new Date();
      const out: Record<string, { words: number; due: number }> = {};
      for (const l of await db.lists.filter((x) => !x.deletedAt).toArray()) {
        const lw = await db.listWords.where("listId").equals(l.id).toArray();
        const variants = await db.variants
          .where("wordId")
          .anyOf(lw.map((x) => x.wordId))
          .toArray();
        const states = await db.cardStates.bulkGet(variants.map((v) => v.id));
        out[l.id] = {
          words: lw.length,
          due: variants.filter((_, i) => isDue(states[i], now)).length,
        };
      }
      return out;
    }, []) ?? {};

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SessionMode>("reaction");
  const [filter, setFilter] = useState<Filter>("all");
  const [direction, setDirection] = useState<Direction>("t2n");
  const [sample, setSample] = useState<number>(0);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  async function create() {
    if (!newTitle.trim()) return;
    await createList(
      "es",
      newTitle.trim(),
      (["sage", "rose", "lavender", "amber", "sky"] as const)[lists.length % 5],
    );
    setNewTitle("");
    setCreating(false);
  }

  const canStart = mode === "forever" || selected.size > 0;
  function start() {
    navigate({
      to: "/karteikarten/session",
      search: { mode, lists: [...selected].join(","), filter, direction, sample, onboarding: 0 },
    });
  }

  return (
    <Page
      title={t("cards.title")}
      action={
        <Button size="sm" variant="secondary" onClick={() => setCreating((c) => !c)}>
          <Plus size={16} /> {t("cards.newList")}
        </Button>
      }
    >
      {creating && (
        <div className="mb-3 flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={t("cards.listTitle")}
            className="flex-1 rounded-chip border border-line bg-white px-4 py-2 outline-none focus:border-ink"
          />
          <Button size="sm" onClick={create}>
            {t("common.save")}
          </Button>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {t("cards.lists")}
      </h2>
      {lists.length === 0 && <Empty>{t("cards.noLists")}</Empty>}
      <div className="mb-6 grid gap-2">
        {lists.map((l) => {
          const c = counts[l.id] ?? { words: 0, due: 0 };
          const on = selected.has(l.id);
          return (
            <Card
              key={l.id}
              tone={on ? l.colour : undefined}
              className={on ? "border-transparent ring-2 ring-ink/80" : ""}
              onClick={() => toggle(l.id)}
            >
              <div className="flex items-center gap-3">
                <input type="checkbox" readOnly checked={on} className="h-5 w-5" />
                <div className="flex-1">
                  <div className="font-bold">{l.title}</div>
                  <div className="text-sm text-ink-2">
                    {t("cards.words", { n: c.words })} · {t("cards.due", { n: c.due })}
                  </div>
                </div>
                {!l.isSystem && (
                  <button
                    type="button"
                    className="rounded-full p-2 text-ink-3 hover:bg-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`„${l.title}“ löschen? Wörter bleiben erhalten.`))
                        softDeleteList(l.id);
                    }}
                  >
                    <Trash size={18} />
                  </button>
                )}
                <Link
                  to="/karteikarten/lists/$listId"
                  params={{ listId: l.id }}
                  className="rounded-full p-2 hover:bg-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CaretRight size={18} />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        {t("cards.session")}
      </h2>
      <div className="mb-3 grid grid-cols-2 gap-2">
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

      <div className="mb-3">
        <div className="mb-1 text-sm text-ink-2">{t("cards.filter")}</div>
        <div className="flex flex-wrap gap-2">
          {(["all", "due", "failed", "new"] as Filter[]).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
              {t(`cards.filter.${f}` as "cards.filter.all")}
            </Chip>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-1 text-sm text-ink-2">{t("cards.direction")}</div>
        <div className="flex gap-2">
          <Chip active={direction === "t2n"} onClick={() => setDirection("t2n")}>
            {t("cards.direction.t2n")}
          </Chip>
          <Chip active={direction === "n2t"} onClick={() => setDirection("n2t")}>
            {t("cards.direction.n2t")}
          </Chip>
        </div>
      </div>
      {mode !== "forever" && (
        <div className="mb-5">
          <div className="mb-1 text-sm text-ink-2">{t("cards.sample")}</div>
          <div className="flex gap-2">
            {[0, 10, 20, 50].map((n) => (
              <Chip key={n} active={sample === n} onClick={() => setSample(n)}>
                {n === 0 ? t("cards.sampleAll") : n}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {!canStart && <p className="mb-2 text-sm text-ink-3">{t("cards.selectLists")}</p>}
      <Button full size="lg" disabled={!canStart} onClick={start}>
        {t("common.start")}
      </Button>
    </Page>
  );
}
