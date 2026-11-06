import type { CardState } from "@lm/schema";
import { isDue } from "@lm/srs";
import { CaretRight, Plus } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button, Card, cx, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { createList } from "@/db/repo";
import { t } from "@/lib/i18n";
import { type Rating, rateWord } from "@/lib/rating";

export const Route = createFileRoute("/karteikarten/")({ component: Karteikarten });

interface ListStats {
  words: number;
  due: number;
  new: number;
  weak: number;
  ok: number;
  strong: number;
}
const EMPTY_STATS: ListStats = { words: 0, due: 0, new: 0, weak: 0, ok: 0, strong: 0 };
const STAT_TONE: Record<Rating, string> = {
  new: "bg-sky-soft text-sky-deep",
  weak: "bg-rose-soft text-rose-deep",
  ok: "bg-amber-soft text-amber-deep",
  strong: "bg-sage-soft text-sage-deep",
};

function Karteikarten() {
  const navigate = useNavigate();
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).toArray(), []) ?? [];
  const counts =
    useLiveQuery(async () => {
      const now = new Date();
      const out: Record<string, ListStats> = {};
      for (const l of await db.lists.filter((x) => !x.deletedAt).toArray()) {
        const lw = await db.listWords.where("listId").equals(l.id).toArray();
        const variants = await db.variants
          .where("wordId")
          .anyOf(lw.map((x) => x.wordId))
          .toArray();
        const states = await db.cardStates.bulkGet(variants.map((v) => v.id));
        const dueWords = new Set(
          variants.filter((_, i) => isDue(states[i], now)).map((v) => v.wordId),
        );
        const stats: ListStats = {
          words: lw.length,
          due: dueWords.size,
          new: 0,
          weak: 0,
          ok: 0,
          strong: 0,
        };
        for (const x of lw) {
          const ws = variants
            .map((v, i) => (v.wordId === x.wordId ? states[i] : undefined))
            .filter((s): s is CardState => !!s);
          stats[rateWord(ws, now).rating]++;
        }
        out[l.id] = stats;
      }
      return out;
    }, []) ?? {};

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const allSelected = lists.length > 0 && selected.size === lists.length;

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

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">
          {t("cards.lists")}
        </h2>
        {lists.length > 0 && (
          <button
            type="button"
            className="text-sm text-ink-2 underline"
            onClick={() => setSelected(allSelected ? new Set() : new Set(lists.map((l) => l.id)))}
          >
            {allSelected ? t("cards.deselectAll") : t("cards.selectAll")}
          </button>
        )}
      </div>
      {lists.length === 0 && <Empty>{t("cards.noLists")}</Empty>}
      <div className="grid gap-2 pb-24">
        {lists.map((l) => {
          const c = counts[l.id] ?? EMPTY_STATS;
          const on = selected.has(l.id);
          return (
            <Card
              key={l.id}
              tone={on ? l.colour : undefined}
              className={on ? "border-transparent ring-2 ring-ink/80" : ""}
              onClick={() => toggle(l.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-bold">{l.title}</div>
                  <div className="text-sm text-ink-2">
                    {t("cards.words", { n: c.words })} · {t("cards.due", { n: c.due })}
                  </div>
                  {c.words > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(["new", "weak", "ok", "strong"] as const).map((r) => (
                        <span
                          key={r}
                          className={cx(
                            "rounded-chip px-2 py-0.5 text-xs",
                            c[r] > 0 ? STAT_TONE[r] : "bg-paper-2 text-ink-3",
                          )}
                        >
                          {c[r]} {t(`cards.stat.${r}` as "cards.stat.new")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  to="/karteikarten/lists/$listId"
                  params={{ listId: l.id }}
                  className="rounded-full p-2 hover:bg-white"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={l.title}
                >
                  <CaretRight size={18} />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Bottom practice button, above the tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 px-4">
        <div className="mx-auto max-w-lg">
          <Button
            full
            size="lg"
            disabled={selected.size === 0}
            className="shadow-lg"
            onClick={() =>
              navigate({ to: "/karteikarten/practice", search: { lists: [...selected].join(",") } })
            }
          >
            {t("cards.practice")}
            {selected.size > 0 && ` · ${selected.size} ${selected.size === 1 ? "Liste" : "Listen"}`}
          </Button>
        </div>
      </div>
    </Page>
  );
}
