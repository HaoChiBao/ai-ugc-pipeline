"use client";

import type {
  CanvasGroup,
  CanvasItem,
  ImageCanvasItem,
  PinterestCanvasItem,
} from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

type CanvasGroupNavigatorProps = {
  items: CanvasItem[];
  groups: CanvasGroup[];
  onGoToGroup: (g: CanvasGroup) => void;
  className?: string;
};

export function CanvasGroupNavigator({
  items,
  groups,
  onGoToGroup,
  className,
}: CanvasGroupNavigatorProps) {
  if (groups.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed left-3 top-1/2 z-40 flex max-h-[min(72vh,32rem)] w-[4.75rem] -translate-y-1/2 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur-sm",
        className,
      )}
      role="navigation"
      aria-label="Groups"
    >
      {groups.map((g) => {
        const firstId = g.memberImageIds[0];
        const node = items.find((i) => i.id === firstId);
        const thumbSrc =
          node?.type === "image"
            ? (node as ImageCanvasItem).src
            : node?.type === "pinterest"
              ? (node as PinterestCanvasItem).thumbnailUrl
              : null;
        if (!thumbSrc) return null;
        return (
          <button
            key={g.id}
            type="button"
            className="relative aspect-square w-full shrink-0 overflow-hidden rounded-lg border border-border bg-muted ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-primary"
            onClick={() => onGoToGroup(g)}
            title={g.label || "Group"}
            aria-label={`Go to group: ${g.label || "Untitled"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbSrc}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </button>
        );
      })}
    </div>
  );
}
