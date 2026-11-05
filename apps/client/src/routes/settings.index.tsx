import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, Page, Toggle } from "@/components/ui";
import { saveSettings } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/settings/")({ component: Settings });

function Row({
  to,
  label,
  params,
}: {
  to: string;
  label: string;
  params?: Record<string, string>;
}) {
  return (
    <Link to={to} params={params} className="flex items-center justify-between py-3 font-medium">
      {label}
      <CaretRight className="text-ink-3" />
    </Link>
  );
}

function Settings() {
  const s = useSettings();
  if (!s) return null;
  return (
    <Page
      title={t("settings.title")}
      back={
        <Link to="/profile" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Card className="mb-4 divide-y divide-line">
        <Toggle
          label={t("settings.sound")}
          checked={s.soundOn}
          onChange={(v) => saveSettings({ soundOn: v })}
        />
        <Toggle
          label={t("settings.haptics")}
          checked={s.hapticsOn}
          onChange={(v) => saveSettings({ hapticsOn: v })}
        />
        <div className="flex items-center justify-between py-3">
          <span className="font-medium">{t("settings.dailyNew")}</span>
          <input
            type="number"
            min={1}
            max={100}
            value={s.dailyNewCards}
            onChange={(e) =>
              saveSettings({
                dailyNewCards: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
              })
            }
            className="w-20 rounded-chip border border-line bg-white px-3 py-1.5 text-right"
          />
        </div>
      </Card>
      <Card className="mb-4 divide-y divide-line">
        <Row to="/settings/streak" label={t("settings.streak")} />
        <Row to="/faq" label={t("settings.faq")} />
        <Row to="/legal/$doc" params={{ doc: "agb" }} label="AGB" />
        <Row to="/legal/$doc" params={{ doc: "datenschutz" }} label="Datenschutzerklärung" />
        <Row to="/legal/$doc" params={{ doc: "impressum" }} label="Impressum" />
      </Card>
      <p className="text-center text-sm text-ink-3">{t("settings.about", { v: "0.1.0" })}</p>
    </Page>
  );
}
