import type { NotificationPrefs } from "@lm/schema";
import type { PlannedNotification } from "@lm/srs";
import { ArrowLeft, Plus, Trash } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, Card, Chip, Page, Toggle } from "@/components/ui";
import { saveSettings } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import { isNative, prefsOf, rescheduleNotifications } from "@/lib/notifications";
import { ulid } from "@/lib/ulid";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationSettings,
});

const DAYS = [
  { d: 1, l: "Mo" },
  { d: 2, l: "Di" },
  { d: 3, l: "Mi" },
  { d: 4, l: "Do" },
  { d: 5, l: "Fr" },
  { d: 6, l: "Sa" },
  { d: 0, l: "So" },
];
const KIND_LABEL: Record<PlannedNotification["kind"], string> = {
  streak: "Serie",
  study: "Lernzeit",
  weekly: "Wochenrückblick",
  cards_due: "Karten fällig",
  free_story: "Freie Geschichte",
  lecture_nudge: "Lektion",
};

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-chip border border-line bg-white px-3 py-1.5 text-sm"
    />
  );
}

function NotificationSettings() {
  const s = useSettings();
  const [plan, setPlan] = useState<PlannedNotification[]>([]);
  const prefs = prefsOf(s?.notifications);

  async function update(patch: Partial<NotificationPrefs>) {
    await saveSettings({ notifications: { ...prefs, ...patch } });
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when any pref changes
  useEffect(() => {
    rescheduleNotifications().then(setPlan);
  }, [s?.notifications]);

  if (!s) return null;
  const quiet = prefs.quietHours;

  return (
    <Page
      title="Benachrichtigungen"
      back={
        <Link to="/settings" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      {!isNative && (
        <Card tone="sky" className="mb-4 border-transparent text-sm">
          Erinnerungen werden nur in der iOS- und Android-App zugestellt. Hier siehst du, was
          geplant wäre.
        </Card>
      )}

      <Card className="mb-4 divide-y divide-line">
        <Toggle
          label="Serien-Erinnerung"
          hint="1 Stunde vor Ablauf eines Lerntags, nie an Ruhetagen oder im Urlaub"
          checked={prefs.streak}
          onChange={(v) => update({ streak: v })}
        />
        <Toggle
          label="Wochenrückblick"
          hint="Minuten, Wiederholungen, neue Wörter, Serie"
          checked={prefs.weekly.enabled}
          onChange={(v) => update({ weekly: { ...prefs.weekly, enabled: v } })}
        />
        {prefs.weekly.enabled && (
          <div className="flex flex-wrap items-center gap-2 py-3">
            {DAYS.map(({ d, l }) => (
              <Chip
                key={d}
                active={prefs.weekly.weekday === d}
                onClick={() => update({ weekly: { ...prefs.weekly, weekday: d } })}
              >
                {l}
              </Chip>
            ))}
            <TimeInput
              value={prefs.weekly.time}
              onChange={(t) => update({ weekly: { ...prefs.weekly, time: t } })}
            />
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="font-medium">Lernzeiten</div>
            <div className="text-sm text-ink-2">
              Feste Erinnerungen; übersprungen, wenn du an dem Tag schon gelernt hast.
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              update({
                studyReminders: [
                  ...prefs.studyReminders,
                  { id: ulid(), weekdays: [1, 2, 3, 4, 5], time: "07:30" },
                ],
              })
            }
          >
            <Plus size={14} />
          </Button>
        </div>
        {prefs.studyReminders.map((r) => (
          <div
            key={r.id}
            className="mt-2 flex flex-wrap items-center gap-1.5 rounded-card bg-paper-2 p-2"
          >
            {DAYS.map(({ d, l }) => (
              <Chip
                key={d}
                active={r.weekdays.includes(d)}
                onClick={() =>
                  update({
                    studyReminders: prefs.studyReminders.map((x) =>
                      x.id === r.id
                        ? {
                            ...x,
                            weekdays: x.weekdays.includes(d)
                              ? x.weekdays.filter((w) => w !== d)
                              : [...x.weekdays, d],
                          }
                        : x,
                    ),
                  })
                }
              >
                {l}
              </Chip>
            ))}
            <TimeInput
              value={r.time}
              onChange={(t) =>
                update({
                  studyReminders: prefs.studyReminders.map((x) =>
                    x.id === r.id ? { ...x, time: t } : x,
                  ),
                })
              }
            />
            <button
              type="button"
              className="ml-auto rounded-full p-1.5 text-ink-3"
              onClick={() =>
                update({ studyReminders: prefs.studyReminders.filter((x) => x.id !== r.id) })
              }
              aria-label="Entfernen"
            >
              <Trash size={16} />
            </button>
          </div>
        ))}
      </Card>

      <Card className="mb-4 divide-y divide-line">
        <Toggle
          label="Karten fällig"
          hint="Täglich, wenn mindestens so viele Karten fällig sind"
          checked={prefs.cardsDue.enabled}
          onChange={(v) => update({ cardsDue: { ...prefs.cardsDue, enabled: v } })}
        />
        {prefs.cardsDue.enabled && (
          <div className="flex items-center gap-2 py-3 text-sm">
            <TimeInput
              value={prefs.cardsDue.time}
              onChange={(t) => update({ cardsDue: { ...prefs.cardsDue, time: t } })}
            />
            ab
            <input
              type="number"
              min={1}
              max={500}
              value={prefs.cardsDue.threshold}
              onChange={(e) =>
                update({
                  cardsDue: {
                    ...prefs.cardsDue,
                    threshold: Math.max(1, Number(e.target.value) || 1),
                  },
                })
              }
              className="w-20 rounded-chip border border-line bg-white px-3 py-1.5"
            />
            Karten
          </div>
        )}
        <Toggle
          label="Freie Geschichte"
          hint="Täglich, solange die freie Geschichte unbenutzt ist"
          checked={prefs.freeStory.enabled}
          onChange={(v) => update({ freeStory: { ...prefs.freeStory, enabled: v } })}
        />
        {prefs.freeStory.enabled && (
          <div className="py-3">
            <TimeInput
              value={prefs.freeStory.time}
              onChange={(t) => update({ freeStory: { ...prefs.freeStory, time: t } })}
            />
          </div>
        )}
        <Toggle
          label="Lektions-Anstoß"
          hint="3 Tage nach der letzten Lektion, mit dem nächsten Thema"
          checked={prefs.lectureNudge.enabled}
          onChange={(v) => update({ lectureNudge: { enabled: v } })}
        />
      </Card>

      <Card className="mb-4 divide-y divide-line">
        <Toggle
          label="Ruhezeiten"
          hint="Erinnerungen in dieser Zeit rutschen auf die Minute davor"
          checked={!!quiet}
          onChange={(v) => update({ quietHours: v ? { start: "22:00", end: "07:00" } : null })}
        />
        {quiet && (
          <div className="flex items-center gap-2 py-3 text-sm">
            <TimeInput
              value={quiet.start}
              onChange={(t) => update({ quietHours: { ...quiet, start: t } })}
            />
            bis
            <TimeInput
              value={quiet.end}
              onChange={(t) => update({ quietHours: { ...quiet, end: t } })}
            />
          </div>
        )}
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-3">
        Geplant (nächste 7 Tage)
      </h2>
      {plan.length === 0 && <p className="text-sm text-ink-3">Nichts geplant.</p>}
      <div className="grid gap-2">
        {plan.map((p) => (
          <Card key={p.id} className="text-sm">
            <div className="flex items-center justify-between">
              <span className="rounded-chip bg-paper-2 px-2 py-0.5 text-xs text-ink-2">
                {KIND_LABEL[p.kind]}
              </span>
              <span className="text-ink-3">
                {p.at.toLocaleString("de-DE", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="mt-1 font-semibold">{p.title}</div>
            <div className="text-ink-2">{p.body}</div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
