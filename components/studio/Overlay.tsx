"use client";

import { useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { FRAME_RATIOS, type Annotation, type Mark, type Pt, type Rect, type Segment, type SessionSettings, type Tool } from "@/lib/types";
import { angleFromHorizontal, clamp, clockPosition, length, segmentPx, toPx } from "@/lib/geometry";

interface Props {
  svgRef: RefObject<SVGSVGElement | null>;
  width: number;
  height: number;
  settings: SessionSettings;
  pendingSegment: Segment | null;
  tool: Tool;
  crop: Rect | null;
  annotations: Annotation[];
  askPoint: Pt | null;
  /** Space is held: the stage pans, the overlay stays out of the way. */
  panMode: boolean;
  onPatch: (patch: Partial<SessionSettings>) => void;
  onSegment: (segment: Segment) => void;
  onPoint: (point: Pt) => void;
  onCropChange: (rect: Rect) => void;
}

const COLORS = {
  grid: "rgba(255,255,255,0.55)",
  gridSoft: "rgba(255,255,255,0.3)",
  horizon: "#f5c542",
  rays: "rgba(245,197,66,0.45)",
  found: "#5ad1ff",
  angle: "#7cf0a0",
  prop: "#ff8c69",
  plumb: "#d9a4ff",
  ai: "#ff6ad5",
  drag: "#ffffff",
  frame: "#ffffff",
  crop: "#f5c542",
};

type PxRect = { x: number; y: number; w: number; h: number };

type HandleDrag =
  | { kind: "horizon" }
  | { kind: "vp"; index: number }
  | { kind: "vp3" }
  | { kind: "frame"; start: Pt; center0: Pt }
  | { kind: "crop"; mode: "move" | "nw" | "ne" | "sw" | "se"; start: Pt; rect0: Rect };

/** Largest frame of the chosen ratio that fits, scaled and positioned by the settings. */
export function frameRectPx(settings: SessionSettings, width: number, height: number): PxRect | null {
  const f = settings.frame;
  const ratio = FRAME_RATIOS.find((r) => r.id === f.ratio);
  if (!ratio) return null;
  const r = f.landscape ? Math.max(ratio.w, ratio.h) / Math.min(ratio.w, ratio.h) : Math.min(ratio.w, ratio.h) / Math.max(ratio.w, ratio.h);
  let w = Math.min(width, height * r) * f.scale;
  let h = w / r;
  if (h > height) {
    h = height;
    w = h * r;
  }
  const cx = clamp(f.center.x * width, w / 2, width - w / 2);
  const cy = clamp(f.center.y * height, h / 2, height - h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

export function Overlay({
  svgRef,
  width,
  height,
  settings,
  pendingSegment,
  tool,
  crop,
  annotations,
  askPoint,
  panMode,
  onPatch,
  onSegment,
  onPoint,
  onCropChange,
}: Props) {
  const [drag, setDrag] = useState<{ start: Pt; cur: Pt } | null>(null);
  const [handleDrag, setHandleDrag] = useState<HandleDrag | null>(null);

  // Cancel an in-progress drag when the tool changes (Escape, or picking another tool).
  const [prevTool, setPrevTool] = useState(tool);
  if (prevTool !== tool) {
    setPrevTool(tool);
    setDrag(null);
  }

  const flip = settings.flip;
  // Everything is stored in unflipped image space; mirror on the way in and out.
  const mx = (x: number) => (flip ? 1 - x : x);
  const mp = (p: Pt): Pt => ({ x: mx(p.x), y: p.y });
  const ms = (s: Segment): Segment => [mp(s[0]), mp(s[1])];
  const mr = (r: Rect): Rect => (flip ? { ...r, x: 1 - r.x - r.w } : r);

  const toPt = (e: ReactPointerEvent): Pt => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    return mp({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
  };

  const capture = (e: ReactPointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const interactive = tool !== "none" && !panMode;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !interactive || tool === "eyedropper" || tool === "plumb" || tool === "ask") return;
    const p = toPt(e);
    capture(e);
    setDrag({ start: p, cur: p });
    if (tool === "crop") onCropChange({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (handleDrag) {
      const p = toPt(e);
      switch (handleDrag.kind) {
        case "horizon":
          onPatch({ horizonY: clamp(p.y, 0, 1) });
          return;
        case "vp": {
          const xs = [...settings.vpXs[settings.vpMode]];
          xs[handleDrag.index] = clamp(p.x, -0.75, 1.75);
          onPatch({ vpXs: { ...settings.vpXs, [settings.vpMode]: xs } });
          return;
        }
        case "vp3":
          onPatch({ vp3: { x: clamp(p.x, -0.75, 1.75), y: clamp(p.y, -2, 3) } });
          return;
        case "frame":
          onPatch({
            frame: {
              ...settings.frame,
              center: {
                x: clamp(handleDrag.center0.x + (p.x - handleDrag.start.x), 0, 1),
                y: clamp(handleDrag.center0.y + (p.y - handleDrag.start.y), 0, 1),
              },
            },
          });
          return;
        case "crop":
          onCropChange(resizeCrop(handleDrag, p));
          return;
      }
    }
    if (drag) {
      const cur = toPt(e);
      setDrag({ start: drag.start, cur });
      if (tool === "crop") onCropChange(normRect(drag.start, cur));
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (handleDrag) {
      setHandleDrag(null);
      return;
    }
    if ((tool === "eyedropper" || tool === "plumb" || tool === "ask") && interactive && e.button === 0) {
      onPoint(toPt(e));
      return;
    }
    if (!drag) return;
    const seg: Segment = [drag.start, toPt(e)];
    setDrag(null);
    if (tool === "crop") {
      const r = normRect(seg[0], seg[1]);
      if (r.w * width < 8 || r.h * height < 8) onCropChange(defaultCrop());
      return;
    }
    if (length(segmentPx(seg, width, height)) < 6) return;
    onSegment(seg);
  };

  const startHandle = (e: ReactPointerEvent, h: HandleDrag) => {
    if (e.button !== 0 || panMode) return;
    e.stopPropagation();
    capture(e);
    setHandleDrag(h);
  };

  const horizonPx = settings.horizonY * height;
  const rayLength = 4 * Math.max(width, height);
  const rayAngles = Array.from({ length: 24 }, (_, i) => (i * 15 * Math.PI) / 180);
  const vpXs = settings.vpXs[settings.vpMode].map(mx);
  const vp3 = mp(settings.vp3);

  const frame = frameRectPx(settings, width, height);
  const area: PxRect = frame ?? { x: 0, y: 0, w: width, h: height };

  const marks = settings.marks;
  const firstProp = marks.find((m) => m.type === "prop");
  const unitLength = firstProp && firstProp.type === "prop" ? length(segmentPx(firstProp.p, width, height)) : 0;
  const cropPx = crop ? toPxRect(mr(crop), width, height) : null;

  const cursor = panMode
    ? "grab"
    : handleDrag
      ? handleDrag.kind === "horizon"
        ? "ns-resize"
        : handleDrag.kind === "vp"
          ? "ew-resize"
          : "move"
      : interactive
        ? "crosshair"
        : "default";

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute inset-0 select-none"
      style={{ overflow: "visible", touchAction: "none", cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setHandleDrag(null);
      }}
    >
      <defs>
        <clipPath id="image-clip">
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>

      <g clipPath="url(#image-clip)">
        {frame && (
          <path
            d={`M0 0H${width}V${height}H0Z M${frame.x} ${frame.y}V${frame.y + frame.h}H${frame.x + frame.w}V${frame.y}Z`}
            fill="rgba(0,0,0,0.5)"
            fillRule="evenodd"
          />
        )}

        {settings.grids.thirds && <GridLines area={area} fractions={[1 / 3, 2 / 3]} color={COLORS.grid} />}
        {settings.grids.golden && <GridLines area={area} fractions={[0.382, 0.618]} color={COLORS.grid} dashed />}
        {settings.grids.center && <GridLines area={area} fractions={[0.5]} color={COLORS.gridSoft} />}
        {settings.grids.diagonals && <Diagonals area={area} />}
        {settings.propGrid.on && <PropGrid area={area} cols={settings.propGrid.cols} />}

        {settings.showVps &&
          vpXs.map((vx, i) => <Rays key={i} x={vx * width} y={horizonPx} angles={rayAngles} len={rayLength} />)}
        {settings.showVps && settings.vpMode === "three" && (
          <Rays x={vp3.x * width} y={vp3.y * height} angles={rayAngles} len={rayLength} />
        )}

        {settings.eyeLevel && (
          <>
            <line x1={0} y1={horizonPx} x2={width} y2={horizonPx} stroke={COLORS.horizon} strokeWidth={1.5} />
            <Label x={8} y={horizonPx - 8} text="Eye level" color={COLORS.horizon} />
          </>
        )}

        {marks.map((m) => (
          <MarkView key={m.id} mark={mirrorMark(m, flip)} width={width} height={height} unitLength={unitLength} />
        ))}

        {annotations.map((a) => {
          const p = toPx(mp({ x: a.x, y: a.y }), width, height);
          if (a.w !== undefined && a.h !== undefined) {
            const r = toPxRect(mr({ x: a.x, y: a.y, w: a.w, h: a.h }), width, height);
            return (
              <g key={a.id}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,106,213,0.08)" stroke={COLORS.ai} strokeWidth={1.5} strokeDasharray="6 4" />
                <Label x={r.x + 6} y={r.y + 15} text={a.label} color={COLORS.ai} />
              </g>
            );
          }
          return (
            <g key={a.id}>
              <circle cx={p.x} cy={p.y} r={9} fill="none" stroke={COLORS.ai} strokeWidth={2} />
              <circle cx={p.x} cy={p.y} r={2.5} fill={COLORS.ai} />
              <Label x={p.x + 12} y={p.y - 10} text={a.label} color={COLORS.ai} />
            </g>
          );
        })}

        {askPoint && (
          <g>
            <circle cx={mx(askPoint.x) * width} cy={askPoint.y * height} r={10} fill="none" stroke={COLORS.ai} strokeWidth={2} />
            <circle cx={mx(askPoint.x) * width} cy={askPoint.y * height} r={3} fill={COLORS.ai} />
            <Label x={mx(askPoint.x) * width + 13} y={askPoint.y * height - 11} text="Asking about this" color={COLORS.ai} />
          </g>
        )}

        {pendingSegment && (
          <SegmentView s={segmentPx(ms(pendingSegment), width, height)} color={COLORS.found} label="edge 1" />
        )}

        {drag && tool !== "crop" && (
          <SegmentView
            s={segmentPx(ms([drag.start, drag.cur]), width, height)}
            color={COLORS.drag}
            dashed
            label={dragLabel(tool, segmentPx([drag.start, drag.cur], width, height), unitLength)}
          />
        )}

        {frame && (
          <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="none" stroke={COLORS.frame} strokeWidth={1.5} />
        )}

        {tool === "crop" && cropPx && (
          <>
            <path
              d={`M0 0H${width}V${height}H0Z M${cropPx.x} ${cropPx.y}V${cropPx.y + cropPx.h}H${cropPx.x + cropPx.w}V${cropPx.y}Z`}
              fill="rgba(0,0,0,0.55)"
              fillRule="evenodd"
            />
            <rect x={cropPx.x} y={cropPx.y} width={cropPx.w} height={cropPx.h} fill="none" stroke={COLORS.crop} strokeWidth={1.5} />
            <GridLines area={cropPx} fractions={[1 / 3, 2 / 3]} color="rgba(245,197,66,0.35)" />
          </>
        )}
      </g>

      {/* Hit areas and handles, above the clipped drawing. */}
      {frame && (
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.w}
          height={frame.h}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: "move" }}
          onPointerDown={(e) =>
            startHandle(e, { kind: "frame", start: toPt(e), center0: settings.frame.center })
          }
        />
      )}

      {settings.eyeLevel && (
        <line
          x1={0}
          y1={horizonPx}
          x2={width}
          y2={horizonPx}
          stroke="transparent"
          strokeWidth={18}
          style={{ cursor: "ns-resize" }}
          onPointerDown={(e) => startHandle(e, { kind: "horizon" })}
        />
      )}

      {settings.showVps &&
        vpXs.map((vx, i) => (
          <g key={i} style={{ cursor: "ew-resize" }} onPointerDown={(e) => startHandle(e, { kind: "vp", index: i })}>
            <circle cx={vx * width} cy={horizonPx} r={14} fill="transparent" />
            <circle cx={vx * width} cy={horizonPx} r={6} fill={COLORS.horizon} stroke="#111" strokeWidth={1.5} />
            <Label x={vx * width + 10} y={horizonPx + 18} text={vpXs.length > 1 ? `VP ${i + 1}` : "VP"} color={COLORS.horizon} />
          </g>
        ))}
      {settings.showVps && settings.vpMode === "three" && (
        <g style={{ cursor: "move" }} onPointerDown={(e) => startHandle(e, { kind: "vp3" })}>
          <circle cx={vp3.x * width} cy={vp3.y * height} r={14} fill="transparent" />
          <circle cx={vp3.x * width} cy={vp3.y * height} r={6} fill={COLORS.horizon} stroke="#111" strokeWidth={1.5} />
          <Label x={vp3.x * width + 10} y={vp3.y * height + 18} text="VP 3" color={COLORS.horizon} />
        </g>
      )}

      {tool === "crop" && cropPx && cropPx.w > 0 && (
        <g>
          <rect
            x={cropPx.x}
            y={cropPx.y}
            width={cropPx.w}
            height={cropPx.h}
            fill="transparent"
            style={{ cursor: "move" }}
            onPointerDown={(e) => startHandle(e, { kind: "crop", mode: "move", start: toPt(e), rect0: crop! })}
          />
          {(["nw", "ne", "sw", "se"] as const).map((corner) => {
            const cx = corner.includes("w") !== flip ? cropPx.x : cropPx.x + cropPx.w;
            const cy = corner.includes("n") ? cropPx.y : cropPx.y + cropPx.h;
            return (
              <circle
                key={corner}
                cx={cx}
                cy={cy}
                r={8}
                fill={COLORS.crop}
                stroke="#111"
                strokeWidth={1.5}
                style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }}
                onPointerDown={(e) => startHandle(e, { kind: "crop", mode: corner, start: toPt(e), rect0: crop! })}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

export function defaultCrop(): Rect {
  return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
}

function normRect(a: Pt, b: Pt): Rect {
  const x1 = clamp(Math.min(a.x, b.x), 0, 1);
  const y1 = clamp(Math.min(a.y, b.y), 0, 1);
  const x2 = clamp(Math.max(a.x, b.x), 0, 1);
  const y2 = clamp(Math.max(a.y, b.y), 0, 1);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function resizeCrop(h: Extract<HandleDrag, { kind: "crop" }>, p: Pt): Rect {
  const dx = p.x - h.start.x;
  const dy = p.y - h.start.y;
  const r = h.rect0;
  if (h.mode === "move") {
    return {
      ...r,
      x: clamp(r.x + dx, 0, 1 - r.w),
      y: clamp(r.y + dy, 0, 1 - r.h),
    };
  }
  let x1 = r.x;
  let y1 = r.y;
  let x2 = r.x + r.w;
  let y2 = r.y + r.h;
  if (h.mode.includes("w")) x1 = r.x + dx;
  else x2 = r.x + r.w + dx;
  if (h.mode.includes("n")) y1 = r.y + dy;
  else y2 = r.y + r.h + dy;
  return normRect({ x: x1, y: y1 }, { x: x2, y: y2 });
}

function toPxRect(r: Rect, width: number, height: number): PxRect {
  return { x: r.x * width, y: r.y * height, w: r.w * width, h: r.h * height };
}

function mirrorMark(m: Mark, flip: boolean): Mark {
  if (!flip) return m;
  const f = (p: Pt): Pt => ({ x: 1 - p.x, y: p.y });
  const fs = (s: Segment): Segment => [f(s[0]), f(s[1])];
  switch (m.type) {
    case "vp":
      return { ...m, a: fs(m.a), b: fs(m.b), vp: m.vp ? f(m.vp) : null };
    case "angle":
    case "prop":
      return { ...m, p: fs(m.p) };
    case "plumb":
      return { ...m, p: f(m.p) };
  }
}

function dragLabel(tool: Tool, s: Segment, unitLength: number): string | undefined {
  if (tool === "angle") return angleLabel(s);
  if (tool === "proportion") {
    const len = length(s);
    return unitLength > 0 ? `${(len / unitLength).toFixed(2)}×` : "1 (unit)";
  }
  if (tool === "level") return `${angleFromHorizontal(s).toFixed(1)}° from horizontal`;
  return undefined;
}

function angleLabel(s: Segment): string {
  const a = angleFromHorizontal(s);
  return `${a.toFixed(1)}°  ·  ~${clockPosition(a)}`;
}

function Rays({ x, y, angles, len }: { x: number; y: number; angles: number[]; len: number }) {
  return (
    <g stroke={COLORS.rays} strokeWidth={1}>
      {angles.map((a, k) => (
        <line key={k} x1={x} y1={y} x2={x + Math.cos(a) * len} y2={y + Math.sin(a) * len} />
      ))}
    </g>
  );
}

function GridLines({
  area,
  fractions,
  color,
  dashed,
}: {
  area: PxRect;
  fractions: number[];
  color: string;
  dashed?: boolean;
}) {
  return (
    <g stroke={color} strokeWidth={1} strokeDasharray={dashed ? "6 5" : undefined}>
      {fractions.map((f) => (
        <g key={f}>
          <line x1={area.x + f * area.w} y1={area.y} x2={area.x + f * area.w} y2={area.y + area.h} />
          <line x1={area.x} y1={area.y + f * area.h} x2={area.x + area.w} y2={area.y + f * area.h} />
        </g>
      ))}
    </g>
  );
}

/** The two main diagonals plus the four reciprocals (perpendiculars from each corner). */
function Diagonals({ area }: { area: PxRect }) {
  const { x: ox, y: oy, w: width, h: height } = area;
  const len2 = width * width + height * height;
  const foot = (cx: number, cy: number, dx: number, dy: number, sx: number, sy: number) => {
    const t = ((cx - sx) * dx + (cy - sy) * dy) / len2;
    return { x: sx + dx * t, y: sy + dy * t };
  };
  const f1 = foot(width, 0, width, height, 0, 0);
  const f2 = foot(0, height, width, height, 0, 0);
  const f3 = foot(0, 0, -width, height, width, 0);
  const f4 = foot(width, height, -width, height, width, 0);
  return (
    <g stroke={COLORS.grid} strokeWidth={1} transform={`translate(${ox} ${oy})`}>
      <line x1={0} y1={0} x2={width} y2={height} />
      <line x1={width} y1={0} x2={0} y2={height} />
      <g stroke={COLORS.gridSoft}>
        <line x1={width} y1={0} x2={f1.x} y2={f1.y} />
        <line x1={0} y1={height} x2={f2.x} y2={f2.y} />
        <line x1={0} y1={0} x2={f3.x} y2={f3.y} />
        <line x1={width} y1={height} x2={f4.x} y2={f4.y} />
      </g>
    </g>
  );
}

/** Numbered square cells for grid-method transfer: columns 1..n, rows A..n. */
function PropGrid({ area, cols }: { area: PxRect; cols: number }) {
  const cell = area.w / cols;
  const rows = Math.max(1, Math.round(area.h / cell));
  const rowH = area.h / rows;
  return (
    <g>
      <g stroke="rgba(120,220,255,0.6)" strokeWidth={1}>
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`c${i}`} x1={area.x + i * cell} y1={area.y} x2={area.x + i * cell} y2={area.y + area.h} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`r${i}`} x1={area.x} y1={area.y + i * rowH} x2={area.x + area.w} y2={area.y + i * rowH} />
        ))}
      </g>
      {Array.from({ length: cols }, (_, i) => (
        <Label key={`cl${i}`} x={area.x + i * cell + 4} y={area.y + 13} text={String(i + 1)} color="rgba(120,220,255,0.95)" />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Label
          key={`rl${i}`}
          x={area.x + 4}
          y={area.y + i * rowH + rowH / 2 + 4}
          text={String.fromCharCode(65 + (i % 26))}
          color="rgba(120,220,255,0.95)"
        />
      ))}
    </g>
  );
}

function Label({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontSize={12}
      fontWeight={600}
      stroke="rgba(0,0,0,0.85)"
      strokeWidth={3}
      paintOrder="stroke"
      style={{ pointerEvents: "none", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
    >
      {text}
    </text>
  );
}

function SegmentView({
  s,
  color,
  dashed,
  label,
  ticks,
}: {
  s: Segment;
  color: string;
  dashed?: boolean;
  label?: string;
  ticks?: boolean;
}) {
  const mx = (s[0].x + s[1].x) / 2;
  const my = (s[0].y + s[1].y) / 2;
  const dx = s[1].x - s[0].x;
  const dy = s[1].y - s[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 7;
  const ny = (dx / len) * 7;
  return (
    <g>
      <line
        x1={s[0].x}
        y1={s[0].y}
        x2={s[1].x}
        y2={s[1].y}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      {ticks ? (
        <g stroke={color} strokeWidth={2}>
          <line x1={s[0].x - nx} y1={s[0].y - ny} x2={s[0].x + nx} y2={s[0].y + ny} />
          <line x1={s[1].x - nx} y1={s[1].y - ny} x2={s[1].x + nx} y2={s[1].y + ny} />
        </g>
      ) : (
        <g fill={color}>
          <circle cx={s[0].x} cy={s[0].y} r={3} />
          <circle cx={s[1].x} cy={s[1].y} r={3} />
        </g>
      )}
      {label && <Label x={mx + 8} y={my - 8} text={label} color={color} />}
    </g>
  );
}

function MarkView({
  mark,
  width,
  height,
  unitLength,
}: {
  mark: Mark;
  width: number;
  height: number;
  unitLength: number;
}) {
  if (mark.type === "plumb") {
    const p = toPx(mark.p, width, height);
    return (
      <g stroke={COLORS.plumb} strokeWidth={1.2} strokeDasharray="6 4">
        <line x1={p.x} y1={0} x2={p.x} y2={height} />
        <line x1={0} y1={p.y} x2={width} y2={p.y} />
        <circle cx={p.x} cy={p.y} r={3.5} fill={COLORS.plumb} strokeDasharray="none" />
      </g>
    );
  }
  if (mark.type === "angle") {
    const s = segmentPx(mark.p, width, height);
    const lower = s[0].y > s[1].y ? s[0] : s[1];
    const dir = s[0].x <= s[1].x ? 1 : -1;
    return (
      <g>
        <line
          x1={lower.x}
          y1={lower.y}
          x2={lower.x + dir * 44}
          y2={lower.y}
          stroke={COLORS.angle}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
        <SegmentView s={s} color={COLORS.angle} label={angleLabel(s)} />
      </g>
    );
  }
  if (mark.type === "prop") {
    const s = segmentPx(mark.p, width, height);
    const len = length(s);
    const label = unitLength > 0 && Math.abs(len - unitLength) > 0.01 ? `${(len / unitLength).toFixed(2)}×` : "1 (unit)";
    return <SegmentView s={s} color={COLORS.prop} label={label} ticks />;
  }
  const a = segmentPx(mark.a, width, height);
  const b = segmentPx(mark.b, width, height);
  const vp = mark.vp ? toPx(mark.vp, width, height) : null;
  return (
    <g>
      {vp && (
        <g stroke={COLORS.found} strokeWidth={1} strokeDasharray="4 4" opacity={0.8}>
          <line x1={nearest(a, vp).x} y1={nearest(a, vp).y} x2={vp.x} y2={vp.y} />
          <line x1={nearest(b, vp).x} y1={nearest(b, vp).y} x2={vp.x} y2={vp.y} />
        </g>
      )}
      <SegmentView s={a} color={COLORS.found} />
      <SegmentView s={b} color={COLORS.found} label={vp ? undefined : "parallel: no vanishing point"} />
      {vp && (
        <g>
          <circle cx={vp.x} cy={vp.y} r={7} fill="none" stroke={COLORS.found} strokeWidth={2} />
          <line x1={vp.x - 12} y1={vp.y} x2={vp.x + 12} y2={vp.y} stroke={COLORS.found} strokeWidth={1.5} />
          <line x1={vp.x} y1={vp.y - 12} x2={vp.x} y2={vp.y + 12} stroke={COLORS.found} strokeWidth={1.5} />
          <Label x={vp.x + 12} y={vp.y - 10} text="Vanishing point" color={COLORS.found} />
        </g>
      )}
    </g>
  );
}

function nearest(s: Segment, p: Pt): Pt {
  const d0 = Math.hypot(s[0].x - p.x, s[0].y - p.y);
  const d1 = Math.hypot(s[1].x - p.x, s[1].y - p.y);
  return d0 < d1 ? s[0] : s[1];
}
