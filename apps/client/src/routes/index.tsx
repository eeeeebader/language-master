import { ArrowRight, BookOpenText, Cards, Fire, Path, Tray, User } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { VelocityChart } from "@/components/Charts";
import { Button, Card, Page, Stat } from "@/components/ui";
import { LECTURES_ES } from "@/data/lectures-es";
import { db } from "@/db/db";
import { addStreakLog } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import {
  useDailyAverageMinutes,
  useDueCount,
  useMasteredCount,
  useStreak,
  useWeeklyVelocity,
  useWordsReadInStories,
} from "@/hooks/useStats";
import { t } from "@/lib/i18n";
import { refreshInbox } from "@/lib/inbox";
import { play } from "@/lib/sound";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const settings = useSettings();
  const due = useDueCount() ?? 0;
  const mastered = useMasteredCount() ?? 0;
  const wordsRead = useWordsReadInStories() ?? 0;
  const minutes = useDailyAverageMinutes() ?? 0;
  const velocity = useWeeklyVelocity() ?? [];
  const streak = useStreak();
  const navigate = useNavigate();

  const continueStory = useLiveQuery(async () => {
    const progress = (await db.storyProgress.toArray())
      .filter((p) => !p.finishedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!progress) return null;
    return db.stories.get(progress.storyId);
  }, []);
  const doneLectures = useLiveQuery(() => db.lectureProgress.toArray(), []) ?? [];
  const unread = useLiveQuery(() => db.inbox.filter((i) => !i.read).count(), []) ?? 0;
  useEffect(() => {
    refreshInbox().catch(() => undefined);
  }, []);
  const nextLecture = LECTURES_ES.find((l) => !doneLectures.some((d) => d.lectureId === l.id));

  async function restore() {
    if (!streak?.gap) return;
    await addStreakLog("reactivation", streak.gap.from, streak.gap.to);
    play("streak");
  }

  const initials = (settings?.username ?? "?").slice(0, 2).toUpperCase();

  return (
    <Page
      title={t("home.greeting", { name: settings?.username ?? "" })}
      action={
        <>
          <Link
            to="/inbox"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-paper-2 text-ink-2"
            aria-label="Postfach"
          >
            <Tray size={20} />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-chip bg-rose-deep px-1 text-[11px] font-bold text-white">
                {unread}
              </span>
            )}
          </Link>
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-lavender-soft font-bold text-lavender-deep"
            aria-label={t("profile.title")}
          >
            {settings?.avatar === "initials" ? initials : <User size={20} />}
          </Link>
        </>
      }
    >
      <Card
        tone={streak?.broken ? "rose" : "amber"}
        className="mb-4 flex items-center gap-4 border-transparent"
        onClick={() => navigate({ to: "/settings/streak" })}
      >
        <Fire
          size={40}
          weight="fill"
          className={streak?.broken ? "text-rose-deep" : "text-amber-deep"}
        />
        <div className="flex-1">
          <div className="text-sm text-ink-2">
            {streak?.broken ? t("home.streakBroken") : t("home.streak")}
          </div>
          <div className="text-2xl font-extrabold">
            {t("home.streakDays", {
              n: streak?.broken ? streak.restorableCount : (streak?.count ?? 0),
            })}
          </div>
        </div>
        {streak?.broken && streak.canReactivate && (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              restore();
            }}
          >
            {t("home.restore")}
          </Button>
        )}
      </Card>

      <div className="mb-4 grid gap-3">
        <Card
          tone="sage"
          className="flex items-center gap-3 border-transparent"
          onClick={() =>
            navigate({
              to: "/karteikarten/session",
              search: {
                mode: "forever",
                lists: "",
                filter: "due",
                direction: "t2n",
                sample: 0,
                onboarding: 0,
              },
            })
          }
        >
          <Cards size={28} weight="duotone" className="text-sage-deep" />
          <div className="flex-1">
            <div className="font-bold">{t("home.due")}</div>
            <div className="text-sm text-ink-2">{t("home.dueCards", { n: due })}</div>
          </div>
          <ArrowRight />
        </Card>
        {continueStory && (
          <Card
            tone="sky"
            className="flex items-center gap-3 border-transparent"
            onClick={() =>
              navigate({ to: "/stories/$storyId", params: { storyId: continueStory.id } })
            }
          >
            <BookOpenText size={28} weight="duotone" className="text-sky-deep" />
            <div className="flex-1">
              <div className="font-bold">{t("home.continueStory")}</div>
              <div className="text-sm text-ink-2">{continueStory.title}</div>
            </div>
            <ArrowRight />
          </Card>
        )}
        {nextLecture && (
          <Card
            tone="lavender"
            className="flex items-center gap-3 border-transparent"
            onClick={() => navigate({ to: "/lectures/$slug", params: { slug: nextLecture.slug } })}
          >
            <Path size={28} weight="duotone" className="text-lavender-deep" />
            <div className="flex-1">
              <div className="font-bold">{t("home.nextLecture")}</div>
              <div className="text-sm text-ink-2">{nextLecture.title.de}</div>
            </div>
            <ArrowRight />
          </Card>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t("home.mastered")} value={mastered} />
        <Stat label={t("home.wordsRead")} value={wordsRead} />
        <Stat label={t("home.dailyMinutes")} value={minutes} />
      </div>

      <Card>
        <div className="mb-1 font-bold">{t("home.velocity")}</div>
        <div className="mb-3 text-sm text-ink-2">{t("home.velocityHint")}</div>
        <VelocityChart weeks={velocity} />
      </Card>
    </Page>
  );
}
