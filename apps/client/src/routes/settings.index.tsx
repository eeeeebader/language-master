import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Page, Toggle } from "@/components/ui";
import { saveSettings } from "@/db/repo";
import { useAudioState } from "@/hooks/useAudio";
import { usePackState } from "@/hooks/usePack";
import { useSettings } from "@/hooks/useSettings";
import { installAudio, removeFullAudio } from "@/lib/audio-pack";
import { ensurePack, removePack } from "@/lib/dict-pack";
import { t } from "@/lib/i18n";
import { analyticsAvailable, analyticsOptedOut, setAnalyticsOptOut } from "@/lib/telemetry";

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
  const pack = usePackState();
  const audio = useAudioState();
  const [analyticsOn, setAnalyticsOn] = useState(!analyticsOptedOut());
  const mb = (b?: number) => (b ? `${(b / 1_048_576).toFixed(1)} MB` : "");
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
          label={t("settings.autoSpeak")}
          hint={t("settings.autoSpeak.hint")}
          checked={s.autoSpeak ?? true}
          onChange={(v) => saveSettings({ autoSpeak: v })}
        />
        <Toggle
          label={t("settings.haptics")}
          checked={s.hapticsOn}
          onChange={(v) => saveSettings({ hapticsOn: v })}
        />
        {analyticsAvailable && (
          <Toggle
            label="Nutzungsanalyse"
            hint="Pseudonymisierte Ereignisse (z. B. „Sitzung beendet“), EU-Server, keine Werbe-IDs"
            checked={analyticsOn}
            onChange={(v) => {
              setAnalyticsOn(v);
              setAnalyticsOptOut(!v);
            }}
          />
        )}
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
      <Card className="mb-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="font-medium">Wörterbuch Spanisch–Deutsch</div>
            <div className="text-sm text-ink-2">
              {pack.status === "ready"
                ? `Paket v${pack.version} · ${pack.lemmas.toLocaleString("de-DE")} Lemmata · offline`
                : pack.status === "downloading"
                  ? `Lädt … ${Math.round((pack.received / Math.max(1, pack.total)) * 100)} %`
                  : pack.status === "error"
                    ? `Fehler: ${pack.message}`
                    : "Eingebauter Grundwortschatz (kein Paket geladen)"}
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm"
              onClick={() => ensurePack()}
            >
              Prüfen
            </button>
            {pack.status === "ready" && (
              <button
                type="button"
                className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm"
                onClick={() => removePack()}
              >
                Entfernen
              </button>
            )}
          </div>
        </div>
      </Card>
      <Card className="mb-4">
        <div className="flex items-center justify-between py-1">
          <div>
            <div className="font-medium">Audio (Aussprache)</div>
            <div className="text-sm text-ink-2">
              {audio.status === "ready"
                ? `${audio.tier === "full" ? "Komplettes" : "Kern-"}Audiopaket v${audio.version} · ${audio.clips.toLocaleString("de-DE")} Clips · offline`
                : audio.status === "downloading"
                  ? `${audio.tier === "full" ? "Komplettes Paket" : "Kernpaket"} lädt … ${Math.round((audio.received / Math.max(1, audio.total)) * 100)} %`
                  : audio.status === "extracting"
                    ? `Entpacke … ${audio.done}/${audio.total}`
                    : audio.status === "error"
                      ? `Fehler: ${audio.message}`
                      : audio.available
                        ? "Kernpaket wird im Hintergrund geladen"
                        : "Sprachausgabe des Geräts (kein Audiopaket verfügbar)"}
            </div>
            {audio.status === "ready" && audio.tier === "core" && audio.fullBytes && (
              <div className="mt-1 text-xs text-ink-3">
                Das komplette Paket ({mb(audio.fullBytes)}) spricht jedes Wörterbuchwort offline.
              </div>
            )}
          </div>
          <div className="flex gap-1">
            {audio.status === "ready" && audio.tier === "full" ? (
              <button
                type="button"
                className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm"
                onClick={() => removeFullAudio()}
              >
                Nur Kernpaket
              </button>
            ) : audio.status === "ready" && audio.fullBytes ? (
              <button
                type="button"
                className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm"
                onClick={() => installAudio("full")}
              >
                Komplett laden
              </button>
            ) : audio.status === "error" ? (
              <button
                type="button"
                className="rounded-chip bg-paper-2 px-3 py-1.5 text-sm"
                onClick={() => installAudio("core")}
              >
                Erneut laden
              </button>
            ) : null}
          </div>
        </div>
      </Card>
      <Card className="mb-4 divide-y divide-line">
        <Row to="/settings/streak" label={t("settings.streak")} />
        <Row to="/settings/notifications" label="Benachrichtigungen" />
        <Row to="/faq" label={t("settings.faq")} />
        <Row to="/legal/$doc" params={{ doc: "agb" }} label="AGB" />
        <Row to="/legal/$doc" params={{ doc: "datenschutz" }} label="Datenschutzerklärung" />
        <Row to="/legal/$doc" params={{ doc: "impressum" }} label="Impressum" />
      </Card>
      <p className="text-center text-sm text-ink-3">{t("settings.about", { v: "0.1.0" })}</p>
    </Page>
  );
}
