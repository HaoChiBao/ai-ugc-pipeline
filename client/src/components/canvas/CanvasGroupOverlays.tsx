"use client";

import type { CanvasGroup, CanvasItem } from "@/lib/canvas/types";
import {
  groupBoundsFromLayout,
  groupExpanded,
  type EffectiveItemLayout,
} from "@/lib/canvas/groupLayout";
import { XIcon } from "lucide-react";

type CanvasGroupOverlaysProps = {
  items: CanvasItem[];
  groups: CanvasGroup[];
  /** Full layout for pinned groups (no hover preview). */
  layoutMap: Map<string, EffectiveItemLayout>;
  onPatchGroup: (id: string, patch: Partial<CanvasGroup>) => void;
  /** Keeps title + close control readable at any zoom (inverse scale). */
  viewportZoom: number;
};

export function CanvasGroupOverlays({
  items,
  groups,
  layoutMap,
  onPatchGroup,
  viewportZoom,
}: CanvasGroupOverlaysProps) {
  const inv = 1 / Math.max(viewportZoom, 0.15);

  return (
    <>
      {groups.map((g) => {
        if (!groupExpanded(g)) return null;
        const box = groupBoundsFromLayout(items, g, layoutMap);
        if (!box) return null;

        const onClose = (e: React.MouseEvent) => {
          e.stopPropagation();
          onPatchGroup(g.id, {
            expandedPinned: false,
            expandedGrid: undefined,
          });
        };

        return (
          <div
            key={g.id}
            className="pointer-events-none absolute"
            style={{
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              zIndex: 50_000_000,
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 z-0 rounded-lg border-2 border-dashed border-primary"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-1 flex justify-center">
              <div
                className="pointer-events-auto"
                style={{
                  transform: `scale(${inv})`,
                  transformOrigin: "center bottom",
                }}
              >
                <input
                  type="text"
                  value={g.label}
                  onChange={(e) =>
                    onPatchGroup(g.id, { label: e.target.value })
                  }
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-9 w-[7.5rem] rounded-md border border-border bg-background px-2 text-sm shadow-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Group name"
                />
              </div>
            </div>
            <div
              className="pointer-events-auto absolute right-0 top-0 z-20"
              style={{
                transform: `scale(${inv})`,
                transformOrigin: "100% 0",
              }}
            >
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md hover:bg-muted hover:text-foreground"
                onClick={onClose}
                aria-label="Close group"
              >
                <XIcon className="size-5 shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
