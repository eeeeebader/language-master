import { ArrowLeft, Fire } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ActivityCalendar } from "@/components/Charts";
import { Button, Card, Chip, Page } from "@/components/ui";
import { addStreakLog, saveSettings } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import { useActivityDays, useStreak } from "@/hooks/useStats";
import { t } from "@/lib/i18n";
import { play } from "@/lib/sound";

export const Route = createFileRoute("/settings/streak")({ component: StreakSettings });

const DAYS = [
  { d: 1, l: "Mo" },
  { d: 2, l: "Di" },
  { d: 3, l: "Mi" },
  { d: 4, l: "Do" },
  { d: 5, l: "Fr" },
  { d: 6, l: "Sa" },
  { d: 0, l: "So" },
];

function StreakSettings() {
  const s = useSettings();
  const streak = useStreak();
  const activity = useActivityDays() ?? [];
  if (!s) return null;

  async function toggleDay(d: number) {
    if (!s) return;
    const next = s.learningDays.includes(d)
      ? s.learningDays.filter((x) => x !== d)
      : [...s.learningDays, d];
    if (next.length === 0) return;
    await saveSettings({ learningDays: next.sort() });
    await addStreakLog("learning_days_changed");
  }

  async function restore() {
    if (!streak?.gap) return;
    await addStreakLog("reactivation", streak.gap.from, streak.gap.to);
    play("streak");
  }

  return (
    <Page
      title={t("streak.title")}
      back={
        <Link to="/" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Card
        tone={streak?.broken ? "rose" : "amber"}
        className="mb-4 flex items-center gap-4 border-transparent"
      >
        <Fire
          size={40}
          weight="fill"
          className={streak?.broken ? "text-rose-deep" : "text-amber-deep"}
        />
        <div className="flex-1">
          <div className="text-2xl font-extrabold">
            {t("home.streakDays", {
              n: streak?.broken ? streak.restorableCount : (streak?.count ?? 0),
            })}
          </div>
          {streak?.broken && (
            <div className="text-sm text-rose-deep">
              {t("streak.missed", { n: streak.missedLearningDays })}
            </div>
          )}
        </div>
        {streak?.broken && streak.canReactivate && (
          <Button size="sm" onClick={restore}>
            {t("home.restore")}
          </Button>
        )}
      </Card>

      <Card className="mb-4">
        <ActivityCalendar
          days={activity.map((a) => ({
            day: a.day,
            count: a.reviews + a.lecturesDone * 5 + a.storiesRead * 5,
          }))}
          learningDays={s.learningDays}
        />
      </Card>

      <Card className="mb-4">
        <div className="font-bold">{t("streak.learningDays")}</div>
        <p className="mb-3 text-sm text-ink-2">{t("streak.learningDaysHint")}</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map(({ d, l }) => (
            <Chip key={d} active={s.learningDays.includes(d)} onClick={() => toggleDay(d)}>
              {l}
            </Chip>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <div className="font-bold">{t("streak.vacation")}</div>
        <p className="mb-3 text-sm text-ink-2">{t("streak.vacationHint")}</p>
        <div className="flex gap-2">
          <input
            type="date"
            value={s.vacationUntil ?? ""}
            onChange={(e) => saveSettings({ vacationUntil: e.target.value || null })}
            className="flex-1 rounded-chip border border-line bg-white px-3 py-2"
          />
          {s.vacationUntil && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => saveSettings({ vacationUntil: null })}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </Card>

      <p className="text-sm text-ink-3">{t("streak.restoreHint")}</p>
    </Page>
  );
}
