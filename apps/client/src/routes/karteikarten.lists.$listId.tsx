import { isMastered, retrievability } from "@lm/srs";
import { ArrowLeft, X } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { removeFromList } from "@/db/repo";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/karteikarten/lists/$listId")({ component: ListDetail });

function ListDetail() {
  const { listId } = Route.useParams();
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
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
      const r = states.length ? Math.max(...states.map((s) => retrievability(s, now))) : null;
      out.push({ w, variants, mastered: states.some(isMastered), r });
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
    >
      {list?.description && <p className="mb-3 text-ink-2">{list.description}</p>}
      {rows && rows.length === 0 && <Empty>{t("cards.empty")}</Empty>}
      <div className="grid gap-2">
        {rows?.map(({ w, variants, mastered, r }) => (
          <Card key={w.id} className="flex items-center gap-3">
            <div className="flex-1">
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
            <div className="text-right text-xs text-ink-3">
              {mastered ? (
                <span className="rounded-chip bg-sage-soft px-2 py-0.5 font-semibold text-sage-deep">
                  gemeistert
                </span>
              ) : r !== null ? (
                `${Math.round(r * 100)} %`
              ) : (
                "neu"
              )}
            </div>
            <button
              type="button"
              className="rounded-full p-1.5 text-ink-3 hover:bg-paper-2"
              onClick={() => removeFromList(listId, w.id)}
              aria-label="Entfernen"
            >
              <X size={16} />
            </button>
          </Card>
        ))}
      </div>
    </Page>
  );
}
