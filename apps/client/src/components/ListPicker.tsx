import type { WordList } from "@lm/schema";
import { Plus } from "@phosphor-icons/react";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/db/db";
import { createList } from "@/db/repo";
import { t } from "@/lib/i18n";
import { Button, Chip } from "./ui";

export function ListPicker({
  value,
  onChange,
  allowCreate = true,
}: {
  value: string | null;
  onChange: (id: string) => void;
  allowCreate?: boolean;
}) {
  const lists = useLiveQuery(() => db.lists.filter((l) => !l.deletedAt).toArray(), []) ?? [];
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");

  async function create() {
    if (!title.trim()) return;
    const l = await createList(
      "es",
      title.trim(),
      (["sage", "rose", "lavender", "amber", "sky"] as const)[
        lists.length % 5
      ] as WordList["colour"],
    );
    setTitle("");
    setCreating(false);
    onChange(l.id);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {lists.map((l) => (
        <Chip
          key={l.id}
          active={value === l.id}
          onClick={() => onChange(l.id)}
          tone={value === l.id ? undefined : l.colour}
        >
          {l.title}
        </Chip>
      ))}
      {allowCreate && !creating && (
        <Chip onClick={() => setCreating(true)}>
          <span className="inline-flex items-center gap-1">
            <Plus size={14} /> {t("cards.newList")}
          </span>
        </Chip>
      )}
      {creating && (
        <div className="flex w-full gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={t("cards.listTitle")}
            className="flex-1 rounded-chip border border-line bg-white px-4 py-2 outline-none focus:border-ink"
          />
          <Button size="sm" onClick={create}>
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
