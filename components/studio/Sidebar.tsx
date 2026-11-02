"use client";

import type { ReactNode } from "react";
import {
  FRAME_RATIOS,
  VIEW_MODES,
  type PerspectiveMode,
  type SessionSettings,
  type Tool,
} from "@/lib/types";

export interface SidebarProps {
  hasImage: boolean;
  settings: SessionSettings;
  patch: (patch: Partial<SessionSettings>) => void;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  onClearMarks: () => void;
  canSnapEyeLevel: boolean;
  onSnapEyeLevel: () => void;
  autoNotan: number | null;
  cropped: boolean;
  onRevertCrop: () => void;
  onOpenMixer: () => void;
  onOpenAssistant: () => void;
  onExportView: () => void;
  onExportSheet: () => void;
}

export function Sidebar(p: SidebarProps) {
  const s = p.settings;
  const toolButton = (id: Tool, label: string, hint?: string) => (
    <Btn active={p.tool === id} disabled={!p.hasImage} onClick={() => p.onToolChange(p.tool === id ? "none" : id)}>
      {label}
      {hint && <span className="text-neutral-400"> {hint}</span>}
    </Btn>
  );
  const setVpMode = (mode: PerspectiveMode) => p.patch({ vpMode: mode, showVps: true, eyeLevel: true });

  return (
    <aside className="flex h-full w-full flex-col gap-5 overflow-x-hidden overflow-y-auto bg-[#1b1b1b] px-4 py-4 text-[13.5px] text-white">
      <Section title="Image">
        <div className="grid grid-cols-2 gap-2">
          {toolButton("crop", "Crop")}
          <Btn disabled={!p.cropped} onClick={p.onRevertCrop}>
            Undo crop
          </Btn>
        </div>
        <Check label="Flip horizontally (F)" checked={s.flip} onChange={(v) => p.patch({ flip: v })} />
      </Section>

      <Section title="Composition">
        <Check label="Rule-of-thirds grid" checked={s.grids.thirds} onChange={(v) => p.patch({ grids: { ...s.grids, thirds: v } })} />
        <Check label="Golden-ratio grid" checked={s.grids.golden} onChange={(v) => p.patch({ grids: { ...s.grids, golden: v } })} />
        <Check label="Diagonals and reciprocals" checked={s.grids.diagonals} onChange={(v) => p.patch({ grids: { ...s.grids, diagonals: v } })} />
        <Check label="Center lines" checked={s.grids.center} onChange={(v) => p.patch({ grids: { ...s.grids, center: v } })} />
        <div className="flex items-center gap-2">
          <Check label="Proportion grid" checked={s.propGrid.on} onChange={(v) => p.patch({ propGrid: { ...s.propGrid, on: v } })} />
          <input
            type="range"
            min={2}
            max={16}
            step={1}
            value={s.propGrid.cols}
            disabled={!s.propGrid.on}
            onChange={(e) => p.patch({ propGrid: { ...s.propGrid, cols: Number(e.target.value) } })}
            className="ml-2 flex-1 accent-amber-400 disabled:opacity-40"
            aria-label="Proportion grid columns"
          />
          <span className="w-10 text-right text-[12px] tabular-nums text-neutral-300">{s.propGrid.cols} col</span>
        </div>
        <div className="mt-1 flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-neutral-300">Canvas size</span>
            <select
              value={s.frame.ratio ?? ""}
              onChange={(e) => p.patch({ frame: { ...s.frame, ratio: e.target.value || null } })}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#242424] px-2 py-1.5 text-white"
            >
              <option value="">No frame</option>
              {FRAME_RATIOS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {s.frame.ratio && (
            <div className="flex items-center gap-2 text-[12px]">
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/15">
                {(["Landscape", "Portrait"] as const).map((o) => {
                  const on = (o === "Landscape") === s.frame.landscape;
                  return (
                    <button
                      key={o}
                      type="button"
                      onClick={() => p.patch({ frame: { ...s.frame, landscape: o === "Landscape" } })}
                      className={`px-2.5 py-1 ${on ? "bg-amber-400 text-black" : "text-neutral-300 hover:bg-white/10"}`}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={s.frame.scale}
                onChange={(e) => p.patch({ frame: { ...s.frame, scale: Number(e.target.value) } })}
                className="flex-1 accent-amber-400"
                aria-label="Frame size"
              />
              <span className="w-9 text-right tabular-nums text-neutral-300">{Math.round(s.frame.scale * 100)}%</span>
            </div>
          )}
          {s.frame.ratio && <p className="text-[11.5px] text-neutral-500">Drag the frame edge to move it. Grids draw inside it.</p>}
        </div>
      </Section>

      <Section title="Perspective">
        <Check label="Eye-level line" checked={s.eyeLevel} onChange={(v) => p.patch({ eyeLevel: v })} />
        <Check label="Vanishing points from the street" checked={s.showVps} onChange={(v) => p.patch({ showVps: v })} />
        <div className="mt-0.5 grid grid-cols-3 gap-2">
          <Btn active={s.showVps && s.vpMode === "one"} onClick={() => setVpMode("one")}>
            One-point
          </Btn>
          <Btn active={s.showVps && s.vpMode === "two"} onClick={() => setVpMode("two")}>
            Two-point
          </Btn>
          <Btn active={s.showVps && s.vpMode === "three"} onClick={() => setVpMode("three")}>
            Three-point
          </Btn>
        </div>
        <div className="mt-1">{toolButton("level", "Level the view", "(L): verticals stay vertical")}</div>
        {s.rotation !== 0 && (
          <div className="mt-1 flex items-center gap-2 text-[12px] text-neutral-300">
            <input
              type="range"
              min={-20}
              max={20}
              step={0.1}
              value={s.rotation}
              onChange={(e) => p.patch({ rotation: Number(e.target.value) })}
              className="flex-1 accent-amber-400"
              aria-label="Rotation"
            />
            <span className="w-11 text-right tabular-nums">{s.rotation.toFixed(1)}°</span>
            <button type="button" onClick={() => p.patch({ rotation: 0 })} className="text-amber-300 hover:underline">
              Reset
            </button>
          </div>
        )}
      </Section>

      <Section title="Sighting tools">
        {toolButton("findVp", "Find a vanishing point")}
        {toolButton("angle", "Measure angles")}
        {toolButton("proportion", "Compare proportions")}
        {toolButton("plumb", "Plumb and level lines")}
        {(s.marks.length > 0 || p.canSnapEyeLevel) && (
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px]">
            {p.canSnapEyeLevel && (
              <button
                type="button"
                onClick={p.onSnapEyeLevel}
                className="rounded-full border border-sky-400/50 px-2.5 py-1 text-sky-200 hover:bg-sky-400/10"
              >
                Snap eye level to found point
              </button>
            )}
            {s.marks.length > 0 && (
              <button
                type="button"
                onClick={p.onClearMarks}
                className="rounded-full border border-white/15 px-2.5 py-1 text-neutral-200 hover:bg-white/10"
              >
                Clear marks ({s.marks.length})
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="View as">
        <div className="flex flex-wrap gap-1.5">
          {VIEW_MODES.map((m) => (
            <Pill key={m.id} active={s.mode === m.id} disabled={!p.hasImage} onClick={() => p.patch({ mode: m.id })}>
              {m.label}
            </Pill>
          ))}
        </div>
        {s.mode === "notan" && (
          <div className="flex items-center gap-2 text-[12px] text-neutral-300">
            <span className="shrink-0">Split</span>
            <input
              type="range"
              min={0}
              max={255}
              step={1}
              value={s.notanThreshold ?? p.autoNotan ?? 128}
              onChange={(e) => p.patch({ notanThreshold: Number(e.target.value) })}
              className="flex-1 accent-amber-400"
              aria-label="Notan threshold"
            />
            <span className="w-7 text-right tabular-nums">{s.notanThreshold ?? p.autoNotan ?? 128}</span>
            <button
              type="button"
              disabled={s.notanThreshold === null}
              onClick={() => p.patch({ notanThreshold: null })}
              className="text-amber-300 hover:underline disabled:text-neutral-600 disabled:no-underline"
            >
              Auto
            </button>
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Check label="Squint" checked={s.squint} onChange={(v) => p.patch({ squint: v })} />
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={s.squintStrength}
            disabled={!s.squint}
            onChange={(e) => p.patch({ squintStrength: Number(e.target.value) })}
            className="ml-2 flex-1 accent-amber-400 disabled:opacity-40"
            aria-label="Squint strength"
          />
          <span className={`w-5 text-right text-[12px] tabular-nums ${s.squint ? "text-neutral-300" : "text-neutral-600"}`}>
            {s.squintStrength}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Check label="Value scale" checked={s.valueScale.on} onChange={(v) => p.patch({ valueScale: { ...s.valueScale, on: v } })} />
          <div className="ml-auto grid grid-cols-2 overflow-hidden rounded-lg border border-white/15 text-[12px]">
            {([5, 9] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => p.patch({ valueScale: { ...s.valueScale, steps: n } })}
                className={`px-2.5 py-1 ${s.valueScale.steps === n ? "bg-amber-400 text-black" : "text-neutral-300 hover:bg-white/10"}`}
              >
                {n} steps
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11.5px] text-neutral-500">
          Keys 1–6 and 8 switch views, 7 toggles squint. Scroll to zoom, hold Space to pan, 0 to fit. Esc cancels a tool.
        </p>
      </Section>

      <Section title="Color">
        <Btn onClick={p.onOpenMixer}>
          Color mixer
          <span className="text-neutral-400"> (C): pick a color, see how to mix it</span>
        </Btn>
      </Section>

      <Section title="Assistant">
        <Btn onClick={p.onOpenAssistant}>
          Studio assistant
          <span className="text-neutral-400"> (A): plan, perspective, palette, lessons</span>
        </Btn>
      </Section>

      <Section title="Export">
        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={!p.hasImage} onClick={p.onExportView}>
            View with overlays
          </Btn>
          <Btn disabled={!p.hasImage} onClick={p.onExportSheet}>
            Value sheet
          </Btn>
        </div>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-left"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] ${
          checked ? "bg-amber-400" : "bg-white"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="#1b1b1b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

function Btn({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`w-full rounded-lg border px-3 py-2 text-left leading-snug transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-amber-400 bg-amber-400/15 text-amber-100"
          : "border-white/15 bg-white/[0.04] hover:bg-white/[0.09]"
      }`}
    >
      {children}
    </button>
  );
}

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-amber-400 bg-amber-400 text-black" : "border-white/15 bg-white/[0.04] hover:bg-white/[0.09]"
      }`}
    >
      {children}
    </button>
  );
}
