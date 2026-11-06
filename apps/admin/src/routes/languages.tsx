import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, cx, input, Page, Toast } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { useToast } from "@/lib/useToast";

export const Route = createFileRoute("/languages")({ component: Languages });

/** Study languages the product plans to offer; a pair goes live per native language. */
const TARGETS: { code: string; name: string; flag: string }[] = [
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "uk", name: "Українська", flag: "🇺🇦" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
];
/** Native languages we maintain content for: every pack has these as parents. */
const NATIVES: { code: string; name: string; flag: string }[] = [
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "en", name: "English", flag: "🇬🇧" },
];
const MIN_LECTURES = 8;

interface Pair {
  target: string;
  native: string;
  enabled: boolean;
  pack_version: number | null;
  audio: boolean;
  published_lectures: number;
}

function Languages() {
  const qc = useQueryClient();
  const toast = useToast();
  const [newTarget, setNewTarget] = useState("fr");
  const [newNative, setNewNative] = useState("de");
  const pairs = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      const [rows, packs, lectures] = await Promise.all([
        list<Pair & { published_lectures?: number; pack_version?: number | null }>("languages"),
        list<{
          target: string;
          native: string;
          version: number;
          published_at: string | null;
          with_audio: boolean;
        }>("dictionary_packs"),
        list<{
          language: string;
          slug: string;
          status: string;
          content_json?: { title?: Record<string, string> };
        }>("lectures"),
      ]);
      return rows.map((r): Pair => {
        const published = packs.filter(
          (p) => p.target === r.target && p.native === r.native && p.published_at,
        );
        // A lecture counts for a native language when its content carries that translation.
        const slugs = new Set(
          lectures
            .filter(
              (l) =>
                l.language === r.target &&
                l.status === "published" &&
                (!l.content_json?.title || l.content_json.title[r.native]),
            )
            .map((l) => l.slug),
        );
        const dict = published.filter((p) => !p.with_audio);
        return {
          target: r.target,
          native: r.native,
          enabled: r.enabled,
          pack_version:
            r.pack_version ?? (dict.length ? Math.max(...dict.map((p) => p.version)) : null),
          audio: published.some((p) => p.with_audio),
          published_lectures: r.published_lectures ?? slugs.size,
        };
      });
    },
  });
  const ready = (p: Pair) => p.pack_version !== null && p.published_lectures >= MIN_LECTURES;
  const byTarget = TARGETS.map((t) => ({
    ...t,
    pairs: (pairs.data ?? []).filter((p) => p.target === t.code),
  })).filter((t) => t.pairs.length > 0);
  const existing = new Set((pairs.data ?? []).map((p) => `${p.target}-${p.native}`));

  async function save(target: string, native: string, enabled: boolean) {
    try {
      await apiPost("/admin/languages", { target, native, enabled });
      qc.invalidateQueries({ queryKey: ["languages"] });
      toast.show("Gespeichert");
    } catch (e) {
      toast.show(`Fehler: ${String(e)}`);
    }
  }

  return (
    <Page
      title="Sprachen"
      subtitle={`Jedes Sprachpaket hat bis zu zwei Elternsprachen (Deutsch, Englisch). Ein Paar geht live, sobald Pack und mindestens ${MIN_LECTURES} Lektionen in dieser Elternsprache veröffentlicht sind.`}
    >
      <div className="grid gap-4">
        {byTarget.map((t) => (
          <Card key={t.code}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-2xl">{t.flag}</span>
              <div>
                <div className="font-bold">{t.name}</div>
                <div className="text-xs text-ink-3">Lernsprache · {t.code}</div>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {NATIVES.map((n) => {
                const p = t.pairs.find((x) => x.native === n.code);
                return (
                  <div
                    key={n.code}
                    className={cx(
                      "rounded-card border p-3",
                      p?.enabled ? "border-sage bg-sage-soft/40" : "border-line bg-white/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">
                        {n.flag} {n.name}{" "}
                        <span className="font-normal text-ink-3">· Elternsprache</span>
                      </div>
                      {p ? (
                        <Badge tone={p.enabled ? "sage" : "grey"}>
                          {p.enabled ? "live" : "aus"}
                        </Badge>
                      ) : (
                        <Badge tone="grey">nicht angelegt</Badge>
                      )}
                    </div>
                    {p ? (
                      <>
                        <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                          <Fact label="Pack">
                            {p.pack_version ? (
                              `v${p.pack_version}`
                            ) : (
                              <Badge tone="rose">fehlt</Badge>
                            )}
                          </Fact>
                          <Fact label="Audio">{p.audio ? "ja" : "–"}</Fact>
                          <Fact label="Lektionen">
                            <span
                              className={cx(
                                p.published_lectures < MIN_LECTURES && "text-rose-deep",
                              )}
                            >
                              {p.published_lectures} / {MIN_LECTURES}
                            </span>
                          </Fact>
                        </dl>
                        <Button
                          size="sm"
                          className="mt-3"
                          variant={p.enabled ? "secondary" : "primary"}
                          disabled={!p.enabled && !ready(p)}
                          title={
                            !p.enabled && !ready(p) ? "Pack und Lektionen fehlen noch" : undefined
                          }
                          onClick={() => save(p.target, p.native, !p.enabled)}
                        >
                          {p.enabled ? "Deaktivieren" : "Aktivieren"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => save(t.code, n.code, false)}
                      >
                        Paar anlegen
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <Card>
          <div className="mb-2 font-bold">Neue Lernsprache anlegen</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={`${input} w-auto`}
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
            >
              {TARGETS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.flag} {t.name}
                </option>
              ))}
            </select>
            <span className="text-ink-3">für</span>
            <select
              className={`${input} w-auto`}
              value={newNative}
              onChange={(e) => setNewNative(e.target.value)}
            >
              {NATIVES.map((n) => (
                <option key={n.code} value={n.code}>
                  {n.flag} {n.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={existing.has(`${newTarget}-${newNative}`)}
              onClick={() => save(newTarget, newNative, false)}
            >
              Paar anlegen
            </Button>
            {existing.has(`${newTarget}-${newNative}`) && (
              <span className="text-xs text-ink-3">gibt es schon</span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Ein neues Paar startet deaktiviert. Danach: Wörterbuch-Pack bauen und veröffentlichen,
            Lektionen in der Elternsprache schreiben, dann aktivieren.
          </p>
        </Card>
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
