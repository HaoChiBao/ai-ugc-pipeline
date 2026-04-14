import type { CanvasItem, TextCanvasItem } from "@/lib/canvas/types";

function isAttachedCaption(item: CanvasItem): item is TextCanvasItem {
  return (
    item.type === "text" &&
    Boolean(item.attachedToImageId || item.attachedToPinterestItemId)
  );
}

/** Axis-aligned rectangle intersection in world (canvas) space. */
export function worldRectsIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return !(ax + aw < bx || ax > bx + bw || ay + ah < by || ay > by + bh);
}

export function itemIntersectsWorldRect(
  item: CanvasItem,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  if (isAttachedCaption(item)) {
    return false;
  }
  return worldRectsIntersect(rx, ry, rw, rh, item.x, item.y, item.width, item.height);
}
