import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { ActivityCalendar } from "@/components/Charts";
import { Button, Card, Page, Stat } from "@/components/ui";
import { db } from "@/db/db";
import { exportAll, wipeEverything } from "@/db/repo";
import { useSettings } from "@/hooks/useSettings";
import {
  useActivityDays,
  useMasteredCount,
  useStreak,
  useWordsReadInStories,
} from "@/hooks/useStats";
import { getSession, isCloudEnabled, onAuthChange, signInWithEmail, signOut } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { onSyncStatus, type SyncStatus, syncNow } from "@/lib/sync";

export const Route = createFileRoute("/profile")({ component: Profile });

function Profile() {
  const settings = useSettings();
  const mastered = useMasteredCount() ?? 0;
  const wordsRead = useWordsReadInStories() ?? 0;
  const streak = useStreak();
  const activity = useActivityDays() ?? [];
  const wordCount = useLiveQuery(() => db.words.filter((w) => !w.deletedAt).count(), []) ?? 0;
  const navigate = useNavigate();

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `language-master-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function wipe() {
    if (!confirm(t("profile.deleteConfirm"))) return;
    await wipeEverything();
    navigate({ to: "/onboarding" });
  }

  if (!settings) return null;
  const since = new Date(settings.createdAt).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  return (
    <Page
      title={t("profile.title")}
      back={
        <Link to="/" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Card className="mb-4 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lavender-soft text-2xl font-extrabold text-lavender-deep">
          {settings.username.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-xl font-extrabold">{settings.username}</div>
          <div className="text-sm text-ink-2">{t("profile.memberSince", { date: since })}</div>
          <div className="mt-1 inline-block rounded-chip bg-paper-2 px-2 py-0.5 text-xs font-semibold text-ink-2">
            {t("profile.free")}
          </div>
        </div>
      </Card>

      <h2 className="mb-2 font-bold">{t("profile.languages")}</h2>
      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-bold">🇪🇸 Spanisch</span>
          <span className="text-sm text-ink-2">{wordCount} Wörter</span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat label={t("home.mastered")} value={mastered} />
          <Stat label={t("home.wordsRead")} value={wordsRead} />
          <Stat label={t("home.streak")} value={streak?.count ?? 0} />
        </div>
        <ActivityCalendar
          days={activity.map((a) => ({
            day: a.day,
            count: a.reviews + a.lecturesDone * 5 + a.storiesRead * 5,
          }))}
          learningDays={settings.learningDays}
        />
      </Card>

      <AccountCard />

      <div className="grid gap-2">
        <Button variant="secondary" full onClick={() => navigate({ to: "/settings" })}>
          {t("profile.settings")}
        </Button>
        <Button variant="secondary" full onClick={doExport}>
          {t("profile.export")}
        </Button>
        <Button variant="danger" full onClick={wipe}>
          {t("profile.deleteAccount")}
        </Button>
      </div>
    </Page>
  );
}

/** Account and sync. Shows "local only" when the app runs without Supabase env. */
function AccountCard() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ state: "local", lastAt: null });

  useEffect(() => {
    if (!isCloudEnabled) return;
    getSession().then((s) => setUserEmail(s?.user.email ?? null));
    const offAuth = onAuthChange((s) => setUserEmail(s?.user.email ?? null));
    const offSync = onSyncStatus(setSync);
    return () => {
      offAuth();
      offSync();
    };
  }, []);

  if (!isCloudEnabled) {
    return (
      <Card className="mb-4">
        <div className="font-bold">Konto</div>
        <p className="text-sm text-ink-2">
          Nur lokal: Alle Daten bleiben auf diesem Gerät. Konto und Synchronisation werden mit dem
          Server aktiviert.
        </p>
      </Card>
    );
  }

  if (userEmail) {
    return (
      <Card className="mb-4">
        <div className="font-bold">Konto</div>
        <p className="text-sm text-ink-2">Angemeldet als {userEmail}</p>
        <p className="mt-1 text-xs text-ink-3">
          Sync:{" "}
          {sync.state === "syncing"
            ? "läuft …"
            : sync.state === "error"
              ? `Fehler (${sync.error ?? ""})`
              : sync.lastAt
                ? `zuletzt ${new Date(sync.lastAt).toLocaleString("de-DE")}`
                : "noch nicht"}
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => syncNow()}>
            Jetzt synchronisieren
          </Button>
          <Button size="sm" variant="ghost" onClick={() => signOut()}>
            Abmelden
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="font-bold">Konto</div>
      <p className="mb-2 text-sm text-ink-2">
        Melde dich mit einem Magic Link an, um Listen und Fortschritt zu sichern und auf anderen
        Geräten zu nutzen.
      </p>
      {sent ? (
        <p className="text-sm text-sage-deep">Link verschickt – prüfe dein Postfach.</p>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail"
            className="flex-1 rounded-chip border border-line bg-white px-4 py-2 outline-none focus:border-ink"
          />
          <Button
            size="sm"
            disabled={!email.includes("@")}
            onClick={async () => {
              await signInWithEmail(email);
              setSent(true);
            }}
          >
            Link senden
          </Button>
        </div>
      )}
    </Card>
  );
}
