import { isDue } from "@lm/srs";
import { CaretRight, Plus, Trash } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Button, Card, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { createList, softDeleteList } from "@/db/repo";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/karteikarten/")({ component: Karteikarten });

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
        const dueWords = new Set(
          variants.filter((_, i) => isDue(states[i], now)).map((v) => v.wordId),
        );
        out[l.id] = { words: lw.length, due: dueWords.size };
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
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 px-4">
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
