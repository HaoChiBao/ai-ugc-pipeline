"use client";

import type { CanvasGroup, CanvasItem } from "@/lib/canvas/types";
import { groupBoundsFromLayout } from "@/lib/canvas/groupLayout";
import type { EffectiveItemLayout } from "@/lib/canvas/groupLayout";

type CanvasGroupMergeHighlightProps = {
  groupId: string | null;
  items: CanvasItem[];
  groups: CanvasGroup[];
  layoutMap: Map<string, EffectiveItemLayout>;
  /** Canvas zoom so label stays ~fixed size on screen */
  viewportZoom: number;
};

export function CanvasGroupMergeHighlight({
  groupId,
  items,
  groups,
  layoutMap,
  viewportZoom,
}: CanvasGroupMergeHighlightProps) {
  if (!groupId) return null;
  const g = groups.find((x) => x.id === groupId);
  if (!g) return null;
  const box = groupBoundsFromLayout(items, g, layoutMap);
  if (!box) return null;

  const inv = 1 / Math.max(viewportZoom, 0.15);

  return (
    <div
      className="pointer-events-none absolute z-[280] flex items-center justify-center rounded-lg bg-black/50"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
      }}
      aria-hidden
    >
      <span
        className="rounded-md bg-background/95 px-3 py-2 text-sm font-semibold text-foreground shadow-lg"
        style={{
          transform: `scale(${inv})`,
          transformOrigin: "center center",
        }}
      >
        Add to group
      </span>
    </div>
  );
}
