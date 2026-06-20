import type { CanvasItem } from "./types";
import { resolveDownloadableItems } from "./downloadCanvasItems";
import { isMarqueeSelectableItem } from "./intersects";

export { resolveDownloadableItems } from "./downloadCanvasItems";

/** IDs that should participate in image/pin context-menu actions. */
export function contextMenuTargetIds(
  items: CanvasItem[],
  itemId: string,
  selectedIds: string[],
): string[] {
  const base = selectedIds.includes(itemId) ? [...selectedIds] : [itemId];
  return base.filter((id) => {
    const item = items.find((i) => i.id === id);
    return item && isMarqueeSelectableItem(item);
  });
}

export function downloadableIdsFromSelection(
  items: CanvasItem[],
  ids: string[],
): string[] {
  return resolveDownloadableItems(items, ids).map((d) => d.id);
}
