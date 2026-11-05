import type { ReactNode } from "react";
import { cx } from "./ui";

export function FlipCard({
  front,
  back,
  flipped,
  onFlip,
  footer,
}: {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  onFlip?: () => void;
  footer?: ReactNode;
}) {
  return (
    <div className="flip-scene" onClick={onFlip}>
      <div
        className={cx("flip-card relative min-h-[260px] cursor-pointer", flipped && "is-flipped")}
      >
        <div className="flip-face absolute inset-0 flex flex-col items-center justify-center rounded-card border border-line bg-white p-6 text-center shadow-sm">
          <div className="text-3xl font-extrabold leading-tight">{front}</div>
          <div className="mt-4 text-xs uppercase tracking-wide text-ink-3">Tippen zum Umdrehen</div>
        </div>
        <div className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center rounded-card border border-line bg-paper-2 p-6 text-center">
          <div className="text-2xl font-bold leading-tight">{back}</div>
          {footer && <div className="mt-4">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
