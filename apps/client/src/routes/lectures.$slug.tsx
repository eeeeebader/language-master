import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Block } from "@/components/LectureBlocks";
import { ListPicker } from "@/components/ListPicker";
import { Button, Page, Sheet } from "@/components/ui";
import { LECTURES_ES } from "@/data/lectures-es";
import { db } from "@/db/db";
import { addDictionaryWord, markLectureDone } from "@/db/repo";
import { getEntryByLemma, variantOptions } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { track } from "@/lib/telemetry";

export const Route = createFileRoute("/lectures/$slug")({ component: LectureView });

function LectureView() {
  const { slug } = Route.useParams();
  const lecture = LECTURES_ES.find((l) => l.slug === slug);
  const navigate = useNavigate();
  const done = useLiveQuery(
    () => (lecture ? db.lectureProgress.get(lecture.id) : undefined),
    [lecture?.id],
  );
  const [bundle, setBundle] = useState<string[] | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (!lecture) return <Page title="?">Lektion nicht gefunden.</Page>;

  const hasCheck = lecture.blocks.some((b) => b.type === "quick_check");

  async function complete() {
    if (!lecture) return;
    await markLectureDone(lecture.id);
    track("lecture_done", { lecture: lecture.slug });
    play("levelup");
    navigate({ to: "/lectures" });
  }

  async function addBundle() {
    if (!bundle || !listId) return;
    for (const lemma of bundle) {
      const e = getEntryByLemma(lemma);
      if (!e) continue;
      const opts = variantOptions(e).filter((o) => o.kind === "lemma" || o.kind === "article");
      const chosen = opts.some((o) => o.kind === "article")
        ? opts.filter((o) => o.kind === "article")
        : opts;
      await addDictionaryWord(
        e,
        chosen.map(({ kind, front, back }) => ({ kind, front, back })),
        listId,
      );
    }
    play("add");
    setBundle(null);
    setToast(t("dict.added"));
    setTimeout(() => setToast(null), 1500);
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
            onQuickCheck={() => complete()}
            onVocabBundle={(lemmas) => setBundle(lemmas)}
          />
        ))}
      </div>
      {!hasCheck && !done && (
        <Button full size="lg" className="mt-6" onClick={complete}>
          {t("lectures.gotIt")}
        </Button>
      )}
      {done && <p className="mt-6 text-center text-sm text-sage-deep">✓ {t("lectures.done")}</p>}

      <Sheet open={!!bundle} onClose={() => setBundle(null)} title={t("lectures.addAll")}>
        <p className="mb-2 text-sm text-ink-2">{bundle?.join(", ")}</p>
        <ListPicker value={listId} onChange={setListId} />
        <Button full className="mt-4" disabled={!listId} onClick={addBundle}>
          {t("dict.addToList")}
        </Button>
      </Sheet>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-chip bg-ink px-4 py-2 text-sm text-paper animate-pop">
          {toast}
        </div>
      )}
    </Page>
  );
}
