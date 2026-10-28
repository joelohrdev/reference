"use client";

import { hexToRgb } from "@/lib/color";

interface Props {
  steps: 5 | 9;
  height: number;
  /** The sampled colour whose value step should light up, if any. */
  color: string | null;
}

/** A gray scale beside the image: white at the top, black at the bottom. */
export function ValueScale({ steps, height, color }: Props) {
  const lum = color ? (([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b)(hexToRgb(color)) : null;
  const active = lum === null ? null : Math.round(((255 - lum) / 255) * (steps - 1));
  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-md border border-white/20" style={{ height, width: 34 }} title="Value scale">
      {Array.from({ length: steps }, (_, i) => {
        const v = Math.round(255 - (i * 255) / (steps - 1));
        const on = active === i;
        return (
          <div
            key={i}
            className="relative flex flex-1 items-center justify-center text-[10px] font-semibold tabular-nums"
            style={{ background: `rgb(${v},${v},${v})`, color: v > 140 ? "#333" : "#ddd" }}
          >
            {i + 1}
            {on && <span className="absolute inset-0 border-[3px] border-amber-400" />}
          </div>
        );
      })}
    </div>
  );
}
