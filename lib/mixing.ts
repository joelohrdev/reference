/**
 * Paint mixing with the single-constant Kubelka–Munk model, applied per
 * sRGB channel in linear light. Each paint becomes an absorption/scattering
 * ratio K/S; mixing is linear in K/S weighted by amount; water dilutes K/S
 * toward white paper. It is a simplification (real pigments are spectral),
 * so results are a starting point, not a recipe.
 */
import { deltaE, hexToRgb, linearToSrgb, rgbToHex, rgbToLab, srgbToLinear, type Lab, type Rgb } from "./color";
import type { Paint } from "./paints";

type KS = [number, number, number];

export interface MixPart {
  paint: Paint;
  /** Fraction of the paint mixture, 0..1, parts sum to 1. */
  amount: number;
}

export interface MixResult {
  parts: MixPart[];
  /** 1 = full strength, lower = more water. */
  dilution: number;
  hex: string;
  deltaE: number;
}

const R_MIN = 0.004;
const R_MAX = 0.996;

function reflectanceToKS(r: number): number {
  const v = Math.min(R_MAX, Math.max(R_MIN, r));
  return ((1 - v) * (1 - v)) / (2 * v);
}

function ksToReflectance(ks: number): number {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}

function paintKS(p: Paint): KS {
  const rgb = hexToRgb(p.hex);
  return [
    reflectanceToKS(srgbToLinear(rgb[0])),
    reflectanceToKS(srgbToLinear(rgb[1])),
    reflectanceToKS(srgbToLinear(rgb[2])),
  ];
}

function mixRgb(kss: KS[], weights: number[], dilution: number): Rgb {
  const out: Rgb = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let ks = 0;
    for (let i = 0; i < kss.length; i++) ks += weights[i] * kss[i][c];
    out[c] = linearToSrgb(ksToReflectance(ks * dilution));
  }
  return out;
}

/** Colour of a given recipe, for previews. */
export function mixColor(parts: MixPart[], dilution: number): string {
  return rgbToHex(
    mixRgb(
      parts.map((p) => paintKS(p.paint)),
      parts.map((p) => p.amount),
      dilution,
    ),
  );
}

const DILUTIONS = [1, 0.8, 0.62, 0.47, 0.35, 0.25, 0.17, 0.11, 0.07, 0.04, 0.02];

function bestDilution(kss: KS[], weights: number[], target: Lab): { dilution: number; dE: number; rgb: Rgb } {
  let best = { dilution: 1, dE: Infinity, rgb: [0, 0, 0] as Rgb };
  for (const d of DILUTIONS) {
    const rgb = mixRgb(kss, weights, d);
    const dE = deltaE(rgbToLab(rgb), target);
    if (dE < best.dE) best = { dilution: d, dE, rgb };
  }
  // Refine around the coarse winner.
  for (const step of [0.5, 0.25, 0.12, 0.06]) {
    for (const d of [best.dilution * (1 - step), best.dilution * (1 + step)]) {
      if (d <= 0.005 || d > 1) continue;
      const rgb = mixRgb(kss, weights, d);
      const dE = deltaE(rgbToLab(rgb), target);
      if (dE < best.dE) best = { dilution: d, dE, rgb };
    }
  }
  return best;
}

interface Candidate {
  indices: number[];
  weights: number[];
  dilution: number;
  dE: number;
  rgb: Rgb;
}

function evaluate(kss: KS[], indices: number[], weights: number[], target: Lab): Candidate {
  const sub = indices.map((i) => kss[i]);
  const r = bestDilution(sub, weights, target);
  return { indices, weights, dilution: r.dilution, dE: r.dE, rgb: r.rgb };
}

/** Nudge the proportions of a candidate to squeeze out a better match. */
function refine(kss: KS[], c: Candidate, target: Lab): Candidate {
  if (c.indices.length === 1) return c;
  let best = c;
  for (let iter = 0; iter < 40; iter++) {
    const step = 0.12 * Math.pow(0.93, iter);
    let improved = false;
    for (let i = 0; i < best.weights.length; i++) {
      for (const dir of [1, -1]) {
        const w = best.weights.slice();
        w[i] = Math.max(0.02, w[i] + dir * step);
        const sum = w.reduce((a, b) => a + b, 0);
        const norm = w.map((v) => v / sum);
        const cand = evaluate(kss, best.indices, norm, target);
        if (cand.dE < best.dE - 1e-3) {
          best = cand;
          improved = true;
        }
      }
    }
    if (!improved && step < 0.01) break;
  }
  return best;
}

function toResult(paints: Paint[], c: Candidate): MixResult {
  const parts = c.indices
    .map((idx, i) => ({ paint: paints[idx], amount: c.weights[i] }))
    .sort((a, b) => b.amount - a.amount);
  return { parts, dilution: c.dilution, hex: rgbToHex(c.rgb), deltaE: c.dE };
}

/** Best recipes of one to three paints (plus water) that approach the target. */
export function bestMixes(target: Rgb, paints: Paint[], topN = 3): MixResult[] {
  if (paints.length === 0) return [];
  const lab = rgbToLab(target);
  const kss = paints.map(paintKS);
  const n = paints.length;
  const candidates: Candidate[] = [];

  for (let i = 0; i < n; i++) candidates.push(evaluate(kss, [i], [1], lab));

  const pairSteps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let best: Candidate | null = null;
      for (const a of pairSteps) {
        const c = evaluate(kss, [i, j], [a, 1 - a], lab);
        if (!best || c.dE < best.dE) best = c;
      }
      if (best) candidates.push(best);
    }
  }

  if (n >= 3 && n <= 24) {
    const tri = [0.2, 0.4, 0.6];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          let best: Candidate | null = null;
          for (const a of tri) {
            for (const b of tri) {
              if (a + b >= 0.95) continue;
              const c = evaluate(kss, [i, j, k], [a, b, 1 - a - b], lab);
              if (!best || c.dE < best.dE) best = c;
            }
          }
          if (best) candidates.push(best);
        }
      }
    }
  }

  // Prefer simpler recipes when they are about as good.
  const score = (c: Candidate) => c.dE + 1.5 * (c.indices.length - 1);
  candidates.sort((a, b) => score(a) - score(b));

  const results: MixResult[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (results.length >= topN) break;
    const key = c.indices.join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(toResult(paints, refine(kss, c, lab)));
  }
  return results.sort((a, b) => a.deltaE - b.deltaE);
}

/** Single paints, diluted as needed, ranked by closeness to the target. */
export function bestSinglePaints(target: Rgb, paints: Paint[], topN = 6): MixResult[] {
  const lab = rgbToLab(target);
  const kss = paints.map(paintKS);
  return paints
    .map((_, i) => toResult(paints, evaluate(kss, [i], [1], lab)))
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, topN);
}
