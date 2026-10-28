/**
 * Drawing the view (rotation, flip, cover-zoom) is shared by the display
 * canvas, cropping and export so they always agree.
 */
import { getProcessedCanvas, imageDataToCanvas } from "./image-processing";
import type { LoadedImage, Rect, ViewMode } from "./types";

export function drawView(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  rotation: number,
  flip: boolean,
): void {
  const r = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const cover = Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  if (flip) ctx.scale(-1, 1);
  ctx.rotate(r);
  ctx.scale(cover, cover);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function renderViewCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  rotation: number,
  flip: boolean,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, width, height);
  drawView(ctx, source, width, height, rotation, flip);
  return c;
}

/** Cut a region (normalized) out of the view as it is currently shown. */
export function cropImageData(image: LoadedImage, rect: Rect, rotation: number, flip: boolean): ImageData {
  const view = renderViewCanvas(imageDataToCanvas(image.data), image.width, image.height, rotation, flip);
  const x = Math.round(rect.x * image.width);
  const y = Math.round(rect.y * image.height);
  const w = Math.max(1, Math.round(rect.w * image.width));
  const h = Math.max(1, Math.round(rect.h * image.height));
  const ctx = view.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  return ctx.getImageData(x, y, w, h);
}

function svgToImage(svg: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `0 0 ${svg.width.baseVal.value} ${svg.height.baseVal.value}`);
  clone.style.overflow = "hidden";
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = "text{font-family:system-ui,-apple-system,Helvetica,Arial,sans-serif}";
  clone.insertBefore(style, clone.firstChild);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render the overlays."));
    };
    img.src = url;
  });
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}

export async function exportStudy(opts: {
  source: HTMLCanvasElement;
  width: number;
  height: number;
  rotation: number;
  flip: boolean;
  squintBlur: number;
  overlay: SVGSVGElement | null;
  filename: string;
}): Promise<void> {
  const out = document.createElement("canvas");
  out.width = opts.width;
  out.height = opts.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.fillStyle = "#0f0f0f";
  ctx.fillRect(0, 0, out.width, out.height);
  if (opts.squintBlur > 0 && "filter" in ctx) ctx.filter = `blur(${opts.squintBlur}px) contrast(1.2) saturate(0.85)`;
  drawView(ctx, opts.source, out.width, out.height, opts.rotation, opts.flip);
  ctx.filter = "none";
  if (opts.overlay) {
    const img = await svgToImage(opts.overlay, out.width, out.height);
    ctx.drawImage(img, 0, 0, out.width, out.height);
  }
  downloadCanvas(out, opts.filename);
}

const SHEET_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "color", label: "Color" },
  { mode: "grayscale", label: "Grayscale" },
  { mode: "notan", label: "Notan" },
  { mode: "values3", label: "3 values" },
  { mode: "values5", label: "5 values" },
  { mode: "lines", label: "Lines" },
];

/** A 3×2 contact sheet of the value views, for printing or the easel. */
export function exportValueSheet(image: LoadedImage, rotation: number, flip: boolean, notanThreshold: number | null, filename: string): void {
  const cell = 720;
  const gap = 24;
  const labelH = 36;
  const aspect = image.width / image.height;
  const cw = aspect >= 1 ? cell : Math.round(cell * aspect);
  const ch = aspect >= 1 ? Math.round(cell / aspect) : cell;
  const cols = 3;
  const rows = 2;
  const out = document.createElement("canvas");
  out.width = cols * cw + (cols + 1) * gap;
  out.height = rows * (ch + labelH) + (rows + 1) * gap;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.fillStyle = "#222";
  ctx.font = "600 20px system-ui, -apple-system, Helvetica, Arial, sans-serif";
  ctx.textBaseline = "middle";
  SHEET_MODES.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (cw + gap);
    const y = gap + row * (ch + labelH + gap);
    const src = getProcessedCanvas(image.data, m.mode, notanThreshold);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cw, ch);
    ctx.clip();
    ctx.translate(x, y);
    drawView(ctx, src, cw, ch, rotation, flip);
    ctx.restore();
    ctx.fillText(m.label, x, y + ch + labelH / 2);
  });
  downloadCanvas(out, filename);
}
