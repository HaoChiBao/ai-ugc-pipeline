"use client";

import type { CanvasItem, ImageCanvasItem } from "@/lib/canvas/types";
import type { EffectiveItemLayout } from "@/lib/canvas/groupLayout";

type CanvasPairGroupHighlightProps = {
  targetImageId: string | null;
  items: CanvasItem[];
  layoutMap: Map<string, EffectiveItemLayout>;
  viewportZoom: number;
};

export function CanvasPairGroupHighlight({
  targetImageId,
  items,
  layoutMap,
  viewportZoom,
}: CanvasPairGroupHighlightProps) {
  if (!targetImageId) return null;
  const im = items.find(
    (i): i is ImageCanvasItem =>
      i.id === targetImageId && i.type === "image",
  );
  if (!im) return null;
  const L = layoutMap.get(im.id);
  const x = L?.x ?? im.x;
  const y = L?.y ?? im.y;
  const inv = 1 / Math.max(viewportZoom, 0.15);

  return (
    <div
      className="pointer-events-none absolute z-[270] flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/15"
      style={{
        left: x,
        top: y,
        width: im.width,
        height: im.height,
      }}
      aria-hidden
    >
      <span
        className="max-w-[min(90%,18rem)] rounded-md bg-background/95 px-3 py-2 text-center text-sm font-semibold text-foreground shadow-lg"
        style={{
          transform: `scale(${inv})`,
          transformOrigin: "center center",
        }}
      >
        Release to create group
      </span>
    </div>
  );
}
