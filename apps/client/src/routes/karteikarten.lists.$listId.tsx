import type { DictionaryEntry } from "@lm/schema";
import { normaliseAnswer } from "@lm/srs";
import {
  ArrowLeft,
  CaretRight,
  DotsThreeVertical,
  DownloadSimple,
  PencilSimple,
  Plus,
  ShareNetwork,
  Trash,
} from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Button, Card, Chip, Empty, Page, Sheet } from "@/components/ui";
import { db } from "@/db/db";
import {
  addDictionaryWord,
  addToList,
  ensureVariant,
  ensureWord,
  renameList,
  softDeleteList,
} from "@/db/repo";
import { searchDictionaryAsync } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { RATING_TONE, rateWord } from "@/lib/rating";
import { play } from "@/lib/sound";

export const Route = createFileRoute("/karteikarten/lists/$listId")({ component: ListDetail });

function ListDetail() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [back, setBack] = useState("");
  const [hits, setHits] = useState<DictionaryEntry[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    if (!adding) return;
    const id = ++seq.current;
    const tm = setTimeout(async () => {
      const r = q.trim() ? await searchDictionaryAsync(q.trim(), 6) : [];
      if (id === seq.current) setHits(r);
    }, 120);
    return () => clearTimeout(tm);
  }, [q, adding]);

  async function saveTitle() {
    if (!title.trim()) return;
    await renameList(listId, title.trim());
    setRenaming(false);
  }

  async function addFromDictionary(e: DictionaryEntry) {
    const gloss = e.glosses
      .map((g) => g.text)
      .slice(0, 2)
      .join(", ");
    const useArticle = !!e.article && e.pos === "noun";
    await addDictionaryWord(
      e,
      [
        {
          kind: useArticle ? "article" : "lemma",
          front: useArticle ? `${e.article} ${e.lemma}` : e.lemma,
          back: gloss,
        },
      ],
      listId,
    );
    play("add");
    setQ("");
    setBack("");
    setAdding(false);
  }

  async function addCustomWord() {
    if (!q.trim() || !back.trim()) return;
    const w = await ensureWord({
      language: "es",
      lemma: q.trim(),
      translation: back.trim(),
      pos: "other",
    });
    await ensureVariant(w.id, "custom", q.trim(), back.trim());
    await addToList(listId, w.id);
    play("add");
    setQ("");
    setBack("");
    setAdding(false);
  }

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
  const [query, setQuery] = useState("");
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
                    onClick={() => {
                      setTitle(list?.title ?? "");
                      setRenaming(true);
                      setMenu(false);
                    }}
                  >
                    <PencilSimple size={18} /> {t("list.rename")}
                  </button>
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left hover:bg-paper-2"
                    onClick={() => {
                      setAdding(true);
                      setMenu(false);
                    }}
                  >
                    <Plus size={18} /> {t("list.addWord")}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }
    >
      {list?.description && <p className="mb-3 text-ink-2">{list.description}</p>}
      {rows && rows.length > 5 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("list.search")}
          className="mb-3 w-full rounded-chip border border-line bg-white px-4 py-2 outline-none focus:border-ink"
        />
      )}
      {rows && rows.length === 0 && <Empty>{t("cards.empty")}</Empty>}
      <div className="grid gap-2">
        {rows
          ?.filter(({ w, variants }) => {
            const q = normaliseAnswer(query);
            if (!q) return true;
            return (
              normaliseAnswer(w.lemma).includes(q) ||
              normaliseAnswer(w.translation).includes(q) ||
              variants.some((v) => normaliseAnswer(v.front).includes(q))
            );
          })
          .map(({ w, variants, rating, retention }) => (
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
        <button
          type="button"
          className="flex items-center justify-center gap-2 rounded-card border border-dashed border-line px-4 py-3 text-ink-2 hover:bg-white"
          onClick={() => setAdding(true)}
        >
          <Plus size={18} /> {t("list.addWord")}
        </button>
      </div>

      <Sheet open={renaming} onClose={() => setRenaming(false)} title={t("list.rename")}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveTitle()}
          className="mb-4 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <Button full disabled={!title.trim()} onClick={saveTitle}>
          {t("common.save")}
        </Button>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t("list.addWord")}>
        <p className="mb-2 text-sm text-ink-2">{t("list.addWord.hint")}</p>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Spanisch"
          autoCapitalize="off"
          className="mb-2 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        {hits.length > 0 && (
          <div className="mb-3 grid gap-1.5">
            {hits.map((e) => (
              <button
                type="button"
                key={e.id}
                className="flex items-center gap-2 rounded-card bg-white px-3 py-2 text-left hover:bg-paper-2"
                onClick={() => addFromDictionary(e)}
              >
                <span className="font-semibold">
                  {e.article ? `${e.article} ` : ""}
                  {e.lemma}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                  {e.glosses.map((g) => g.text).join(", ")}
                </span>
                <Plus size={16} className="text-sage-deep" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 text-sm text-ink-2">{t("list.addWord.custom")}</div>
        <input
          value={back}
          onChange={(e) => setBack(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomWord()}
          placeholder="Deutsch"
          className="my-2 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <Button
          full
          variant="secondary"
          disabled={!q.trim() || !back.trim()}
          onClick={addCustomWord}
        >
          {t("list.addWord.custom")}
        </Button>
      </Sheet>
    </Page>
  );
}
