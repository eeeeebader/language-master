import {
  ArrowLeft,
  CaretRight,
  DotsThreeVertical,
  DownloadSimple,
  ShareNetwork,
  Trash,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Card, Chip, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { softDeleteList } from "@/db/repo";
import { t } from "@/lib/i18n";
import { RATING_TONE, rateWord } from "@/lib/rating";

export const Route = createFileRoute("/karteikarten/lists/$listId")({ component: ListDetail });

function ListDetail() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
  const [menu, setMenu] = useState(false);

  async function exportList() {
    if (!list || !rows) return;
    const sentences = await db.sentences
      .where("wordId")
      .anyOf(rows.map((r) => r.w.id))
      .toArray();
    const payload = {
      title: list.title,
      language: list.language,
      exportedAt: new Date().toISOString(),
      words: rows.map(({ w, variants }) => ({
        lemma: w.lemma,
        translation: w.translation,
        pos: w.pos,
        variants: variants.map((v) => ({ front: v.front, back: v.back })),
        sentences: sentences
          .filter((x) => x.wordId === w.id)
          .map((x) => ({ text: x.text, translation: x.translation })),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${list.title.replace(/[^\w-]+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenu(false);
  }

  async function deleteList() {
    if (!list) return;
    if (!confirm(`„${list.title}“ löschen? Wörter bleiben erhalten.`)) return;
    await softDeleteList(list.id);
    navigate({ to: "/karteikarten" });
  }
  const rows = useLiveQuery(async () => {
    const lw = (await db.listWords.where("listId").equals(listId).toArray()).sort(
      (a, b) => a.position - b.position,
    );
    const words = await db.words.bulkGet(lw.map((x) => x.wordId));
    const now = new Date();
    const out = [];
    for (const w of words) {
      if (!w) continue;
      const variants = await db.variants.where("wordId").equals(w.id).toArray();
      const states = (await db.cardStates.bulkGet(variants.map((v) => v.id))).filter((s) => !!s);
      out.push({ w, variants, ...rateWord(states, now) });
    }
    return out;
  }, [listId]);

  return (
    <Page
      title={list?.title ?? ""}
      back={
        <Link to="/karteikarten" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
      action={
        !list?.isSystem && (
          <div className="relative">
            <button
              type="button"
              className="rounded-full p-2 hover:bg-paper-2"
              aria-label="Menü"
              onClick={() => setMenu((m) => !m)}
            >
              <DotsThreeVertical size={22} weight="bold" />
            </button>
            {menu && (
              <>
                <button
                  type="button"
                  aria-label="Menü schließen"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMenu(false)}
                />
                <div className="absolute right-0 z-40 mt-1 w-60 overflow-hidden rounded-card border border-line bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2"
                    onClick={exportList}
                  >
                    <DownloadSimple size={18} /> {t("list.export")}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-ink-3"
                  >
                    <ShareNetwork size={18} />
                    <span>
                      {t("list.share")}
                      <span className="block text-xs">{t("list.shareSoon")}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-rose-deep hover:bg-rose-soft"
                    onClick={deleteList}
                  >
                    <Trash size={18} /> {t("list.delete")}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }
    >
      {list?.description && <p className="mb-3 text-ink-2">{list.description}</p>}
      {rows && rows.length === 0 && <Empty>{t("cards.empty")}</Empty>}
      <div className="grid gap-2">
        {rows?.map(({ w, variants, rating, retention }) => (
          <Card
            key={w.id}
            className="flex items-center gap-3"
            onClick={() =>
              navigate({ to: "/karteikarten/words/$wordId", params: { wordId: w.id } })
            }
          >
            <div className="min-w-0 flex-1">
              <div className="font-bold">
                {w.lemma} <span className="font-normal text-ink-2">· {w.translation}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {variants.map((v) => (
                  <span
                    key={v.id}
                    className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs text-ink-2"
                  >
                    {v.front}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <Chip tone={RATING_TONE[rating]} className="text-xs">
                {t(`cards.rating.${rating}` as "cards.rating.new")}
              </Chip>
              {retention !== null && (
                <div className="mt-1 text-[11px] text-ink-3">{Math.round(retention * 100)} %</div>
              )}
            </div>
            <CaretRight className="text-ink-3" />
          </Card>
        ))}
      </div>
    </Page>
  );
}
