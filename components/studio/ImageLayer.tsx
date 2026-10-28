"use client";

import { useEffect, type RefObject } from "react";
import { drawView } from "@/lib/render";

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  source: HTMLCanvasElement | null;
  width: number;
  height: number;
  /** Degrees, clockwise positive. The image is zoomed just enough to hide the corners. */
  rotation: number;
  flip: boolean;
  squint: boolean;
  /** 1 (barely softened) to 10 (eyes nearly shut). */
  squintStrength: number;
}

export function ImageLayer({ canvasRef, source, width, height, rotation, flip, squint, squintStrength }: Props) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || width === 0 || height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, width, height);
    drawView(ctx, source, width, height, rotation, flip);
  }, [canvasRef, source, width, height, rotation, flip]);

  const blur = Math.max(1, width * 0.003 * squintStrength);
  const contrast = 1 + 0.05 * squintStrength;

  return (
    <canvas
      ref={canvasRef}
      className="block"
      style={{
        width,
        height,
        filter: squint ? `blur(${blur}px) contrast(${contrast}) saturate(0.85)` : undefined,
      }}
    />
  );
}
