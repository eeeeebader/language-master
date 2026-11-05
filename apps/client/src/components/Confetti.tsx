import { useEffect, useState } from "react";

const COLOURS = ["#b7c9a8", "#e8b4b8", "#c9bfe3", "#f0cf8c", "#a9cde6"];

export function Confetti({ count = 40 }: { count?: number }) {
  const [pieces, setPieces] = useState<
    { id: number; left: number; delay: number; colour: string }[]
  >([]);
  useEffect(() => {
    setPieces(
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 400,
        colour: COLOURS[i % COLOURS.length] as string,
      })),
    );
    const tm = setTimeout(() => setPieces([]), 2000);
    return () => clearTimeout(tm);
  }, [count]);
  return (
    <>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti"
          style={{ left: `${p.left}%`, animationDelay: `${p.delay}ms`, background: p.colour }}
        />
      ))}
    </>
  );
}
