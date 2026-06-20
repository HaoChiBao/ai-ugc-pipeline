import { zipSync } from "fflate";
import type { CanvasItem } from "./types";

export type DownloadableCanvasItem = {
  id: string;
  fetchUrl: string;
  filename: string;
};

function sanitizeFilename(raw: string): string {
  const base = raw
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 72);
  return base || "image";
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("jpeg") || m.includes("jpg")) return ".jpg";
  return ".jpg";
}

function extFromUrl(url: string): string | null {
  try {
    const path = new URL(url, "https://local.invalid").pathname;
    const m = path.match(/\.(jpe?g|png|webp|gif)$/i);
    return m ? `.${m[1]!.toLowerCase().replace("jpeg", "jpg")}` : null;
  } catch {
    return null;
  }
}

function uniqueFilename(base: string, index: number, total: number): string {
  if (total <= 1) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  const prefix = String(index + 1).padStart(String(total).length, "0");
  return `${prefix}-${stem}${ext}`;
}

/** Items in `ids` that have image bytes we can fetch and save. */
export function resolveDownloadableItems(
  items: CanvasItem[],
  ids: string[],
): DownloadableCanvasItem[] {
  const idSet = new Set(ids);
  const out: DownloadableCanvasItem[] = [];
  let n = 0;

  for (const item of items) {
    if (!idSet.has(item.id)) continue;

    if (item.type === "image" && item.src.trim()) {
      const stem =
        item.label?.trim() ||
        (item.pinterestPinUrl
          ? `pinterest-${++n}`
          : `image-${++n}`);
      const ext = extFromUrl(item.src) ?? ".jpg";
      out.push({
        id: item.id,
        fetchUrl: item.src,
        filename: `${sanitizeFilename(stem)}${ext}`,
      });
      continue;
    }

    if (
      item.type === "pinterest" &&
      item.previewStatus === "ready" &&
      item.thumbnailUrl?.trim()
    ) {
      const stem = item.title?.trim() || `pinterest-pin-${++n}`;
      out.push({
        id: item.id,
        fetchUrl: `/api/pinterest/image-proxy?url=${encodeURIComponent(
          item.thumbnailUrl,
        )}`,
        filename: `${sanitizeFilename(stem)}.jpg`,
      });
    }
  }

  return out;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fetchDownloadBlob(
  entry: DownloadableCanvasItem,
): Promise<Blob | null> {
  try {
    const res = await fetch(entry.fetchUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function downloadCanvasItems(
  items: CanvasItem[],
  ids: string[],
): Promise<{ downloaded: number; failed: number; skipped: number }> {
  const downloadable = resolveDownloadableItems(items, ids);
  const skipped = ids.length - downloadable.length;
  if (downloadable.length === 0) {
    return { downloaded: 0, failed: 0, skipped };
  }

  const fetched: { name: string; blob: Blob }[] = [];
  let failed = 0;

  for (let i = 0; i < downloadable.length; i++) {
    const entry = downloadable[i]!;
    const blob = await fetchDownloadBlob(entry);
    if (!blob) {
      failed += 1;
      continue;
    }
    const ext = extFromMime(blob.type);
    const baseName = entry.filename.includes(".")
      ? entry.filename
      : `${entry.filename}${ext}`;
    fetched.push({
      name: uniqueFilename(baseName, i, downloadable.length),
      blob,
    });
  }

  if (fetched.length === 0) {
    return { downloaded: 0, failed, skipped };
  }

  if (fetched.length === 1) {
    triggerBlobDownload(fetched[0]!.blob, fetched[0]!.name);
    return { downloaded: 1, failed, skipped };
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const file of fetched) {
    zipEntries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
  }

  const zipped = zipSync(zipEntries);
  const stamp = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(
    new Blob([zipped], { type: "application/zip" }),
    `pinterest-board-${stamp}.zip`,
  );

  return { downloaded: fetched.length, failed, skipped };
}
