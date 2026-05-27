'use client';
// lib/cad/media/media-store.ts
//
// Media attachments for drawing features and layers. Photos/videos are
// attached to a point/line/shape (by feature id) or a layer (by layer id).
// Blobs + metadata live in their OWN IndexedDB ('starr-cad-media') keyed by
// media id — deliberately separate from the DrawingDocument so attaching
// media never bloats the saved drawing or touches the save path. A Zustand
// `byOwner` index (hydrated from IDB on load) lets the UI gate synchronously
// (e.g. show "View media" only when something is attached).

import { create } from 'zustand';

export type MediaKind = 'image' | 'video';
export type MediaOwnerKind = 'feature' | 'layer';

export interface MediaItem {
  id: string;
  ownerId: string;
  ownerKind: MediaOwnerKind;
  kind: MediaKind;
  name: string;
  mime: string;
  size: number;
  /** Small data-URL preview for images; null for video. */
  thumbnail: string | null;
  addedAt: string;
}

// ── Pure index helpers (unit-tested; no IDB/DOM) ──────────────────────────

export function indexAdd(
  byOwner: Record<string, MediaItem[]>,
  item: MediaItem,
): Record<string, MediaItem[]> {
  const list = byOwner[item.ownerId] ?? [];
  return { ...byOwner, [item.ownerId]: [...list, item] };
}

export function indexRemove(
  byOwner: Record<string, MediaItem[]>,
  id: string,
): Record<string, MediaItem[]> {
  const out: Record<string, MediaItem[]> = {};
  for (const [owner, list] of Object.entries(byOwner)) {
    const filtered = list.filter((m) => m.id !== id);
    if (filtered.length > 0) out[owner] = filtered;
  }
  return out;
}

export function indexFromMeta(items: MediaItem[]): Record<string, MediaItem[]> {
  let byOwner: Record<string, MediaItem[]> = {};
  for (const it of items) byOwner = indexAdd(byOwner, it);
  return byOwner;
}

// ── IndexedDB ─────────────────────────────────────────────────────────────

const DB_NAME = 'starr-cad-media';
const DB_VERSION = 1;
const BLOBS = 'blobs';
const META = 'meta';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(item: MediaItem, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BLOBS, META], 'readwrite');
    tx.objectStore(BLOBS).put(blob, item.id);
    tx.objectStore(META).put(item, item.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function dbAllMeta(): Promise<MediaItem[]> {
  const db = await openDb();
  const items = await new Promise<MediaItem[]>((resolve, reject) => {
    const req = db.transaction(META, 'readonly').objectStore(META).getAll();
    req.onsuccess = () => resolve((req.result as MediaItem[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

async function dbGetBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const req = db.transaction(BLOBS, 'readonly').objectStore(BLOBS).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BLOBS, META], 'readwrite');
    tx.objectStore(BLOBS).delete(id);
    tx.objectStore(META).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ── Thumbnail generation (images only) ────────────────────────────────────

function makeThumbnail(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 96;
        const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
        const w = Math.max(1, Math.round((img.width || max) * scale));
        const h = Math.max(1, Math.round((img.height || max) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0, w, h);
        resolve(ctx ? canvas.toDataURL('image/jpeg', 0.7) : null);
      } catch { resolve(null); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function genId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Store ─────────────────────────────────────────────────────────────────

interface MediaStore {
  byOwner: Record<string, MediaItem[]>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addMedia: (ownerId: string, ownerKind: MediaOwnerKind, file: File) => Promise<MediaItem>;
  removeMedia: (id: string) => Promise<void>;
  mediaFor: (ownerId: string) => MediaItem[];
  hasMedia: (ownerId: string) => boolean;
  getBlobUrl: (id: string) => Promise<string | null>;
}

export const useMediaStore = create<MediaStore>((set, get) => ({
  byOwner: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const items = await dbAllMeta();
      set({ byOwner: indexFromMeta(items), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  addMedia: async (ownerId, ownerKind, file) => {
    const item: MediaItem = {
      id: genId(),
      ownerId,
      ownerKind,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      thumbnail: await makeThumbnail(file),
      addedAt: new Date().toISOString(),
    };
    await dbPut(item, file);
    set((s) => ({ byOwner: indexAdd(s.byOwner, item) }));
    return item;
  },

  removeMedia: async (id) => {
    await dbDelete(id);
    set((s) => ({ byOwner: indexRemove(s.byOwner, id) }));
  },

  mediaFor: (ownerId) => get().byOwner[ownerId] ?? [],
  hasMedia: (ownerId) => (get().byOwner[ownerId]?.length ?? 0) > 0,

  getBlobUrl: async (id) => {
    const blob = await dbGetBlob(id);
    return blob ? URL.createObjectURL(blob) : null;
  },
}));
