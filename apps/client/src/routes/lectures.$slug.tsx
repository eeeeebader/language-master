import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Block } from "@/components/LectureBlocks";
import { ListPicker } from "@/components/ListPicker";
import { Button, Page, Sheet } from "@/components/ui";
import { type VocabItem, VocabSheet } from "@/components/VocabSheet";
import { LECTURES_ES, lectureVocab } from "@/data/lectures-es";
import { db } from "@/db/db";
import {
  addDictionaryWord,
  addToList,
  createList,
  ensureVariant,
  ensureWord,
  markLectureDone,
} from "@/db/repo";
import { getEntryByLemma, variantOptions } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { track } from "@/lib/telemetry";

export const Route = createFileRoute("/lectures/$slug")({ component: LectureView });

const LECTURE_LIST_TITLE = "Lektionen";

function LectureView() {
  const { slug } = Route.useParams();
  const index = LECTURES_ES.findIndex((l) => l.slug === slug);
  const lecture = LECTURES_ES[index];
  const navigate = useNavigate();
  const done = useLiveQuery(
    () => (lecture ? db.lectureProgress.get(lecture.id) : undefined),
    [lecture?.id],
  );
  const lectureList = useLiveQuery(
    () => db.lists.filter((l) => !l.deletedAt && l.title === LECTURE_LIST_TITLE).first(),
    [],
  );
  const [bundle, setBundle] = useState<VocabItem[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [word, setWord] = useState<VocabItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Words earlier lectures already offered stay out of this lecture's bundles.
  const hidden = useMemo(() => {
    const s = new Set<string>();
    for (const l of LECTURES_ES.slice(0, Math.max(0, index)))
      for (const v of lectureVocab(l)) s.add(v.toLowerCase());
    return s;
  }, [index]);
  if (!lecture) return <Page title="?">Lektion nicht gefunden.</Page>;

  async function complete() {
    if (!lecture) return;
    await markLectureDone(lecture.id);
    track("lecture_done", { lecture: lecture.slug });
    play("levelup");
    navigate({ to: "/lectures" });
  }

  async function addBundleTo(target: string) {
    if (!bundle) return;
    for (const item of bundle) {
      const e = getEntryByLemma(item.text);
      if (e) {
        const opts = variantOptions(e).filter((o) => o.kind === "lemma" || o.kind === "article");
        const chosen = opts.some((o) => o.kind === "article")
          ? opts.filter((o) => o.kind === "article")
          : opts;
        await addDictionaryWord(
          e,
          chosen.map(({ kind, front, back }) => ({
            kind,
            front,
            back: item.translation ?? back,
          })),
          target,
          item.translation,
        );
      } else {
        const w = await ensureWord({
          language: "es",
          lemma: item.text,
          translation: item.translation ?? "",
          pos: "other",
        });
        await ensureVariant(w.id, "custom", item.text, item.translation ?? "");
        await addToList(target, w.id);
      }
    }
    play("add");
    setBundle(null);
    setToast(t("dict.added"));
    setTimeout(() => setToast(null), 1500);
  }

  async function addToLectureList() {
    const existing =
      lectureList ??
      (await createList("es", LECTURE_LIST_TITLE, "lavender", false, t("lectures.listHint")));
    await addBundleTo(existing.id);
  }

  return (
    <Page
      title={lecture.title.de}
      back={
        <Link to="/lectures" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <p className="-mt-3 mb-4 text-ink-2">{lecture.summary.de}</p>
      <div className="space-y-4">
        {lecture.blocks.map((b) => (
          <Block
            key={b.id}
            block={b}
            onVocabBundle={(items) => setBundle(items)}
            onWord={setWord}
            hiddenLemmas={hidden}
          />
        ))}
      </div>
      <Button
        full
        size="lg"
        className="mt-6"
        variant={done ? "secondary" : "primary"}
        onClick={complete}
      >
        {done ? `✓ ${t("lectures.done")}` : t("lectures.gotIt")}
      </Button>

      <Sheet open={!!bundle} onClose={() => setBundle(null)} title={t("lectures.addAll")}>
        <p className="mb-3 text-sm text-ink-2">{bundle?.map((b) => b.text).join(", ")}</p>
        <Button full className="mb-4" onClick={addToLectureList}>
          {lectureList ? t("lectures.addToLectureList") : t("lectures.createLectureList")}
        </Button>
        <div className="mb-1 text-xs uppercase tracking-wide text-ink-3">
          {t("lectures.otherList")}
        </div>
        <ListPicker value={listId} onChange={setListId} />
        <Button
          full
          variant="secondary"
          className="mt-3"
          disabled={!listId}
          onClick={() => listId && addBundleTo(listId)}
        >
          {t("dict.addToList")}
        </Button>
      </Sheet>
      <VocabSheet item={word} onClose={() => setWord(null)} />
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper animate-pop">
          {toast}
        </div>
      )}
    </Page>
  );
}
