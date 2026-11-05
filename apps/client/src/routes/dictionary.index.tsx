import type { DictionaryEntry } from "@lm/schema";
import { CaretRight, Plus } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ListPicker } from "@/components/ListPicker";
import { Button, Card, Empty, Page, Sheet } from "@/components/ui";
import { VariantPicker } from "@/components/VariantPicker";
import { DICTIONARY_VERSION } from "@/data/dictionary-es";
import { addToList, ensureVariant, ensureWord } from "@/db/repo";
import { usePackState } from "@/hooks/usePack";
import { searchDictionaryAsync } from "@/lib/dictionary";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";

export const Route = createFileRoute("/dictionary/")({ component: Dictionary });

const POS_DE: Record<string, string> = {
  noun: "Nomen",
  verb: "Verb",
  adj: "Adjektiv",
  adv: "Adverb",
  pron: "Pronomen",
  det: "Begleiter",
  prep: "Präposition",
  conj: "Konjunktion",
  num: "Zahl",
  intj: "Interjektion",
  phrase: "Wendung",
  other: "",
};

function Dictionary() {
  const [q, setQ] = useState("");
  const pack = usePackState();
  const [results, setResults] = useState<DictionaryEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);
  // Debounced, off-thread search; answers that arrive out of order are dropped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the pack becomes ready
  useEffect(() => {
    const id = ++seq.current;
    setSearching(true);
    const tm = setTimeout(
      async () => {
        const r = await searchDictionaryAsync(q);
        if (id === seq.current) {
          setResults(r);
          setSearching(false);
        }
      },
      q ? 120 : 0,
    );
    return () => clearTimeout(tm);
  }, [q, pack.status]);
  const [picking, setPicking] = useState<DictionaryEntry | null>(null);
  const [custom, setCustom] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [listId, setListId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }

  async function addCustom() {
    if (!front.trim() || !back.trim() || !listId) return;
    const w = await ensureWord({
      language: "es",
      lemma: front.trim(),
      translation: back.trim(),
      pos: "other",
    });
    await ensureVariant(w.id, "custom", front.trim(), back.trim());
    await addToList(listId, w.id);
    play("add");
    setCustom(false);
    setFront("");
    setBack("");
    flash(t("dict.added"));
  }

  return (
    <Page title={t("dict.title")}>
      <p className="-mt-3 mb-3 text-sm text-ink-3">
        {t("dict.offline")} ·{" "}
        {pack.status === "ready"
          ? `Paket v${pack.version} · ${pack.lemmas.toLocaleString("de-DE")} Lemmata`
          : pack.status === "downloading"
            ? `Paket wird geladen … ${Math.round((pack.received / Math.max(1, pack.total)) * 100)} %`
            : `${DICTIONARY_VERSION} (eingebaut)`}
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("dict.placeholder")}
        autoCapitalize="off"
        className="mb-4 w-full rounded-card border border-line bg-white px-4 py-3 text-lg outline-none focus:border-ink"
      />

      {results.length === 0 && !searching && (
        <Empty>
          <p className="mb-3">{t("dict.noResults")}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setFront(q);
              setCustom(true);
            }}
          >
            <Plus size={16} /> {t("dict.custom")}
          </Button>
        </Empty>
      )}

      <div className="grid gap-2">
        {results.map((e) => (
          <Card
            key={e.id}
            className="flex items-center gap-3"
            onClick={() => navigate({ to: "/dictionary/$entryId", params: { entryId: e.id } })}
          >
            <div className="flex-1 min-w-0">
              <div className="font-bold">
                {e.article && <span className="font-normal text-ink-2">{e.article} </span>}
                {e.lemma}
                {e.genderPair && (
                  <span className="font-normal text-ink-3"> / {e.genderPair[1]}</span>
                )}
              </div>
              <div className="truncate text-sm text-ink-2">
                {POS_DE[e.pos] && (
                  <span className="mr-1 rounded-chip bg-paper-2 px-1.5 text-xs">
                    {POS_DE[e.pos]}
                  </span>
                )}
                {e.glosses.map((g) => g.text).join(", ")}
              </div>
            </div>
            <button
              type="button"
              className="rounded-full bg-sage-soft p-2 text-sage-deep"
              onClick={(ev) => {
                ev.stopPropagation();
                setPicking(e);
              }}
              aria-label={t("dict.addToList")}
            >
              <Plus size={18} weight="bold" />
            </button>
            <CaretRight className="text-ink-3" />
          </Card>
        ))}
      </div>

      {q && results.length > 0 && (
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-ink-3 underline"
          onClick={() => {
            setFront(q);
            setCustom(true);
          }}
        >
          {t("dict.custom")} „{q}“
        </button>
      )}

      <VariantPicker
        entry={picking}
        open={!!picking}
        onClose={(added) => {
          setPicking(null);
          if (added) flash(t("dict.added"));
        }}
      />

      <Sheet open={custom} onClose={() => setCustom(false)} title={t("dict.custom")}>
        <input
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="Spanisch"
          className="mb-2 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <input
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Deutsch"
          className="mb-4 w-full rounded-chip border border-line bg-white px-4 py-2"
        />
        <ListPicker value={listId} onChange={setListId} />
        <Button
          full
          className="mt-4"
          disabled={!front.trim() || !back.trim() || !listId}
          onClick={addCustom}
        >
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
