"use client";

import type { ImageCanvasItem } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

type SelectedCanvasAssetsListProps = {
  images: ImageCanvasItem[];
  selectedIds: string[];
};

export function SelectedCanvasAssetsList({
  images,
  selectedIds,
}: SelectedCanvasAssetsListProps) {
  const set = new Set(selectedIds);
  const selected = images.filter((i) => set.has(i.id));

  if (selected.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Select one or more images on the canvas (Shift+click to add/remove;
        drag on empty canvas to box-select).
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {selected.map((img) => (
        <li
          key={img.id}
          className={cn(
            "relative size-14 overflow-hidden rounded-md border bg-muted",
            img.canvasAssetId ? "border-primary/40" : "border-amber-500/50",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt=""
            className="size-full object-cover"
          />
          {!img.canvasAssetId ? (
            <span className="absolute bottom-0 left-0 right-0 bg-amber-600/90 px-0.5 text-center text-[9px] text-white">
              upload
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
