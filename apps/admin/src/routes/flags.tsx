import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, input, Page, Toast } from "@/components/ui";
import { apiPost, list } from "@/lib/api";
import { useToast } from "@/lib/useToast";

export const Route = createFileRoute("/flags")({ component: Flags });

interface Flag {
  key: string;
  percentage: number;
  users: string[];
  enabled: boolean;
}

function Flags() {
  const qc = useQueryClient();
  const toast = useToast();
  const flags = useQuery({
    queryKey: ["feature_flags"],
    queryFn: () => list<Flag>("feature_flags"),
  });
  const [key, setKey] = useState("");
  async function save(f: Partial<Flag> & { key: string }) {
    await apiPost("/admin/flags", f);
    qc.invalidateQueries({ queryKey: ["feature_flags"] });
    toast.show("Gespeichert");
  }
  return (
    <Page
      title="Feature Flags"
      subtitle="v2: pro Nutzer und prozentualer Rollout; die App liest sie beim Start"
    >
      <Card className="mb-3 flex gap-2">
        <input
          className={`${input} max-w-xs`}
          placeholder="flag_key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button
          disabled={!key}
          onClick={() => {
            save({ key, percentage: 0, users: [], enabled: false });
            setKey("");
          }}
        >
          Anlegen
        </Button>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {flags.data?.map((f) => (
          <Card key={f.key}>
            <div className="flex items-center justify-between">
              <code className="font-bold">{f.key}</code>
              <Button
                size="sm"
                variant={f.enabled ? "primary" : "secondary"}
                onClick={() => save({ key: f.key, enabled: !f.enabled })}
              >
                {f.enabled ? "an" : "aus"}
              </Button>
            </div>
            <label className="mt-2 block text-sm">
              Rollout {f.percentage} %
              <input
                type="range"
                min={0}
                max={100}
                value={f.percentage}
                onChange={(e) => save({ key: f.key, percentage: Number(e.target.value) })}
                className="w-full accent-sage-deep"
              />
            </label>
            <div className="text-xs text-ink-3">
              Nutzer: {f.users.length ? f.users.join(", ") : "–"}
            </div>
          </Card>
        ))}
      </div>
      <Toast msg={toast.msg} />
    </Page>
  );
}
