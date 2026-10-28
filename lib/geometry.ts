import type { Pt, Segment } from "./types";

/** Intersection of the infinite lines through two segments (pixel space). */
export function intersect(a: Segment, b: Segment): Pt | null {
  const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = a;
  const [{ x: x3, y: y3 }, { x: x4, y: y4 }] = b;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

export function toPx(p: Pt, width: number, height: number): Pt {
  return { x: p.x * width, y: p.y * height };
}

export function segmentPx(s: Segment, width: number, height: number): Segment {
  return [toPx(s[0], width, height), toPx(s[1], width, height)];
}

export function length(s: Segment): number {
  return Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y);
}

/** Angle of a pixel-space segment in degrees, measured from horizontal, y up, in (-90, 90]. */
export function angleFromHorizontal(s: Segment): number {
  const dx = s[1].x - s[0].x;
  const dy = -(s[1].y - s[0].y);
  return normalizeHalfTurn((Math.atan2(dy, dx) * 180) / Math.PI);
}

/** Wrap an angle in degrees into (-90, 90]. */
export function normalizeHalfTurn(deg: number): number {
  let a = deg;
  while (a > 90) a -= 180;
  while (a <= -90) a += 180;
  return a;
}

/**
 * Rotation (degrees, canvas clockwise-positive) that would make a pixel-space
 * segment vertical. Adding it to the current rotation levels the view.
 */
export function rotationToVertical(s: Segment): number {
  const dx = s[1].x - s[0].x;
  const dy = s[1].y - s[0].y;
  const theta = (Math.atan2(dy, dx) * 180) / Math.PI;
  return normalizeHalfTurn(90 - theta);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Clock-face reading of a line's angle from horizontal (degrees, y up, in
 * (-90, 90]), for the end that points upward: 12 is vertical, 3 is horizontal
 * to the right, 9 horizontal to the left. Rounded to the half hour.
 */
export function clockPosition(angleDeg: number): string {
  const hours = angleDeg >= 0 ? (90 - angleDeg) / 30 : 12 - (90 + angleDeg) / 30;
  let h = Math.round(hours * 2) / 2;
  if (h === 0) h = 12;
  const whole = Math.floor(h);
  const half = h - whole === 0.5;
  return `${whole}:${half ? "30" : "00"}`;
}
