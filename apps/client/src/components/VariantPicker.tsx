import type { DictionaryEntry } from "@lm/schema";
import { useEffect, useState } from "react";
import { addDictionaryWord } from "@/db/repo";
import { type VariantOption, variantOptions } from "@/lib/dictionary";
import * as haptics from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";
import { ListPicker } from "./ListPicker";
import { Button, Chip, Sheet } from "./ui";

export function VariantPicker({
  entry,
  open,
  onClose,
  preselect,
}: {
  entry: DictionaryEntry | null;
  open: boolean;
  onClose: (added: boolean) => void;
  preselect?: string;
}) {
  const [listId, setListId] = useState<string | null>(null);
  const options = entry ? variantOptions(entry) : [];
  const conj = options.filter((o) => o.kind === "conjugation");
  const simple = options.filter((o) => o.kind !== "conjugation");
  const key = (o: VariantOption) => `${o.kind}:${o.front}`;
  const defaultPick = () => {
    const want = preselect ?? (options.some((o) => o.kind === "article") ? "article" : "lemma");
    const o = options.find((x) => x.kind === want) ?? options[0];
    return new Set(o ? [key(o)] : []);
  };
  const [picked, setPicked] = useState<Set<string>>(defaultPick);
  const [showConj, setShowConj] = useState(false);
  // New entry or preselect: start from the default pick again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the entry changes
  useEffect(() => {
    setPicked(defaultPick());
    setShowConj(false);
  }, [entry?.id, preselect]);
  const toggle = (o: VariantOption) => {
    const n = new Set(picked);
    const k = key(o);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPicked(n);
  };

  async function add() {
    if (!entry || !listId) return;
    const chosen = options.filter((o) => picked.has(key(o)));
    if (chosen.length === 0) return;
    await addDictionaryWord(
      entry,
      chosen.map(({ kind, front, back }) => ({ kind, front, back })),
      listId,
    );
    play("add");
    haptics.success();
    onClose(true);
  }

  return (
    <Sheet open={open && !!entry} onClose={() => onClose(false)} title={entry?.lemma}>
      <p className="mb-2 text-sm text-ink-2">{t("dict.variants")}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {simple.map((o) => (
          <Chip key={key(o)} active={picked.has(key(o))} onClick={() => toggle(o)}>
            {o.label}: <span className="font-semibold">{o.front}</span>
          </Chip>
        ))}
        {conj.length > 0 && (
          <Chip onClick={() => setShowConj((s) => !s)}>{t("dict.variant.conjugation")} …</Chip>
        )}
      </div>
      {showConj && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {conj.map((o) => (
            <Chip
              key={key(o)}
              active={picked.has(key(o))}
              onClick={() => toggle(o)}
              className="text-xs"
            >
              {o.front}
            </Chip>
          ))}
        </div>
      )}
      <p className="mb-2 mt-4 text-sm text-ink-2">{t("dict.chooseList")}</p>
      <ListPicker value={listId} onChange={setListId} />
      <Button full className="mt-5" disabled={!listId || picked.size === 0} onClick={add}>
        {t("dict.addToList")}
      </Button>
    </Sheet>
  );
}
