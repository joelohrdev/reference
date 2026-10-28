"use client";

import { useEffect, useRef, useState } from "react";
import type { LibraryItem } from "@/lib/library";

interface Props {
  items: LibraryItem[];
  currentId: string | null;
  compareId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCompare: (id: string | null) => void;
}

const INTERVALS = [
  { s: 30, label: "30 s" },
  { s: 60, label: "1 min" },
  { s: 120, label: "2 min" },
  { s: 300, label: "5 min" },
  { s: 600, label: "10 min" },
];

/** Recent images as a strip, with a timer that cycles through them for pose practice. */
export function Library({ items, currentId, compareId, onOpen, onDelete, onCompare }: Props) {
  const [interval, setIntervalS] = useState(60);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const remainingRef = useRef(60);
  const advanceRef = useRef<(dir: 1 | -1) => void>(() => {});

  const advance = (dir: 1 | -1) => {
    if (items.length === 0) return;
    const i = items.findIndex((it) => it.id === currentId);
    const next = items[(i + dir + items.length) % items.length];
    if (next) onOpen(next.id);
  };
  useEffect(() => {
    advanceRef.current = advance;
  });

  useEffect(() => {
    if (!running) return;
    remainingRef.current = interval;
    const id = window.setInterval(() => {
      remainingRef.current -= 1;
      if (remainingRef.current <= 0) {
        remainingRef.current = interval;
        advanceRef.current(1);
      }
      setRemaining(remainingRef.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, interval]);

  if (items.length === 0) return null;

  return (
    <div className="flex h-[88px] shrink-0 items-center gap-3 border-t border-white/10 bg-[#141414] px-3">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-2">
        {items.map((it) => {
          const current = it.id === currentId;
          const comparing = it.id === compareId;
          return (
            <div key={it.id} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => onOpen(it.id)}
                title={it.name}
                className={`block h-16 overflow-hidden rounded-md border-2 ${current ? "border-amber-400" : comparing ? "border-sky-400" : "border-transparent hover:border-white/40"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt={it.name} className="h-full w-auto" draggable={false} />
              </button>
              <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                {!current && (
                  <button
                    type="button"
                    onClick={() => onCompare(comparing ? null : it.id)}
                    title={comparing ? "Stop comparing" : "Compare beside the current image"}
                    className={`rounded px-1.5 text-[10px] ${comparing ? "bg-sky-400 text-black" : "bg-black/70 text-white"}`}
                  >
                    {comparing ? "Comparing" : "Compare"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(it.id)}
                  title="Remove from library"
                  className="rounded bg-black/70 px-1.5 text-[10px] text-white hover:bg-red-500"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-2 text-[12px] text-neutral-300">
        <button type="button" onClick={() => advance(-1)} className="rounded-full border border-white/15 px-2 py-1 hover:bg-white/10" title="Previous image">
          ‹
        </button>
        <button type="button" onClick={() => advance(1)} className="rounded-full border border-white/15 px-2 py-1 hover:bg-white/10" title="Next image">
          ›
        </button>
        <select
          value={interval}
          onChange={(e) => {
            const s = Number(e.target.value);
            setIntervalS(s);
            setRemaining(s);
          }}
          className="rounded-lg border border-white/15 bg-[#242424] px-2 py-1 text-white"
          aria-label="Pose timer interval"
        >
          {INTERVALS.map((i) => (
            <option key={i.s} value={i.s}>
              {i.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!running) setRemaining(interval);
            setRunning(!running);
          }}
          className={`w-24 rounded-full px-3 py-1 font-medium ${running ? "bg-amber-400 text-black" : "border border-white/15 hover:bg-white/10"}`}
        >
          {running ? `${Math.max(0, remaining)} s` : "Start timer"}
        </button>
      </div>
    </div>
  );
}
