import { Check, Lock } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { cx, Page } from "@/components/ui";
import { LECTURES_ES } from "@/data/lectures-es";
import { db } from "@/db/db";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/lectures/")({ component: Lectures });

const W = 360;
const STEP = 132;
const NODE_W = 220;
const NODE_H = 84;

function Lectures() {
  const done = new Set(
    (useLiveQuery(() => db.lectureProgress.toArray(), []) ?? []).map((d) => d.lectureId),
  );
  const navigate = useNavigate();
  const nodes = LECTURES_ES.map((l, i) => {
    const cx = W / 2 + l.offset * 60;
    const cy = 60 + i * STEP;
    const locked = l.requires.some((r) => !done.has(r));
    return { l, x: cx - NODE_W / 2, y: cy - NODE_H / 2, cx, cy, locked, isDone: done.has(l.id) };
  });
  const height = 60 + nodes.length * STEP;

  return (
    <Page title={t("lectures.title")}>
      <p className="-mt-3 mb-4 text-sm text-ink-2">{t("lectures.subtitle")}</p>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Lernpfad">
        {/* road */}
        {nodes.slice(1).map((n, i) => {
          const p = nodes[i] as (typeof nodes)[number];
          const midY = (p.cy + n.cy) / 2;
          return (
            <g key={n.l.id}>
              <path
                d={`M ${p.cx} ${p.cy + NODE_H / 2} C ${p.cx} ${midY}, ${n.cx} ${midY}, ${n.cx} ${n.cy - NODE_H / 2}`}
                fill="none"
                stroke={n.isDone || p.isDone ? "#b7c9a8" : "#e7e1d8"}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={n.locked ? "2 10" : undefined}
              />
              {p.l.edgeHint && (
                <text
                  x={W / 2 + (p.cx > n.cx ? -1 : 1) * 0}
                  y={midY + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#a39d94"
                >
                  {p.l.edgeHint.de.length > 48
                    ? `${p.l.edgeHint.de.slice(0, 46)}…`
                    : p.l.edgeHint.de}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((n) => (
          <g
            key={n.l.id}
            className={cx("cursor-pointer", n.locked && "opacity-70")}
            onClick={() => navigate({ to: "/lectures/$slug", params: { slug: n.l.slug } })}
          >
            <rect
              x={n.x}
              y={n.y}
              width={NODE_W}
              height={NODE_H}
              rx={18}
              fill={n.isDone ? "#e6eedf" : n.locked ? "#f3efe8" : "#ffffff"}
              stroke={n.isDone ? "#b7c9a8" : "#e7e1d8"}
              strokeWidth={1.5}
            />
            <text x={n.x + 16} y={n.y + 32} fontSize={14} fontWeight={700} fill="#2b2a28">
              {n.l.title.de}
            </text>
            <text x={n.x + 16} y={n.y + 52} fontSize={11} fill="#6b665f">
              {n.l.summary.de.length > 28 ? `${n.l.summary.de.slice(0, 26)}…` : n.l.summary.de} ·{" "}
              {n.l.minutes} min
            </text>
            <foreignObject x={n.x + NODE_W - 38} y={n.y + 10} width={28} height={28}>
              <div
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  n.isDone
                    ? "bg-sage-deep text-white"
                    : n.locked
                      ? "bg-line text-ink-3"
                      : "bg-paper-2 text-ink-3",
                )}
              >
                {n.isDone ? (
                  <Check size={16} weight="bold" />
                ) : n.locked ? (
                  <Lock size={14} />
                ) : null}
              </div>
            </foreignObject>
          </g>
        ))}
      </svg>
    </Page>
  );
}
