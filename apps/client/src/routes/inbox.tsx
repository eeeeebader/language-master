import { ArrowLeft, Tray } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect } from "react";
import { Card, Empty, Markdownish, Page } from "@/components/ui";
import { db } from "@/db/db";
import { markAllRead, refreshInbox } from "@/lib/inbox";

export const Route = createFileRoute("/inbox")({ component: Inbox });

function Inbox() {
  const items = useLiveQuery(() => db.inbox.orderBy("at").reverse().toArray(), []) ?? [];
  useEffect(() => {
    refreshInbox().then(() => markAllRead());
  }, []);
  return (
    <Page
      title="Postfach"
      back={
        <Link to="/" className="rounded-full p-2 hover:bg-paper-2">
          <ArrowLeft size={22} />
        </Link>
      }
    >
      {items.length === 0 && (
        <Empty>
          <Tray size={28} className="mx-auto mb-2 text-ink-3" />
          Keine Neuigkeiten. Hier erscheinen Änderungen an der App, an AGB und Datenschutz sowie
          Ankündigungen.
        </Empty>
      )}
      <div className="grid gap-2">
        {items.map((it) => (
          <Card
            key={it.id}
            tone={it.kind === "legal" ? "amber" : it.kind === "announcement" ? "sky" : undefined}
            className={it.kind === "changelog" ? "" : "border-transparent"}
          >
            <div className="flex items-center justify-between">
              <div className="font-bold">{it.title}</div>
              <div className="text-xs text-ink-3">
                {new Date(it.at).toLocaleDateString("de-DE")}
              </div>
            </div>
            <div className="mt-1 text-sm">
              <Markdownish text={it.markdown} />
            </div>
            {it.kind === "legal" && it.document && (
              <Link
                to="/legal/$doc"
                params={{ doc: it.document === "privacy" ? "datenschutz" : it.document }}
                className="mt-2 inline-block text-sm underline"
              >
                Lesen
              </Link>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
