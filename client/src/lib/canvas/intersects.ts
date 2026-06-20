import type { CanvasItem } from "./types";
import type { EffectiveItemLayout } from "./groupLayout";

function isAttachedCaption(item: CanvasItem): boolean {
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

export function getEffectiveItemRect(
  item: CanvasItem,
  layoutMap?: Map<string, EffectiveItemLayout> | null,
): { x: number; y: number; width: number; height: number } {
  const layout = layoutMap?.get(item.id);
  return {
    x: layout?.x ?? item.x,
    y: layout?.y ?? item.y,
    width: item.width,
    height: item.height,
  };
}

/** Hit-test using on-screen layout (groups, collapsed stacks, grids). */
export function itemIntersectsWorldRect(
  item: CanvasItem,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  layoutMap?: Map<string, EffectiveItemLayout> | null,
): boolean {
  if (isAttachedCaption(item)) {
    return false;
  }
  const bounds = getEffectiveItemRect(item, layoutMap);
  return worldRectsIntersect(
    rx,
    ry,
    rw,
    rh,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
  );
}

export function isMarqueeSelectableItem(item: CanvasItem): boolean {
  return item.type === "image" || item.type === "pinterest";
}
