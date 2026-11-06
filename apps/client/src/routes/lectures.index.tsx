import { Lock } from "@phosphor-icons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef } from "react";
import { cx, Page } from "@/components/ui";
import { LECTURES_ES } from "@/data/lectures-es";
import { db } from "@/db/db";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/lectures/")({ component: Lectures });

const W = 360;
const STEP = 124;
const NODE_W = 220;
const SIDE_W = 188;
const NODE_H = 84;

/**
 * The learning path: main lectures in a winding column, side lectures hanging off their
 * requirement next to the road so the learner sees they are optional.
 */
function Lectures() {
  const done = new Set(
    (useLiveQuery(() => db.lectureProgress.toArray(), []) ?? []).map((d) => d.lectureId),
  );
  const navigate = useNavigate();
  const progress = useLiveQuery(() => db.lectureProgress.toArray(), []);
  const currentRef = useRef<SVGGElement>(null);
  // Open the path at the next lecture to do, so the learner never scrolls past done nodes.
  useEffect(() => {
    if (progress) currentRef.current?.scrollIntoView({ block: "center" });
  }, [progress]);
  const nodes = LECTURES_ES.map((l, i) => {
    const cy = 60 + i * STEP;
    const w = l.side ? SIDE_W : NODE_W;
    const cx = l.side ? W - SIDE_W / 2 - 8 : W / 2 + l.offset * 60;
    const locked = l.requires.some((r) => !done.has(r));
    return { l, w, x: cx - w / 2, y: cy - NODE_H / 2, cx, cy, locked, isDone: done.has(l.id) };
  });
  const main = nodes.filter((n) => !n.l.side);
  const current = nodes.find((n) => !n.isDone && !n.locked && !n.l.side) ?? nodes[0];
  const byId = new Map(nodes.map((n) => [n.l.id, n]));
  const height = 60 + nodes.length * STEP;

  const road = (
    from: (typeof nodes)[number],
    to: (typeof nodes)[number],
    dashed: boolean,
    lit: boolean,
  ) => {
    const midY = (from.cy + to.cy) / 2;
    return (
      <path
        key={`${from.l.id}-${to.l.id}`}
        d={`M ${from.cx} ${from.cy + NODE_H / 2} C ${from.cx} ${midY}, ${to.cx} ${midY}, ${to.cx} ${to.cy - NODE_H / 2}`}
        fill="none"
        stroke={lit ? "#b7c9a8" : "#e7e1d8"}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={dashed ? "2 10" : undefined}
      />
    );
  };

  return (
    <Page title={t("lectures.title")}>
      <p className="-mt-3 mb-4 text-sm text-ink-2">{t("lectures.subtitle")}</p>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Lernpfad">
        {main.slice(1).map((n, i) => {
          const p = main[i] as (typeof nodes)[number];
          return road(p, n, n.locked, n.isDone || p.isDone);
        })}
        {nodes
          .filter((n) => n.l.side)
          .map((n) => {
            const p = byId.get(n.l.requires[0] ?? "");
            return p ? road(p, n, n.locked, n.isDone) : null;
          })}
        {nodes.map((n) => (
          <g
            key={n.l.id}
            ref={n === current ? currentRef : undefined}
            className={cx("cursor-pointer", n.locked && "opacity-70")}
            onClick={() => navigate({ to: "/lectures/$slug", params: { slug: n.l.slug } })}
          >
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={NODE_H}
              rx={18}
              fill={n.isDone ? "#e6eedf" : n.locked ? "#f3efe8" : "#ffffff"}
              stroke={n.isDone ? "#b7c9a8" : n.l.side ? "#cfc7bb" : "#e7e1d8"}
              strokeWidth={1.5}
              strokeDasharray={n.l.side && !n.isDone ? "6 4" : undefined}
            />
            <text
              x={n.x + 16}
              y={n.y + 32}
              fontSize={n.l.side ? 12 : 14}
              fontWeight={700}
              fill="#2b2a28"
            >
              {n.l.title.de.length > 24 ? `${n.l.title.de.slice(0, 23)}…` : n.l.title.de}
            </text>
            <text x={n.x + 16} y={n.y + 52} fontSize={11} fill="#6b665f">
              {n.l.summary.de.length > (n.l.side ? 24 : 34)
                ? `${n.l.summary.de.slice(0, n.l.side ? 22 : 32)}…`
                : n.l.summary.de}
            </text>
            {n.l.side && (
              <text x={n.x + 16} y={n.y + 70} fontSize={10} fill="#a39d94">
                {t("lectures.optional")}
              </text>
            )}
            {n.locked && (
              <foreignObject x={n.x + n.w - 38} y={n.y + 10} width={28} height={28}>
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-line text-ink-3">
                  <Lock size={14} />
                </div>
              </foreignObject>
            )}
          </g>
        ))}
      </svg>
    </Page>
  );
}
