"use client";

import { imageDataToCanvas } from "@/lib/image-processing";
import type { AiImage, AiRequest, AiResponse } from "./schemas";

/** Long edge of the copy sent to the model. Enough detail to see edges and values, cheap to send. */
const AI_MAX_EDGE = 1200;

export function imageForAi(data: ImageData): AiImage {
  const scale = Math.min(1, AI_MAX_EDGE / Math.max(data.width, data.height));
  const w = Math.max(1, Math.round(data.width * scale));
  const h = Math.max(1, Math.round(data.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imageDataToCanvas(data), 0, 0, w, h);
  const dataUrl = c.toDataURL("image/jpeg", 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), width: w, height: h };
}

export async function runAiTask(req: AiRequest): Promise<AiResponse> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You are offline. The assistant needs a connection.", code: "offline" };
  }
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const json = (await res.json()) as AiResponse;
    return json;
  } catch {
    return { ok: false, error: "Could not reach the assistant.", code: "offline" };
  }
}
