import type { CanvasItem, ImageCanvasItem, PinterestCanvasItem } from "./types";

export type SelectedPinterestSource =
  | { kind: "image"; item: ImageCanvasItem }
  | { kind: "pin"; item: PinterestCanvasItem };

/**
 * Selection the slideshow generator can use: image nodes tagged with a pin URL,
 * or Pinterest pin nodes whose preview (thumbnail) has loaded.
 */
export function selectedPinterestSources(
  items: CanvasItem[],
  selectedIds: string[],
): SelectedPinterestSource[] {
  const sel = new Set(selectedIds);
  const out: SelectedPinterestSource[] = [];
  for (const i of items) {
    if (!sel.has(i.id)) continue;
    if (i.type === "image" && i.pinterestPinUrl?.trim()) {
      out.push({ kind: "image", item: i });
    } else if (
      i.type === "pinterest" &&
      i.url?.trim() &&
      i.previewStatus === "ready" &&
      i.thumbnailUrl?.trim()
    ) {
      out.push({ kind: "pin", item: i });
    }
  }
  return out;
}

export function selectedPinterestPinStillLoading(
  items: CanvasItem[],
  selectedIds: string[],
): boolean {
  const sel = new Set(selectedIds);
  return items.some(
    (i) =>
      i.type === "pinterest" &&
      sel.has(i.id) &&
      (i.previewStatus === "loading" ||
        i.previewStatus === "error" ||
        !i.thumbnailUrl?.trim()),
  );
}
