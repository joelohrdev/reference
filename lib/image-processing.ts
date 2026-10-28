import type { ViewMode } from "./types";

/** Longest edge of the working copy. Keeps pixel passes fast on phone photos. */
export const MAX_WORKING_EDGE = 1600;

export function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

export function toWorkingImageData(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ImageData {
  const scale = Math.min(1, MAX_WORKING_EDGE / Math.max(sourceWidth, sourceHeight));
  const w = Math.max(1, Math.round(sourceWidth * scale));
  const h = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function luma(src: ImageData): Uint8ClampedArray {
  const { data, width, height } = src;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    out[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return out;
}

function grayToImageData(gray: ArrayLike<number>, width: number, height: number): ImageData {
  const out = new ImageData(width, height);
  const d = out.data;
  for (let j = 0, i = 0; j < gray.length; j++, i += 4) {
    const v = gray[j];
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  return out;
}

/** Otsu's threshold: the split that best separates the light and dark masses. */
function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function posterize(gray: Uint8ClampedArray, levels: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const band = Math.min(levels - 1, Math.floor((gray[i] * levels) / 256));
    out[i] = Math.round((band * 255) / (levels - 1));
  }
  return out;
}

function boxBlur3(gray: Uint8ClampedArray, width: number, height: number): Float32Array {
  const tmp = new Float32Array(gray.length);
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const l = gray[row + Math.max(0, x - 1)];
      const c = gray[row + x];
      const r = gray[row + Math.min(width - 1, x + 1)];
      tmp[row + x] = (l + c + r) / 3;
    }
  }
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
      out[row + x] = (tmp[up + x] + tmp[row + x] + tmp[down + x]) / 3;
    }
  }
  return out;
}

/** Sobel edges drawn as dark lines on white, like a pencil line drawing. */
function lineDrawing(gray: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const g = boxBlur3(gray, width, height);
  const out = new Uint8ClampedArray(gray.length);
  out.fill(255);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = g[i - width - 1], t = g[i - width], tr = g[i - width + 1];
      const l = g[i - 1], r = g[i + 1];
      const bl = g[i + width - 1], b = g[i + width], br = g[i + width + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.hypot(gx, gy);
      const v = Math.max(0, mag - 24) * 1.6;
      out[i] = 255 - Math.min(255, v);
    }
  }
  return out;
}

const autoThresholds = new WeakMap<ImageData, number>();

/** The threshold notan uses when none is set by hand. */
export function autoNotanThreshold(src: ImageData): number {
  let t = autoThresholds.get(src);
  if (t === undefined) {
    t = otsuThreshold(luma(src));
    autoThresholds.set(src, t);
  }
  return t;
}

const LINEAR = new Float32Array(256).map((_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
});

/**
 * Warm/cool map: each pixel keeps its value but is tinted orange where its
 * hue is warm and blue where it is cool, in proportion to its chroma.
 * Near-neutral pixels stay gray.
 */
function temperatureMap(src: ImageData): ImageData {
  const { data, width, height } = src;
  const out = new ImageData(width, height);
  const o = out.data;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const WARM = [255, 150, 50];
  const COOL = [60, 130, 255];
  const axis = (62 * Math.PI) / 180; // orange, the warm pole in Lab hue
  for (let i = 0; i < data.length; i += 4) {
    const r = LINEAR[data[i]];
    const g = LINEAR[data[i + 1]];
    const b = LINEAR[data[i + 2]];
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    const A = 500 * (fx - fy);
    const B = 200 * (fy - fz);
    const chroma = Math.hypot(A, B);
    const warmth = chroma < 1 ? 0 : Math.cos(Math.atan2(B, A) - axis);
    const k = Math.min(1, chroma / 45) * Math.abs(warmth) * 0.8;
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const tint = warmth >= 0 ? WARM : COOL;
    // Keep the tint at the pixel's own value so the value structure survives.
    const tintLuma = 0.299 * tint[0] + 0.587 * tint[1] + 0.114 * tint[2];
    const scale = gray / tintLuma;
    o[i] = gray * (1 - k) + Math.min(255, tint[0] * scale) * k;
    o[i + 1] = gray * (1 - k) + Math.min(255, tint[1] * scale) * k;
    o[i + 2] = gray * (1 - k) + Math.min(255, tint[2] * scale) * k;
    o[i + 3] = 255;
  }
  return out;
}

/** Pure pixel transform for a view mode. Squint is a CSS blur on top, not a pass here. */
export function processImage(src: ImageData, mode: ViewMode, notanThreshold: number | null = null): ImageData {
  const { width, height } = src;
  switch (mode) {
    case "color":
      return src;
    case "grayscale":
      return grayToImageData(luma(src), width, height);
    case "temperature":
      return temperatureMap(src);
    case "notan": {
      const g = luma(src);
      const t = notanThreshold ?? autoNotanThreshold(src);
      const out = new Uint8ClampedArray(g.length);
      for (let i = 0; i < g.length; i++) out[i] = g[i] > t ? 255 : 0;
      return grayToImageData(out, width, height);
    }
    case "values3":
      return grayToImageData(posterize(luma(src), 3), width, height);
    case "values5":
      return grayToImageData(posterize(luma(src), 5), width, height);
    case "lines":
      return grayToImageData(lineDrawing(luma(src), width, height), width, height);
  }
}

const cache = new WeakMap<ImageData, Map<string, HTMLCanvasElement>>();

/** Memoized processed canvas per (image, mode, notan threshold). */
export function getProcessedCanvas(
  src: ImageData,
  mode: ViewMode,
  notanThreshold: number | null = null,
): HTMLCanvasElement {
  const key = mode === "notan" ? `notan:${notanThreshold ?? "auto"}` : mode;
  let perImage = cache.get(src);
  if (!perImage) {
    perImage = new Map();
    cache.set(src, perImage);
  }
  let canvas = perImage.get(key);
  if (!canvas) {
    canvas = imageDataToCanvas(processImage(src, mode, notanThreshold));
    perImage.set(key, canvas);
  }
  return canvas;
}
