import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Markdownish, Page } from "@/components/ui";
import { AGB, DATENSCHUTZ, IMPRESSUM } from "@/data/legal";
import { useSettings } from "@/hooks/useSettings";
import { fetchLegal, type LegalCurrent } from "@/lib/consent";

export const Route = createFileRoute("/legal/$doc")({ component: Legal });

const DOCS: Record<string, string> = { agb: AGB, datenschutz: DATENSCHUTZ, impressum: IMPRESSUM };

function Legal() {
  const { doc } = Route.useParams();
  const settings = useSettings();
  const [server, setServer] = useState<LegalCurrent>({});
  useEffect(() => {
    fetchLegal().then(setServer);
  }, []);
  const key = (doc === "datenschutz" ? "privacy" : doc) as keyof LegalCurrent;
  const text = server[key]?.markdown ?? DOCS[doc] ?? "# Nicht gefunden";
  const version = server[key]?.version;
  return (
    <Page
      back={
        <Link
          to={settings ? "/settings" : "/onboarding"}
          className="rounded-full p-2 hover:bg-paper-2"
        >
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Markdownish text={text} />
      <p className="mt-6 text-xs text-ink-3">
        {version
          ? `Version ${version}`
          : "Entwurf. Keine Rechtsberatung; vor Veröffentlichung anwaltlich prüfen lassen."}
      </p>
    </Page>
  );
}
