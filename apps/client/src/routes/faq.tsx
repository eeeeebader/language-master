import { ArrowLeft } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, Page } from "@/components/ui";
import { FAQ } from "@/data/legal";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/faq")({ component: Faq });

function Faq() {
  return (
    <Page
      title={t("settings.faq")}
      back={
        <Link to="/settings" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      <div className="space-y-3">
        {FAQ.map((f, i) => (
          <Card key={f.q}>
            <div className="font-bold">
              {i + 1}. {f.q}
            </div>
            <p className="mt-1 text-ink-2">{f.a}</p>
          </Card>
        ))}
      </div>
    </Page>
  );
}
