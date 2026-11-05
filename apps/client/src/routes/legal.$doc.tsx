import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Markdownish, Page } from "@/components/ui";
import { AGB, DATENSCHUTZ, IMPRESSUM } from "@/data/legal";

export const Route = createFileRoute("/legal/$doc")({ component: Legal });

const DOCS: Record<string, string> = { agb: AGB, datenschutz: DATENSCHUTZ, impressum: IMPRESSUM };

function Legal() {
  const { doc } = Route.useParams();
  const text = DOCS[doc] ?? "# Nicht gefunden";
  return (
    <Page
      back={
        <Link to="/settings" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <Markdownish text={text} />
      <p className="mt-6 text-xs text-ink-3">
        Entwurf. Keine Rechtsberatung; vor Veröffentlichung anwaltlich prüfen lassen.
      </p>
    </Page>
  );
}
