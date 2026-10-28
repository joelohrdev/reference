"use client";

import { useMemo, useRef, useState } from "react";
import { hexToRgb, matchQuality, textColorOn } from "@/lib/color";
import { bestMixes, bestSinglePaints, type MixResult } from "@/lib/mixing";
import { PAINTS, STARTER_PALETTE, paintById } from "@/lib/paints";

interface Props {
  color: string | null;
  recent: string[];
  /** Dominant colours of the current image. */
  palette: string[];
  picking: boolean;
  hasImage: boolean;
  onPickFromView: () => void;
  onColorChange: (hex: string) => void;
  paintIds: string[];
  onPaintIdsChange: (ids: string[]) => void;
  onClose: () => void;
}

export function ColorMixer(p: Props) {
  const [tab, setTab] = useState<"mine" | "best">("mine");
  const [view, setView] = useState<"mixer" | "paints">("mixer");
  const colorInput = useRef<HTMLInputElement>(null);

  const myPaints = useMemo(() => p.paintIds.map((id) => paintById.get(id)).filter((x) => x !== undefined), [p.paintIds]);

  const mixes = useMemo(
    () => (p.color && myPaints.length > 0 ? bestMixes(hexToRgb(p.color), myPaints) : []),
    [p.color, myPaints],
  );
  const best = useMemo(() => (p.color ? bestSinglePaints(hexToRgb(p.color), PAINTS) : []), [p.color]);

  const togglePaint = (id: string) =>
    p.onPaintIdsChange(p.paintIds.includes(id) ? p.paintIds.filter((x) => x !== id) : [...p.paintIds, id]);

  return (
    <aside className="flex h-full w-full flex-col overflow-x-hidden bg-[#1b1b1b] text-[13.5px] text-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <h2 className="text-[15px] font-semibold">{view === "mixer" ? "Color mixer" : "My paints"}</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView(view === "mixer" ? "paints" : "mixer")}
            className="text-neutral-300 hover:text-white"
          >
            {view === "mixer" ? `My paints (${p.paintIds.length})` : "Back to mixer"}
          </button>
          <button type="button" onClick={p.onClose} aria-label="Close color mixer" className="text-neutral-300 hover:text-white">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {view === "paints" ? (
        <PaintPicker ids={p.paintIds} onToggle={togglePaint} onSet={p.onPaintIdsChange} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => colorInput.current?.click()}
              title="Enter a colour by hand"
              className="h-16 w-16 shrink-0 rounded-xl border border-white/15"
              style={{
                background: p.color ?? undefined,
                backgroundImage: p.color
                  ? undefined
                  : "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)",
                backgroundSize: p.color ? undefined : "14px 14px",
              }}
            />
            <input
              ref={colorInput}
              type="color"
              className="sr-only"
              value={p.color ?? "#808080"}
              onChange={(e) => p.onColorChange(e.target.value)}
            />
            <button
              type="button"
              disabled={!p.hasImage}
              onClick={p.onPickFromView}
              className={`flex-1 rounded-full px-4 py-3 text-center font-semibold text-black transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                p.picking ? "bg-amber-200" : "bg-amber-400 hover:bg-amber-300"
              }`}
            >
              {p.picking ? "Click the image…" : "Pick a color from the view"}
            </button>
          </div>

          {p.palette.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-14 text-neutral-400">Image</span>
              {p.palette.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  onClick={() => p.onColorChange(hex)}
                  title={hex}
                  className={`h-8 w-8 rounded-lg border ${hex === p.color ? "border-amber-400" : "border-white/15"}`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          )}

          {p.recent.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-14 text-neutral-400">Recent</span>
              {p.recent.map((hex, i) => (
                <button
                  key={`${hex}-${i}`}
                  type="button"
                  onClick={() => p.onColorChange(hex)}
                  title={hex}
                  className={`h-8 w-8 rounded-lg border ${hex === p.color ? "border-amber-400" : "border-white/15"}`}
                  style={{ background: hex }}
                />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 rounded-full bg-white/[0.06] p-1">
            {(["mine", "best"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full py-1.5 text-center transition-colors ${
                  tab === t ? "bg-white text-black" : "text-neutral-300 hover:text-white"
                }`}
              >
                {t === "mine" ? "Mix from my paints" : "Best paints for this"}
              </button>
            ))}
          </div>

          {!p.color ? (
            <p className="text-[15px] text-neutral-300">Pick a color to see how to mix it.</p>
          ) : tab === "mine" ? (
            myPaints.length === 0 ? (
              <div className="flex flex-col items-start gap-2 text-neutral-300">
                <p>Add the paints you own first, and the mixer will work from those.</p>
                <button
                  type="button"
                  onClick={() => setView("paints")}
                  className="rounded-full border border-white/20 px-3 py-1.5 text-white hover:bg-white/10"
                >
                  Choose my paints
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {mixes.map((m, i) => (
                  <MixCard key={i} mix={m} target={p.color!} />
                ))}
              </div>
            )
          ) : (
            <div className="flex flex-col gap-2">
              {best.map((m) => (
                <SinglePaintRow key={m.parts[0].paint.id} mix={m} target={p.color!} owned={p.paintIds.includes(m.parts[0].paint.id)} />
              ))}
            </div>
          )}

          <p className="mt-auto pt-2 text-[12px] leading-relaxed text-neutral-500">
            Mixes are simulated with the Kubelka–Munk paint model (watercolor). Treat them as a starting point: real
            paints vary by brand, and screens differ.
          </p>
        </div>
      )}
    </aside>
  );
}

function Quality({ dE }: { dE: number }) {
  const q = matchQuality(dE);
  const tone = q.tone === "good" ? "text-emerald-300" : q.tone === "ok" ? "text-amber-300" : "text-red-300";
  return (
    <span className={`text-[12px] ${tone}`}>
      {q.label} <span className="text-neutral-500">ΔE {dE.toFixed(1)}</span>
    </span>
  );
}

function Compare({ target, result }: { target: string; result: string }) {
  return (
    <div className="flex h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-white/15" title="Target | mix">
      <div className="flex-1" style={{ background: target }} />
      <div className="flex-1" style={{ background: result }} />
    </div>
  );
}

function MixCard({ mix, target }: { mix: MixResult; target: string }) {
  const water = Math.round((1 - mix.dilution) * 100);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-3">
        <Compare target={target} result={mix.hex} />
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">
            {mix.parts.map((part) => part.paint.name).join(" + ")}
          </span>
          <Quality dE={mix.deltaE} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {mix.parts.map((part) => (
          <div key={part.paint.id} className="flex items-center gap-2 text-[12.5px]">
            <span className="h-4 w-4 shrink-0 rounded border border-white/15" style={{ background: part.paint.hex }} />
            <span className="w-28 truncate">{part.paint.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${part.amount * 100}%`, background: part.paint.hex }} />
            </div>
            <span className="w-9 text-right tabular-nums text-neutral-300">{Math.round(part.amount * 100)}%</span>
          </div>
        ))}
        {water > 5 && (
          <div className="flex items-center gap-2 text-[12.5px] text-neutral-400">
            <span className="h-4 w-4 shrink-0 rounded border border-white/15 bg-white/80" />
            <span className="w-28">Water</span>
            <span className="flex-1 truncate">{water < 30 ? "a touch" : water < 60 ? "a fair amount" : water < 85 ? "light wash" : "pale tint"}</span>
            <span className="w-9 text-right tabular-nums">{water}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SinglePaintRow({ mix, target, owned }: { mix: MixResult; target: string; owned: boolean }) {
  const paint = mix.parts[0].paint;
  const water = Math.round((1 - mix.dilution) * 100);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <Compare target={target} result={mix.hex} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {paint.name} <span className="text-neutral-500">{paint.pigment}</span>
        </span>
        {owned && <span className="text-[11px] text-amber-300">In my paints</span>}
        <span className="text-[12px] text-neutral-400">{water > 5 ? `diluted about ${water}%` : "full strength"}</span>
        <Quality dE={mix.deltaE} />
      </div>
    </div>
  );
}

function PaintPicker({
  ids,
  onToggle,
  onSet,
}: {
  ids: string[];
  onToggle: (id: string) => void;
  onSet: (ids: string[]) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 px-4 py-3 text-[12px]">
        <button
          type="button"
          onClick={() => onSet(STARTER_PALETTE)}
          className="rounded-full border border-white/20 px-3 py-1 hover:bg-white/10"
        >
          Use a starter palette
        </button>
        <button
          type="button"
          onClick={() => onSet([])}
          disabled={ids.length === 0}
          className="rounded-full border border-white/20 px-3 py-1 hover:bg-white/10 disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {PAINTS.map((paint) => {
          const on = ids.includes(paint.id);
          return (
            <li key={paint.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(paint.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] ${on ? "bg-white/[0.04]" : ""}`}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15"
                  style={{ background: paint.hex, color: textColorOn(paint.hex) }}
                >
                  {on && (
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1">{paint.name}</span>
                <span className="text-[11px] text-neutral-500">{paint.pigment}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
