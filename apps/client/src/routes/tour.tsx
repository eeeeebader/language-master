import { BookOpenText, Cards, House, MagnifyingGlass, Path } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Page } from "@/components/ui";
import { saveSettings } from "@/db/repo";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/tour")({ component: Tour });

const STEPS = [
  { Icon: House, text: t("tour.home"), tone: "bg-amber-soft text-amber-deep" },
  { Icon: Cards, text: t("tour.cards"), tone: "bg-sage-soft text-sage-deep" },
  { Icon: MagnifyingGlass, text: t("tour.dictionary"), tone: "bg-sky-soft text-sky-deep" },
  { Icon: Path, text: t("tour.lectures"), tone: "bg-lavender-soft text-lavender-deep" },
  { Icon: BookOpenText, text: t("tour.stories"), tone: "bg-rose-soft text-rose-deep" },
];

function Tour() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const step = STEPS[i] as (typeof STEPS)[number];
  async function done() {
    await saveSettings({ tourDone: true });
    navigate({ to: "/" });
  }
  return (
    <Page>
      <div className="mx-auto mt-16 max-w-md text-center">
        <div
          className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full ${step.tone} animate-pop`}
          key={i}
        >
          <step.Icon size={48} weight="duotone" />
        </div>
        <p className="mt-8 text-xl font-semibold leading-snug">{step.text}</p>
        <div className="mt-8 flex justify-center gap-1.5">
          {STEPS.map((s, j) => (
            <div
              key={s.text}
              className={`h-1.5 w-6 rounded-chip ${j <= i ? "bg-ink" : "bg-line"}`}
            />
          ))}
        </div>
        <Button
          full
          size="lg"
          className="mt-10"
          onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : done())}
        >
          {i < STEPS.length - 1 ? t("common.next") : t("common.done")}
        </Button>
        <Button full variant="ghost" className="mt-2" onClick={done}>
          {t("common.skip")}
        </Button>
      </div>
    </Page>
  );
}
