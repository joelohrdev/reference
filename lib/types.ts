export type ViewMode = "color" | "grayscale" | "notan" | "values3" | "values5" | "lines" | "temperature";

export const VIEW_MODES: { id: ViewMode; label: string; key: string }[] = [
  { id: "color", label: "Color", key: "1" },
  { id: "grayscale", label: "Grayscale", key: "2" },
  { id: "notan", label: "Notan (2 values)", key: "3" },
  { id: "values3", label: "3 values", key: "4" },
  { id: "values5", label: "5 values", key: "5" },
  { id: "lines", label: "Lines", key: "6" },
  { id: "temperature", label: "Warm / cool", key: "8" },
];

export type Tool = "none" | "level" | "findVp" | "angle" | "proportion" | "plumb" | "eyedropper" | "crop" | "ask";

/** A labelled spot or region the assistant points at, in normalized coordinates. */
export interface Annotation {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** A tidied session note, kept with the image. */
export interface AiNote {
  title: string;
  note: string;
  nextTime: string[];
  at: number;
}

export type PerspectiveMode = "one" | "two" | "three";

/** A point in normalized image coordinates (0..1 across the displayed image). */
export interface Pt {
  x: number;
  y: number;
}

export type Segment = [Pt, Pt];

/** A rectangle in normalized image coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Mark =
  | { id: string; type: "vp"; a: Segment; b: Segment; vp: Pt | null }
  | { id: string; type: "angle"; p: Segment }
  | { id: string; type: "prop"; p: Segment }
  | { id: string; type: "plumb"; p: Pt };

export interface GridSettings {
  thirds: boolean;
  golden: boolean;
  diagonals: boolean;
  center: boolean;
}

export const FRAME_RATIOS: { id: string; label: string; w: number; h: number }[] = [
  { id: "1:1", label: "Square", w: 1, h: 1 },
  { id: "4:5", label: "4 × 5  (8×10, 16×20)", w: 4, h: 5 },
  { id: "3:4", label: "3 × 4  (9×12, 12×16, 18×24)", w: 3, h: 4 },
  { id: "5:7", label: "5 × 7  (10×14)", w: 5, h: 7 },
  { id: "11:14", label: "11 × 14", w: 11, h: 14 },
  { id: "2:3", label: "2 × 3  (8×12, 24×36)", w: 2, h: 3 },
  { id: "1:2", label: "1 × 2  (12×24)", w: 1, h: 2 },
];

export interface FrameSettings {
  /** One of FRAME_RATIOS ids, or null for no frame. */
  ratio: string | null;
  landscape: boolean;
  /** Fraction of the largest frame that fits, 0.3..1. */
  scale: number;
  center: Pt;
}

export interface PropGridSettings {
  on: boolean;
  cols: number;
}

export interface ValueScaleSettings {
  on: boolean;
  steps: 5 | 9;
}

/** Everything about a study that is worth keeping between visits. */
export interface SessionSettings {
  grids: GridSettings;
  propGrid: PropGridSettings;
  frame: FrameSettings;
  eyeLevel: boolean;
  horizonY: number;
  showVps: boolean;
  vpMode: PerspectiveMode;
  vpXs: Record<PerspectiveMode, number[]>;
  vp3: Pt;
  rotation: number;
  flip: boolean;
  mode: ViewMode;
  squint: boolean;
  squintStrength: number;
  notanThreshold: number | null;
  valueScale: ValueScaleSettings;
  marks: Mark[];
}

export const DEFAULT_SETTINGS: SessionSettings = {
  grids: { thirds: false, golden: false, diagonals: false, center: false },
  propGrid: { on: false, cols: 6 },
  frame: { ratio: null, landscape: true, scale: 0.9, center: { x: 0.5, y: 0.5 } },
  eyeLevel: true,
  horizonY: 0.5,
  showVps: false,
  vpMode: "one",
  vpXs: { one: [0.5], two: [0.08, 0.92], three: [0.08, 0.92] },
  vp3: { x: 0.5, y: 1.6 },
  rotation: 0,
  flip: false,
  mode: "color",
  squint: false,
  squintStrength: 4,
  notanThreshold: null,
  valueScale: { on: false, steps: 5 },
  marks: [],
};

export interface LoadedImage {
  id: string;
  name: string;
  width: number;
  height: number;
  data: ImageData;
  cropped: boolean;
}
