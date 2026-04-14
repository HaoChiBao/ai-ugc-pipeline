import type {
  CanvasItem,
  TikTokCanvasItem,
} from "@/lib/canvas/types";
import type { SelectedPinterestSource } from "@/lib/canvas/pinterestSelection";
import {
  selectedPinterestPinStillLoading,
  selectedPinterestSources,
} from "@/lib/canvas/pinterestSelection";

/** Pinterest-tagged image, pin card, or TikTok card — visual pool for captioned slideshow */
export type SlideshowVisualSource =
  | SelectedPinterestSource
  | { kind: "tiktok"; item: TikTokCanvasItem };

export function selectedSlideshowVisualSources(
  items: CanvasItem[],
  selectedIds: string[],
): SlideshowVisualSource[] {
  const pin = selectedPinterestSources(items, selectedIds);
  const sel = new Set(selectedIds);
  const tk: SlideshowVisualSource[] = [];
  for (const i of items) {
    if (!sel.has(i.id) || i.type !== "tiktok") continue;
    if (i.previewStatus === "ready" && i.thumbnailUrl?.trim()) {
      tk.push({ kind: "tiktok", item: i });
    }
  }
  return [...pin, ...tk];
}

export function selectedSlideshowVisualStillLoading(
  items: CanvasItem[],
  selectedIds: string[],
): boolean {
  if (selectedPinterestPinStillLoading(items, selectedIds)) return true;
  const sel = new Set(selectedIds);
  return items.some(
    (i) =>
      i.type === "tiktok" &&
      sel.has(i.id) &&
      (i.previewStatus === "loading" ||
        (i.previewStatus === "ready" && !i.thumbnailUrl?.trim())),
  );
}

/** Full TikTok analysis text blocks for the slideshow agent user turn */
export function buildSelectedTiktokContextBlock(
  items: CanvasItem[],
  selectedIds: string[],
): string {
  const sel = new Set(selectedIds);
  const blocks: string[] = [];
  for (const i of items) {
    if (i.type !== "tiktok" || !sel.has(i.id)) continue;
    const t = i.analysisContextText?.trim();
    if (!t) continue;
    blocks.push(`### TikTok canvas id=${i.id}\nURL: ${i.url}\n\n${t}`);
  }
  if (blocks.length === 0) return "";
  return `## Selected TikTok reference analyses\n\n${blocks.join("\n\n---\n\n")}`;
}
