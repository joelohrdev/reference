import { rgbToHex } from "./color";

/**
 * The main colours of an image by k-means on a pixel sample, sorted light to
 * dark. Tiny clusters are dropped so the result reads as a palette, not noise.
 */
export function dominantColors(src: ImageData, k = 8): string[] {
  const { data } = src;
  const pixels = data.length / 4;
  const step = Math.max(1, Math.floor(pixels / 16000));
  const sample: number[][] = [];
  for (let p = 0; p < pixels; p += step) {
    const i = p * 4;
    sample.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (sample.length === 0) return [];

  // Farthest-point seeding gives stable, spread-out starting centres.
  const centers: number[][] = [sample[Math.floor(sample.length / 2)]];
  while (centers.length < k) {
    let best = sample[0];
    let bestD = -1;
    for (const s of sample) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, dist2(s, c));
      if (d > bestD) {
        bestD = d;
        best = s;
      }
    }
    centers.push(best);
  }

  const counts = new Array<number>(k).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts.fill(0);
    for (const s of sample) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < centers.length; i++) {
        const d = dist2(s, centers[i]);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      sums[bi][0] += s[0];
      sums[bi][1] += s[1];
      sums[bi][2] += s[2];
      counts[bi]++;
    }
    for (let i = 0; i < centers.length; i++) {
      if (counts[i] > 0) centers[i] = sums[i].map((v) => v / counts[i]);
    }
  }

  const minShare = sample.length * 0.015;
  return centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n >= minShare)
    .sort((a, b) => luma(b.c) - luma(a.c))
    .map((x) => rgbToHex([x.c[0], x.c[1], x.c[2]]));
}

function dist2(a: number[], b: number[]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function luma(c: number[]): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}
