import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, Card, Markdownish, Page } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { acceptPending, currentLegal, onPendingConsent, pendingConsent } from "@/lib/consent";

export const Route = createFileRoute("/consent")({ component: Consent });

const TITLE = { agb: "Allgemeine Geschäftsbedingungen", privacy: "Datenschutzerklärung" } as const;

function Consent() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<("agb" | "privacy")[]>(pendingConsent());
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => onPendingConsent(setPending), []);
  // Leave only after an acceptance in this screen; a cold load with nothing pending shows a hint.
  useEffect(() => {
    if (done && pending.length === 0) navigate({ to: "/" });
  }, [done, pending, navigate]);
  const docs = currentLegal();

  async function accept() {
    setBusy(true);
    setError(null);
    const ok = await acceptPending();
    setBusy(false);
    if (ok) setDone(true);
    if (!ok)
      setError("Die Zustimmung konnte nicht gespeichert werden. Bitte versuche es noch einmal.");
  }

  return (
    <Page title="Aktualisierte Bedingungen">
      {pending.length === 0 && (
        <p className="mb-4 rounded-card bg-sage-soft p-3 text-sm text-sage-deep">
          Alles aktuell – es gibt nichts zu bestätigen.
        </p>
      )}
      <p className="mb-4 text-ink-2">
        Wir haben {pending.map((d) => TITLE[d]).join(" und ")} geändert. Bitte lies die neue Fassung
        und stimme zu, um Language Master weiter zu nutzen. Gekaufte Leistungen bleiben erhalten.
      </p>
      {pending.map((d) => (
        <Card key={d} className="mb-4 max-h-[50dvh] overflow-y-auto">
          <div className="mb-2 text-xs uppercase tracking-wide text-ink-3">
            {TITLE[d]} · Version {docs[d]?.version}
          </div>
          <Markdownish text={docs[d]?.markdown ?? ""} />
        </Card>
      ))}
      <label className="flex items-start gap-3 rounded-card border border-line bg-white p-4">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span className="font-medium">Ich habe die neue Fassung gelesen und stimme zu.</span>
      </label>
      {error && (
        <p className="mt-3 rounded-card bg-rose-soft p-3 text-sm text-rose-deep">{error}</p>
      )}
      <Button full size="lg" className="mt-4" disabled={!checked || busy} onClick={accept}>
        Zustimmen und weiter
      </Button>
      <Button full variant="ghost" className="mt-2" onClick={() => signOut()}>
        Nicht zustimmen und abmelden
      </Button>
    </Page>
  );
}
