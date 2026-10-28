/**
 * The image library: working-size copies of every photo opened, with the
 * study settings for each, kept in IndexedDB so a session survives a reload.
 */
import type { SessionSettings } from "./types";

const DB_NAME = "reference-studio";
const STORE = "images";
const MAX_IMAGES = 24;

export interface StoredImage {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Current working image (possibly cropped), JPEG. */
  blob: Blob;
  /** The image as first opened, for undoing a crop. */
  original: Blob;
  cropped: boolean;
  /** Small JPEG data URL for the strip. */
  thumb: string;
  addedAt: number;
  openedAt: number;
  settings: SessionSettings | null;
}

export type LibraryItem = Omit<StoredImage, "blob" | "original">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open the image library."));
  });
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Image library request failed."));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function listImages(): Promise<LibraryItem[]> {
  const all = await request<StoredImage[]>("readonly", (s) => s.getAll());
  return all
    .map((rec) => {
      const { blob: _b, original: _o, ...item } = rec;
      void _b;
      void _o;
      return item;
    })
    .sort((a, b) => b.openedAt - a.openedAt);
}

export function getImage(id: string): Promise<StoredImage | undefined> {
  return request<StoredImage | undefined>("readonly", (s) => s.get(id));
}

export async function putImage(rec: StoredImage): Promise<void> {
  await request("readwrite", (s) => s.put(rec));
  const all = await request<StoredImage[]>("readonly", (s) => s.getAll());
  if (all.length > MAX_IMAGES) {
    const stale = all.sort((a, b) => a.openedAt - b.openedAt).slice(0, all.length - MAX_IMAGES);
    for (const old of stale) await request("readwrite", (s) => s.delete(old.id));
  }
}

export async function updateImage(id: string, patch: Partial<StoredImage>): Promise<void> {
  const rec = await getImage(id);
  if (!rec) return;
  await request("readwrite", (s) => s.put({ ...rec, ...patch }));
}

export function deleteImage(id: string): Promise<void> {
  return request("readwrite", (s) => s.delete(id)).then(() => undefined);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), type, quality);
  });
}

export function makeThumb(source: HTMLCanvasElement, maxEdge = 220): string {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(source.width * scale));
  c.height = Math.max(1, Math.round(source.height * scale));
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
