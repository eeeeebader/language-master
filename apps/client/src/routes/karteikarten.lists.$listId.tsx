import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Chip, Empty, Page } from "@/components/ui";
import { db } from "@/db/db";
import { t } from "@/lib/i18n";
import { RATING_TONE, rateWord } from "@/lib/rating";

export const Route = createFileRoute("/karteikarten/lists/$listId")({ component: ListDetail });

function ListDetail() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
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
