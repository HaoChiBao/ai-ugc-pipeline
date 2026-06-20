import type {
  CanvasGroup,
  CanvasItem,
  ImageCanvasItem,
  PinterestCanvasItem,
  TextCanvasItem,
  ViewportState,
} from "@/lib/canvas/types";
import { createObjectUrl } from "@/lib/canvas/files";
import {
  blobFromImageSrc,
  clearCanvasImageStore,
  getCanvasImageBlob,
  pruneCanvasImageBlobs,
  putCanvasImageBlob,
} from "@/lib/canvas/canvasImageStore";

const DOC_KEY = "ai-ugc-pinterest-board-v1";
const VIEWPORT_KEY = "ai-ugc-pinterest-board-viewport-v1";
const SCHEMA_VERSION = 1;

export type PersistedCanvasDoc = {
  version: typeof SCHEMA_VERSION;
  items: PersistedCanvasItem[];
  groups: CanvasGroup[];
};

type PersistedImageItem = Omit<ImageCanvasItem, "src"> & {
  type: "image";
  /** When true, pixels are in IndexedDB under `id`. */
  hasStoredBlob: boolean;
};

type PersistedCanvasItem =
  | PersistedImageItem
  | PinterestCanvasItem
  | TextCanvasItem;

function isImageItem(i: CanvasItem): i is ImageCanvasItem {
  return i.type === "image";
}

function serializeItem(item: CanvasItem): PersistedCanvasItem {
  if (!isImageItem(item)) {
    return item;
  }
  const { src, ...rest } = item;
  const hasStoredBlob = src.startsWith("blob:") || src.startsWith("data:");
  return { ...rest, type: "image", hasStoredBlob };
}

export async function saveCanvasToStorage(input: {
  items: CanvasItem[];
  groups: CanvasGroup[];
  viewport: ViewportState;
}): Promise<void> {
  if (typeof window === "undefined") return;

  const { items, groups, viewport } = input;

  if (items.length === 0 && groups.length === 0) {
    await clearPersistedCanvas();
    return;
  }

  const imageIds = new Set<string>();
  for (const item of items) {
    if (!isImageItem(item)) continue;
    imageIds.add(item.id);
    if (!item.src.startsWith("blob:") && !item.src.startsWith("data:")) {
      continue;
    }
    const blob = await blobFromImageSrc(item.src);
    if (blob) {
      await putCanvasImageBlob(item.id, blob);
    }
  }

  await pruneCanvasImageBlobs(imageIds);

  const payload: PersistedCanvasDoc = {
    version: SCHEMA_VERSION,
    items: items.map(serializeItem),
    groups: groups.map((g) => ({
      ...g,
      memberImageIds: [...g.memberImageIds],
      ...(g.expandedGrid ? { expandedGrid: { ...g.expandedGrid } } : {}),
    })),
  };

  localStorage.setItem(DOC_KEY, JSON.stringify(payload));
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
}

export async function clearPersistedCanvas(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DOC_KEY);
  localStorage.removeItem(VIEWPORT_KEY);
  await clearCanvasImageStore();
}

export async function loadCanvasFromStorage(): Promise<{
  items: CanvasItem[];
  groups: CanvasGroup[];
  viewport: ViewportState | null;
} | null> {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(DOC_KEY);
  if (!raw) return null;

  let parsed: PersistedCanvasDoc;
  try {
    parsed = JSON.parse(raw) as PersistedCanvasDoc;
  } catch {
    return null;
  }

  if (parsed.version !== SCHEMA_VERSION || !Array.isArray(parsed.items)) {
    return null;
  }

  const items: CanvasItem[] = [];
  for (const row of parsed.items) {
    if (row.type === "image") {
      const img = row as PersistedImageItem;
      let src = "";
      if (img.hasStoredBlob) {
        const blob = await getCanvasImageBlob(img.id);
        if (blob) {
          src = createObjectUrl(blob);
        }
      }
      if (!src) {
        continue;
      }
      items.push({ ...img, src } as ImageCanvasItem);
      continue;
    }
    if (row.type === "pinterest") {
      const pin = row as PinterestCanvasItem;
      items.push({
        ...pin,
        previewStatus:
          pin.previewStatus === "loading" && pin.thumbnailUrl
            ? "ready"
            : pin.previewStatus,
      });
      continue;
    }
    if (row.type === "text") {
      items.push(row);
    }
  }

  const loadedIds = new Set(items.map((i) => i.id));
  const groups = (Array.isArray(parsed.groups) ? parsed.groups : []).map(
    (g) => ({
      ...g,
      memberImageIds: g.memberImageIds.filter((id) => loadedIds.has(id)),
      ...(g.expandedGrid ? { expandedGrid: { ...g.expandedGrid } } : {}),
    }),
  );

  let viewport: ViewportState | null = null;
  const vpRaw = localStorage.getItem(VIEWPORT_KEY);
  if (vpRaw) {
    try {
      const v = JSON.parse(vpRaw) as ViewportState;
      if (
        typeof v.panX === "number" &&
        typeof v.panY === "number" &&
        typeof v.zoom === "number"
      ) {
        viewport = v;
      }
    } catch {
      /* ignore */
    }
  }

  return { items, groups, viewport };
}
