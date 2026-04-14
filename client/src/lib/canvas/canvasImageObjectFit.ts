import type { ImageCanvasItem } from "@/lib/canvas/types";

/**
 * Same rules as {@link CanvasImageItem}: Pinterest + Similar uses cover unless overridden;
 * otherwise explicit `imageObjectFit` or contain.
 */
export function resolveCanvasImageObjectFit(
  item: ImageCanvasItem,
  pinterestSimilarEnabled: boolean,
): "cover" | "contain" {
  const pinterestFull =
    Boolean(item.pinterestPinUrl?.trim()) && pinterestSimilarEnabled;
  return item.imageObjectFit ?? (pinterestFull ? "cover" : "contain");
}
