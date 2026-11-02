"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ImageLayer } from "./ImageLayer";
import { Overlay, defaultCrop } from "./Overlay";
import { Sidebar } from "./Sidebar";
import { ColorMixer } from "./ColorMixer";
import { Library } from "./Library";
import { Assistant } from "./Assistant";
import type { AiResult } from "@/lib/ai/schemas";
import { ValueScale } from "./ValueScale";
import { rgbToHex, type Rgb } from "@/lib/color";
import { useStoredValue } from "@/lib/local-store";
import {
  autoNotanThreshold,
  getProcessedCanvas,
  imageDataToCanvas,
  loadImageFromBlob,
  toWorkingImageData,
} from "@/lib/image-processing";
import { clamp, intersect, normalizeHalfTurn, rotationToVertical, segmentPx } from "@/lib/geometry";
import { drawSampleScene } from "@/lib/sample-scene";
import { dominantColors } from "@/lib/palette";
import { PAINTS } from "@/lib/paints";
import { cropImageData, exportStudy, exportValueSheet } from "@/lib/render";
import {
  canvasToBlob,
  deleteImage,
  getImage,
  listImages,
  makeThumb,
  putImage,
  updateImage,
  type LibraryItem,
} from "@/lib/library";
import {
  DEFAULT_SETTINGS,
  FRAME_RATIOS,
  VIEW_MODES,
  type AiNote,
  type Annotation,
  type LoadedImage,
  type Mark,
  type Pt,
  type Rect,
  type Segment,
  type SessionSettings,
  type Tool,
} from "@/lib/types";

const ZOOM_MAX = 8;
const VALUE_SCALE_SPACE = 46;

interface View {
  zoom: number;
  pan: Pt;
}
const FIT_VIEW: View = { zoom: 1, pan: { x: 0, y: 0 } };

export default function Studio() {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [settings, setSettings] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const patch = useCallback((p: Partial<SessionSettings>) => setSettings((s) => ({ ...s, ...p })), []);
  const [tool, setTool] = useState<Tool>("none");
  const [pending, setPending] = useState<Segment | null>(null);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [spaceDown, setSpaceDown] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [askPoint, setAskPoint] = useState<Pt | null>(null);
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [pickedColor, setPickedColor] = useState<string | null>(null);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [paintIdsJson, setPaintIdsJson] = useStoredValue("reference-studio:paints", "[]");
  const paintIds = useMemo(() => parseIds(paintIdsJson), [paintIdsJson]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlaySvgRef = useRef<SVGSVGElement>(null);
  const panDrag = useRef<{ x: number; y: number; pan: Pt; id: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => {
    if (!image || stage.w === 0 || stage.h === 0) return { width: 0, height: 0 };
    const availW = stage.w - (settings.valueScale.on ? VALUE_SCALE_SPACE : 0);
    const aspect = image.width / image.height;
    let w = availW;
    let h = w / aspect;
    if (h > stage.h) {
      h = stage.h;
      w = h * aspect;
    }
    return { width: Math.max(0, Math.floor(w)), height: Math.max(0, Math.floor(h)) };
  }, [image, stage, settings.valueScale.on]);

  const sourceCanvas = useMemo(
    () => (image ? getProcessedCanvas(image.data, settings.mode, settings.notanThreshold) : null),
    [image, settings.mode, settings.notanThreshold],
  );
  const autoNotan = useMemo(() => (image ? autoNotanThreshold(image.data) : null), [image]);
  const palette = useMemo(() => (image ? dominantColors(image.data) : []), [image]);

  // ---- Library ----------------------------------------------------------

  const refreshLibrary = useCallback(() => {
    listImages()
      .then(setLibrary)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (!image) return;
    const t = window.setTimeout(() => {
      updateImage(image.id, { settings }).catch(() => {});
    }, 600);
    return () => window.clearTimeout(t);
  }, [image, settings]);

  useEffect(() => {
    if (!compareId) return;
    let url: string | null = null;
    let cancelled = false;
    getImage(compareId)
      .then((rec) => {
        if (!rec || cancelled) return;
        url = URL.createObjectURL(rec.blob);
        setCompareUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [compareId]);

  const showImage = useCallback((next: LoadedImage, nextSettings: SessionSettings, nextNotice: string | null = null, nextNotes: AiNote[] = []) => {
    setImage(next);
    setSettings(nextSettings);
    setNotes(nextNotes);
    setAnnotations([]);
    setAskPoint(null);
    setLoadError(null);
    setPending(null);
    setCrop(null);
    setTool("none");
    setView(FIT_VIEW);
    setNotice(nextNotice);
  }, []);

  const addImage = useCallback(
    async (name: string, data: ImageData, nextNotice: string | null = null) => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
      showImage({ id, name, width: data.width, height: data.height, data, cropped: false }, DEFAULT_SETTINGS, nextNotice);
      try {
        const canvas = imageDataToCanvas(data);
        const blob = await canvasToBlob(canvas);
        await putImage({
          id,
          name,
          width: data.width,
          height: data.height,
          blob,
          original: blob,
          cropped: false,
          thumb: makeThumb(canvas),
          addedAt: Date.now(),
          openedAt: Date.now(),
          settings: DEFAULT_SETTINGS,
        });
        refreshLibrary();
      } catch {
        // No IndexedDB: the image still works for this visit, it just will not be remembered.
      }
    },
    [showImage, refreshLibrary],
  );

  const loadFile = useCallback(
    async (file: Blob, name: string) => {
      try {
        const img = await loadImageFromBlob(file);
        const data = toWorkingImageData(img, img.naturalWidth, img.naturalHeight);
        await addImage(name, data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load that image.");
      }
    },
    [addImage],
  );

  /**
   * Explicit clipboard read for iPad and other touch devices, where a paste
   * keystroke never reaches the page. Needs a tap, which is why it is a button.
   */
  const pasteFromClipboard = useCallback(async () => {
    if (!("clipboard" in navigator) || typeof navigator.clipboard.read !== "function") {
      setLoadError("This browser cannot read images from the clipboard. Drop the image here instead.");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          await loadFile(await item.getType(type), "Pasted image");
          return;
        }
      }
      setLoadError("There is no image on the clipboard. Copy a screenshot first, then try again.");
    } catch {
      setLoadError("Clipboard access was not allowed. Allow Paste when the browser asks, or drop the image here.");
    }
  }, [loadFile]);

  const loadSample = useCallback(() => {
    const canvas = drawSampleScene();
    const data = toWorkingImageData(canvas, canvas.width, canvas.height);
    void addImage("Sample street scene", data, "This sample is tilted on purpose. Press L and drag along the lamp post to level it.");
  }, [addImage]);

  const openFromLibrary = useCallback(
    async (id: string) => {
      if (image?.id === id) return;
      try {
        const rec = await getImage(id);
        if (!rec) return;
        const img = await loadImageFromBlob(rec.blob);
        const data = toWorkingImageData(img, img.naturalWidth, img.naturalHeight);
        showImage(
          { id, name: rec.name, width: data.width, height: data.height, data, cropped: rec.cropped },
          { ...DEFAULT_SETTINGS, ...(rec.settings ?? {}) },
          null,
          rec.notes ?? [],
        );
        if (compareId === id) setCompareId(null);
        await updateImage(id, { openedAt: Date.now() });
        refreshLibrary();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not open that image.");
      }
    },
    [image, compareId, showImage, refreshLibrary],
  );

  const removeFromLibrary = (id: string) => {
    if (compareId === id) {
      setCompareId(null);
      setCompareUrl(null);
    }
    deleteImage(id)
      .then(refreshLibrary)
      .catch(() => {});
  };

  const closeImage = () => {
    setImage(null);
    setCompareId(null);
    setCompareUrl(null);
    setTool("none");
  };

  // ---- Zoom and pan -------------------------------------------------------

  const clampPan = useCallback(
    (pan: Pt, zoom: number): Pt => {
      const lx = ((zoom - 1) * fit.width) / 2;
      const ly = ((zoom - 1) * fit.height) / 2;
      return { x: clamp(pan.x, -lx, lx), y: clamp(pan.y, -ly, ly) };
    },
    [fit],
  );

  /** Zoom by a factor, keeping the point `at` (px from the frame centre) fixed. */
  const zoomAt = useCallback(
    (factor: number, at: Pt | null) => {
      setView((v) => {
        const zoom = clamp(v.zoom * factor, 1, ZOOM_MAX);
        if (zoom === 1) return FIT_VIEW;
        const c = at ?? { x: 0, y: 0 };
        const q = { x: (c.x - v.pan.x) / v.zoom, y: (c.y - v.pan.y) / v.zoom };
        return { zoom, pan: clampPan({ x: c.x - q.x * zoom, y: c.y - q.y * zoom }, zoom) };
      });
    },
    [clampPan],
  );
  const zoomAtRef = useRef(zoomAt);
  useEffect(() => {
    zoomAtRef.current = zoomAt;
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const frame = frameRef.current;
      if (!frame) return;
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      const at = { x: e.clientX - (rect.left + rect.width / 2), y: e.clientY - (rect.top + rect.height / 2) };
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      zoomAtRef.current(factor, at);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const canPan = spaceDown || (tool === "none" && view.zoom > 1);

  const onFramePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canPan || view.zoom === 1) return;
    panDrag.current = { x: e.clientX, y: e.clientY, pan: view.pan, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onFramePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panDrag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((v) => ({ zoom: v.zoom, pan: clampPan({ x: d.pan.x + (e.clientX - d.x), y: d.pan.y + (e.clientY - d.y) }, v.zoom) }));
  };
  const onFramePointerUp = () => {
    panDrag.current = null;
  };

  // ---- Input: paste, keys -------------------------------------------------

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void loadFile(file, "Pasted image");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) setSpaceDown(true);
        return;
      }
      switch (e.key) {
        case "Escape":
          setTool("none");
          setPending(null);
          return;
        case "l":
        case "L":
          setTool((t) => (t === "level" ? "none" : "level"));
          return;
        case "c":
        case "C":
          setMixerOpen((open) => !open);
          setAssistantOpen(false);
          return;
        case "a":
        case "A":
          setAssistantOpen((open) => !open);
          setMixerOpen(false);
          return;
        case "f":
        case "F":
          setSettings((s) => ({ ...s, flip: !s.flip }));
          return;
        case "7":
          setSettings((s) => ({ ...s, squint: !s.squint }));
          return;
        case "+":
        case "=":
          zoomAtRef.current(1.25, null);
          return;
        case "-":
          zoomAtRef.current(0.8, null);
          return;
        case "0":
          setView(FIT_VIEW);
          return;
      }
      const viewMode = VIEW_MODES.find((m) => m.key === e.key);
      if (viewMode) setSettings((s) => ({ ...s, mode: viewMode.id }));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceDown(false);
    };
    const onBlur = () => setSpaceDown(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // ---- Tools --------------------------------------------------------------

  const selectTool = (next: Tool) => {
    setTool(next);
    setPending(null);
    setNotice(null);
    if (next === "crop") {
      setCrop(defaultCrop());
      setView(FIT_VIEW);
    }
  };

  const handleSegment = (seg: Segment) => {
    const { width, height } = fit;
    switch (tool) {
      case "level": {
        const delta = rotationToVertical(segmentPx(seg, width, height));
        setSettings((s) => ({ ...s, rotation: Number(normalizeHalfTurn(s.rotation + delta).toFixed(1)) }));
        setTool("none");
        return;
      }
      case "angle":
        addMark({ id: newId(), type: "angle", p: seg });
        return;
      case "proportion":
        addMark({ id: newId(), type: "prop", p: seg });
        return;
      case "findVp": {
        if (!pending) {
          setPending(seg);
          return;
        }
        const hit = intersect(segmentPx(pending, width, height), segmentPx(seg, width, height));
        const vp = hit ? { x: hit.x / width, y: hit.y / height } : null;
        addMark({ id: newId(), type: "vp", a: pending, b: seg, vp });
        setPending(null);
        return;
      }
      default:
        return;
    }
  };

  const addMark = (m: Mark) => setSettings((s) => ({ ...s, marks: [...s.marks, m] }));

  const chooseColor = (hex: string) => {
    setPickedColor(hex);
    setRecentColors((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 8));
  };

  /** Average a small patch of the display canvas (so rotation and view mode are included). */
  const sampleColor = (pt: Pt) => {
    const canvas = displayCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const x0 = settings.flip ? 1 - pt.x : pt.x;
    const dpr = canvas.width / Math.max(1, fit.width);
    const size = Math.max(1, Math.round(2 * dpr));
    const x = clamp(Math.round(x0 * canvas.width) - size, 0, canvas.width - 1);
    const y = clamp(Math.round(pt.y * canvas.height) - size, 0, canvas.height - 1);
    const w = Math.min(size * 2 + 1, canvas.width - x);
    const h = Math.min(size * 2 + 1, canvas.height - y);
    const { data } = ctx.getImageData(x, y, w, h);
    const sum: Rgb = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
    }
    const n = data.length / 4;
    chooseColor(rgbToHex([sum[0] / n, sum[1] / n, sum[2] / n]));
    setTool("none");
    setMixerOpen(true);
  };

  const handlePoint = (pt: Pt) => {
    if (tool === "eyedropper") sampleColor(pt);
    else if (tool === "plumb") addMark({ id: newId(), type: "plumb", p: pt });
    else if (tool === "ask") {
      setAskPoint(pt);
      setTool("none");
      setAssistantOpen(true);
      setMixerOpen(false);
    }
  };

  // ---- Assistant ----------------------------------------------------------

  const saveNotes = (next: AiNote[]) => {
    setNotes(next);
    if (image) updateImage(image.id, { notes: next }).catch(() => {});
  };

  const applyPerspective = (r: AiResult<"perspective">, size: { width: number; height: number }) => {
    const vps = r.vanishingPoints.map((v) => ({ x: v.x / size.width, y: v.y / size.height }));
    setSettings((s) => {
      const next: SessionSettings = { ...s, eyeLevel: true, horizonY: clamp(r.horizonY / size.height, 0, 1) };
      if (r.type === "none" || vps.length === 0) return { ...next, showVps: false };
      const xs = vps.map((v) => clamp(v.x, -0.75, 1.75));
      if (r.type === "one" || xs.length === 1) {
        return { ...next, showVps: true, vpMode: "one", vpXs: { ...s.vpXs, one: [xs[0]] } };
      }
      const pair: number[] = [xs[0], xs[1]];
      if (r.type === "three" && vps.length >= 3) {
        return { ...next, showVps: true, vpMode: "three", vpXs: { ...s.vpXs, three: pair }, vp3: { x: clamp(vps[2].x, -0.75, 1.75), y: clamp(vps[2].y, -2, 3) } };
      }
      return { ...next, showVps: true, vpMode: "two", vpXs: { ...s.vpXs, two: pair } };
    });
  };

  const applyComposition = (opt: AiResult<"composition">["options"][number], size: { width: number; height: number }) => {
    if (!image) return;
    const ratio = FRAME_RATIOS.find((r) => r.id === opt.ratio) ?? FRAME_RATIOS[2];
    const r = opt.landscape ? Math.max(ratio.w, ratio.h) / Math.min(ratio.w, ratio.h) : Math.min(ratio.w, ratio.h) / Math.max(ratio.w, ratio.h);
    const maxFrac = Math.min(1, (image.height / image.width) * r);
    const scale = clamp(opt.rect.w / size.width / maxFrac, 0.3, 1);
    setSettings((s) => ({
      ...s,
      frame: {
        ratio: ratio.id,
        landscape: opt.landscape,
        scale,
        center: { x: clamp((opt.rect.x + opt.rect.w / 2) / size.width, 0, 1), y: clamp((opt.rect.y + opt.rect.h / 2) / size.height, 0, 1) },
      },
    }));
  };

  const lastFoundVp = useMemo(() => {
    for (let i = settings.marks.length - 1; i >= 0; i--) {
      const m = settings.marks[i];
      if (m.type === "vp" && m.vp) return m.vp;
    }
    return null;
  }, [settings.marks]);

  const snapEyeLevel = () => {
    if (!lastFoundVp) return;
    const target = lastFoundVp;
    setSettings((s) => {
      const xs = [...s.vpXs[s.vpMode]];
      let nearest = 0;
      for (let i = 1; i < xs.length; i++) {
        if (Math.abs(xs[i] - target.x) < Math.abs(xs[nearest] - target.x)) nearest = i;
      }
      xs[nearest] = target.x;
      return { ...s, eyeLevel: true, horizonY: clamp(target.y, 0, 1), vpXs: { ...s.vpXs, [s.vpMode]: xs } };
    });
  };

  // ---- Crop ---------------------------------------------------------------

  const applyCrop = async () => {
    if (!image || !crop || crop.w < 0.02 || crop.h < 0.02) return;
    const data = cropImageData(image, crop, settings.rotation, settings.flip);
    const next: LoadedImage = { ...image, width: data.width, height: data.height, data, cropped: true };
    setImage(next);
    setCrop(null);
    setTool("none");
    setView(FIT_VIEW);
    setSettings((s) => ({ ...s, rotation: 0, flip: false, marks: [], frame: { ...s.frame, center: { x: 0.5, y: 0.5 } } }));
    try {
      const canvas = imageDataToCanvas(data);
      await updateImage(image.id, {
        blob: await canvasToBlob(canvas),
        width: data.width,
        height: data.height,
        cropped: true,
        thumb: makeThumb(canvas),
      });
      refreshLibrary();
    } catch {
      // Not persisted; the crop still applies for this visit.
    }
  };

  const revertCrop = async () => {
    if (!image) return;
    try {
      const rec = await getImage(image.id);
      if (!rec) throw new Error("The original is no longer in the library.");
      const img = await loadImageFromBlob(rec.original);
      const data = toWorkingImageData(img, img.naturalWidth, img.naturalHeight);
      setImage({ ...image, width: data.width, height: data.height, data, cropped: false });
      setSettings((s) => ({ ...s, marks: [] }));
      setView(FIT_VIEW);
      const canvas = imageDataToCanvas(data);
      await updateImage(image.id, { blob: rec.original, width: data.width, height: data.height, cropped: false, thumb: makeThumb(canvas) });
      refreshLibrary();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not undo the crop.");
    }
  };

  // ---- Export -------------------------------------------------------------

  const baseName = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w-]+/g, "-") || "reference";

  const exportView = () => {
    if (!image || !sourceCanvas) return;
    exportStudy({
      source: sourceCanvas,
      width: image.width,
      height: image.height,
      rotation: settings.rotation,
      flip: settings.flip,
      squintBlur: settings.squint ? image.width * 0.003 * settings.squintStrength : 0,
      overlay: overlaySvgRef.current,
      filename: `${baseName(image.name)}-study.png`,
    }).catch((err) => setLoadError(err instanceof Error ? err.message : "Export failed."));
  };

  const exportSheet = () => {
    if (!image) return;
    try {
      exportValueSheet(image, settings.rotation, settings.flip, settings.notanThreshold, `${baseName(image.name)}-values.png`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Export failed.");
    }
  };

  // ---- Drop ---------------------------------------------------------------

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) void loadFile(file, file.name);
    else setLoadError("Drop an image file (JPEG, PNG, WebP, HEIC where the browser supports it).");
  };

  const hint = spaceDown
    ? view.zoom > 1
      ? "Drag to pan."
      : "Scroll to zoom in first, then drag to pan."
    : (hintFor(tool, pending, settings.marks) ?? (settings.rotation === 0 ? notice : null));

  const compareItem = compareId ? library.find((it) => it.id === compareId) : null;

  return (
    <div className="flex h-dvh w-full flex-col bg-[#0f0f0f] text-white">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 md:px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Reference Studio</h1>
          {image && (
            <span className="truncate text-[13px] text-neutral-400">
              {image.name} · {image.width}×{image.height}
              {image.cropped ? " · cropped" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[13px]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-amber-400 px-3.5 py-1.5 font-medium text-black hover:bg-amber-300"
          >
            {image ? "Add image" : "Upload image"}
          </button>
          <button
            type="button"
            onClick={() => void pasteFromClipboard()}
            title="Paste an image from the clipboard"
            className="rounded-full border border-white/15 px-3.5 py-1.5 text-neutral-200 hover:bg-white/10"
          >
            Paste
          </button>
          {image && (
            <button
              type="button"
              onClick={closeImage}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-neutral-200 hover:bg-white/10"
            >
              Close
            </button>
          )}
          {library.length > 0 && (
            <button
              type="button"
              onClick={() => setLibraryOpen((o) => !o)}
              aria-pressed={libraryOpen}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-neutral-200 hover:bg-white/10"
            >
              {libraryOpen ? "Hide library" : `Library (${library.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? "Hide the panel" : "Show the panel"}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-neutral-200 hover:bg-white/10"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <line x1="10" y1="2.5" x2="10" y2="13.5" stroke="currentColor" strokeWidth="1.4" />
              {sidebarOpen && <rect x="10" y="2.5" width="4.5" height="11" rx="1.5" fill="currentColor" />}
            </svg>
            {sidebarOpen ? "Hide panel" : "Show panel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file, file.name);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main
          className="relative flex min-h-0 min-w-0 flex-1 flex-col"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="relative flex min-h-0 flex-1">
            <div
              ref={stageRef}
              className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center gap-3 overflow-hidden p-4"
            >
              {image ? (
                <>
                  {settings.valueScale.on && fit.height > 0 && (
                    <ValueScale steps={settings.valueScale.steps} height={fit.height} color={pickedColor} />
                  )}
                  <div
                    ref={frameRef}
                    className="relative"
                    style={{ width: fit.width, height: fit.height, cursor: canPan && view.zoom > 1 ? "grab" : undefined }}
                    onPointerDown={onFramePointerDown}
                    onPointerMove={onFramePointerMove}
                    onPointerUp={onFramePointerUp}
                    onPointerCancel={onFramePointerUp}
                  >
                    <div
                      className="relative"
                      style={{
                        width: fit.width,
                        height: fit.height,
                        transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
                        transformOrigin: "center",
                      }}
                    >
                      <ImageLayer
                        canvasRef={displayCanvasRef}
                        source={sourceCanvas}
                        width={fit.width}
                        height={fit.height}
                        rotation={settings.rotation}
                        flip={settings.flip}
                        squint={settings.squint}
                        squintStrength={settings.squintStrength}
                      />
                      <Overlay
                        svgRef={overlaySvgRef}
                        width={fit.width}
                        height={fit.height}
                        settings={settings}
                        pendingSegment={pending}
                        tool={tool}
                        crop={crop}
                        annotations={annotations}
                        askPoint={askPoint}
                        panMode={canPan && view.zoom > 1}
                        onPatch={patch}
                        onSegment={handleSegment}
                        onPoint={handlePoint}
                        onCropChange={setCrop}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  dragOver={dragOver}
                  error={loadError}
                  recent={library}
                  onChoose={() => fileInputRef.current?.click()}
                  onPaste={() => void pasteFromClipboard()}
                  onSample={loadSample}
                  onOpen={(id) => void openFromLibrary(id)}
                />
              )}
            </div>

            {compareUrl && (
              <div className="relative flex min-w-0 flex-1 items-center justify-center border-l border-white/10 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={compareUrl} alt={compareItem?.name ?? "Comparison image"} className="max-h-full max-w-full object-contain" />
                <div className="absolute left-4 top-4 flex items-center gap-2 text-[12px]">
                  <span className="rounded-full bg-black/70 px-3 py-1 text-neutral-200">{compareItem?.name ?? "Comparing"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareId(null);
                      setCompareUrl(null);
                    }}
                    className="rounded-full bg-black/70 px-3 py-1 text-neutral-200 hover:bg-white/20"
                  >
                    Close compare
                  </button>
                </div>
              </div>
            )}
          </div>

          {image && loadError && (
            <p className="absolute left-6 top-6 rounded-lg bg-red-500/20 px-3 py-2 text-[13px] text-red-200">{loadError}</p>
          )}

          {image && tool === "crop" ? (
            <div className="absolute bottom-[104px] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-3 py-2 text-[13px] shadow-lg backdrop-blur">
              <span className="px-1 text-neutral-200">Drag the corners to choose what to keep.</span>
              <button type="button" onClick={() => void applyCrop()} className="rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300">
                Apply crop
              </button>
              <button type="button" onClick={() => selectTool("none")} className="rounded-full border border-white/20 px-3 py-1 text-neutral-200 hover:bg-white/10">
                Cancel
              </button>
            </div>
          ) : (
            image &&
            hint && (
              <div className="pointer-events-none absolute bottom-[104px] left-1/2 max-w-[80%] -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-[13px] text-neutral-100 shadow-lg backdrop-blur">
                {hint}
              </div>
            )
          )}

          {image && (
            <div className="absolute bottom-[104px] right-4 flex items-center gap-1 rounded-full bg-black/70 p-1 text-[12px] backdrop-blur">
              <button type="button" onClick={() => zoomAt(0.8, null)} className="h-7 w-7 rounded-full hover:bg-white/15" title="Zoom out (−)">
                −
              </button>
              <button type="button" onClick={() => setView(FIT_VIEW)} className="w-12 rounded-full px-1 tabular-nums hover:bg-white/15" title="Fit (0)">
                {Math.round(view.zoom * 100)}%
              </button>
              <button type="button" onClick={() => zoomAt(1.25, null)} className="h-7 w-7 rounded-full hover:bg-white/15" title="Zoom in (+)">
                +
              </button>
            </div>
          )}

          {dragOver && (
            <div className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-amber-400/80 bg-amber-400/5" />
          )}

          {libraryOpen && (
            <Library
              items={library}
              currentId={image?.id ?? null}
              compareId={compareId}
              onOpen={(id) => void openFromLibrary(id)}
              onDelete={removeFromLibrary}
              onCompare={(id) => {
                setCompareId(id);
                if (!id) setCompareUrl(null);
              }}
            />
          )}
        </main>

        <div
          className={`shrink-0 border-white/10 ${sidebarOpen ? "" : "hidden"} h-[42dvh] w-full border-t md:h-auto md:w-[380px] md:border-l md:border-t-0`}
        >
          {assistantOpen ? (
            <Assistant
              image={image}
              paintNames={paintIds.map((id) => PAINT_NAMES.get(id) ?? id)}
              dominantColors={palette}
              askPoint={askPoint}
              asking={tool === "ask"}
              onStartAsk={() => selectTool(tool === "ask" ? "none" : "ask")}
              onApplyPerspective={applyPerspective}
              onApplyComposition={applyComposition}
              onAnnotate={setAnnotations}
              notes={notes}
              onSaveNote={(n) => saveNotes([...notes, n])}
              onDeleteNote={(at) => saveNotes(notes.filter((n) => n.at !== at))}
              onClose={() => {
                setAssistantOpen(false);
                setAnnotations([]);
                if (tool === "ask") setTool("none");
              }}
            />
          ) : mixerOpen ? (
            <ColorMixer
              color={pickedColor}
              recent={recentColors}
              palette={palette}
              picking={tool === "eyedropper"}
              hasImage={!!image}
              onPickFromView={() => selectTool(tool === "eyedropper" ? "none" : "eyedropper")}
              onColorChange={chooseColor}
              paintIds={paintIds}
              onPaintIdsChange={(ids) => setPaintIdsJson(JSON.stringify(ids))}
              onClose={() => {
                setMixerOpen(false);
                if (tool === "eyedropper") setTool("none");
              }}
            />
          ) : (
            <Sidebar
              hasImage={!!image}
              settings={settings}
              patch={patch}
              tool={tool}
              onToolChange={selectTool}
              onClearMarks={() => {
                setSettings((s) => ({ ...s, marks: [] }));
                setPending(null);
              }}
              canSnapEyeLevel={!!lastFoundVp}
              onSnapEyeLevel={snapEyeLevel}
              autoNotan={autoNotan}
              cropped={!!image?.cropped}
              onRevertCrop={() => void revertCrop()}
              onOpenMixer={() => setMixerOpen(true)}
              onOpenAssistant={() => setAssistantOpen(true)}
              onExportView={exportView}
              onExportSheet={exportSheet}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function hintFor(tool: Tool, pending: Segment | null, marks: Mark[]): string | null {
  switch (tool) {
    case "level":
      return "Drag along an edge that should be vertical, such as a doorframe or a lamp post.";
    case "findVp":
      return pending
        ? "Now drag along a second edge that recedes to the same point."
        : "Drag along an edge that recedes into the distance: a roofline, a kerb, a window sill.";
    case "angle":
      return "Drag along any edge to read its angle from horizontal.";
    case "proportion":
      return marks.some((m) => m.type === "prop")
        ? "Drag another length to compare it with your unit."
        : "Drag along a length to set your unit of measure.";
    case "plumb":
      return "Click a point to drop vertical and horizontal lines through it.";
    case "eyedropper":
      return "Click anywhere on the image to sample its color.";
    case "ask":
      return "Tap the spot you want to ask about.";
    default:
      return null;
  }
}

function EmptyState({
  dragOver,
  error,
  recent,
  onChoose,
  onPaste,
  onSample,
  onOpen,
}: {
  dragOver: boolean;
  error: string | null;
  recent: LibraryItem[];
  onChoose: () => void;
  onPaste: () => void;
  onSample: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex max-h-full max-w-lg flex-col items-center gap-4 overflow-y-auto">
      <div
        className={`flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-10 py-12 text-center transition-colors ${
          dragOver ? "border-amber-400 bg-amber-400/5" : "border-white/15"
        }`}
      >
        <p className="text-[20px] font-medium">Drop a reference photo here</p>
        <p className="text-[14px] text-neutral-400">or paste one from the clipboard with ⌘V</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onChoose}
            className="rounded-full bg-amber-400 px-5 py-2 text-[14px] font-medium text-black hover:bg-amber-300"
          >
            Choose a file
          </button>
          <button
            type="button"
            onClick={onPaste}
            className="rounded-full border border-white/15 px-5 py-2 text-[14px] text-neutral-200 hover:bg-white/10"
          >
            Paste from clipboard
          </button>
          <button
            type="button"
            onClick={onSample}
            className="rounded-full border border-white/15 px-5 py-2 text-[14px] text-neutral-200 hover:bg-white/10"
          >
            Try the sample scene
          </button>
        </div>
        {error && <p className="text-[13px] text-red-300">{error}</p>}
        <p className="mt-2 text-[12px] text-neutral-500">Images stay in your browser. Nothing is uploaded anywhere.</p>
      </div>
      {recent.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Recent</p>
          <div className="flex flex-wrap gap-2">
            {recent.slice(0, 12).map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onOpen(it.id)}
                title={it.name}
                className="h-16 overflow-hidden rounded-md border-2 border-transparent hover:border-amber-400"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt={it.name} className="h-full w-auto" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const PAINT_NAMES = new Map(PAINTS.map((p) => [p.id, p.name]));

function parseIds(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `m${Date.now().toString(36)}-${counter}`;
}
