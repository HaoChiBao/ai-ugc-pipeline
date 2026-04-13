"use client";

import { useCallback, useRef } from "react";
import type {
  CanvasItem,
  CanvasItemPatch,
  TikTokCanvasItem,
} from "@/lib/canvas/types";
import { compactUrlDisplay } from "@/lib/url-nodes/formatUrl";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2 } from "lucide-react";

const MIN_W = 200;
const MIN_H = 140;

type Corner = "nw" | "ne" | "sw" | "se";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasTikTokItemProps = {
  item: TikTokCanvasItem;
  items: CanvasItem[];
  selectedIds: string[];
  isSelected: boolean;
  toWorld: ToWorld;
  onSelect: (additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
};

export function CanvasTikTokItem({
  item,
  items,
  selectedIds,
  isSelected,
  toWorld,
  onSelect,
  onUpdateItem,
}: CanvasTikTokItemProps) {
  const dragRef = useRef<{
    startItem: { x: number; y: number; w: number; h: number };
    startWorld: { x: number; y: number };
  } | null>(null);

  const groupDragRef = useRef<{
    startWorld: { x: number; y: number };
    initialById: Map<string, { x: number; y: number }>;
  } | null>(null);

  const resizeRef = useRef<{
    corner: Corner;
    startItem: { x: number; y: number; w: number; h: number };
    startWorld: { x: number; y: number };
  } | null>(null);

  const onBodyPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const additive =
        e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) {
        e.preventDefault();
        onSelect(true);
        return;
      }
      onSelect(false);
      const w = toWorld(e.clientX, e.clientY);
      const group =
        selectedIds.includes(item.id) && selectedIds.length > 1;
      if (group) {
        const initialById = new Map<string, { x: number; y: number }>();
        for (const id of selectedIds) {
          const it = items.find((i) => i.id === id);
          if (it) {
            initialById.set(id, { x: it.x, y: it.y });
          }
        }
        groupDragRef.current = { startWorld: w, initialById };
      } else {
        dragRef.current = {
          startItem: { x: item.x, y: item.y, w: item.width, h: item.height },
          startWorld: w,
        };
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      item.height,
      item.width,
      item.x,
      item.y,
      item.id,
      items,
      onSelect,
      selectedIds,
      toWorld,
    ],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = groupDragRef.current;
      if (g) {
        const w = toWorld(e.clientX, e.clientY);
        const dx = w.x - g.startWorld.x;
        const dy = w.y - g.startWorld.y;
        for (const [id, pos] of g.initialById) {
          onUpdateItem(id, { x: pos.x + dx, y: pos.y + dy });
        }
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - d.startWorld.x;
      const dy = w.y - d.startWorld.y;
      onUpdateItem(item.id, {
        x: d.startItem.x + dx,
        y: d.startItem.y + dy,
      });
    },
    [item.id, onUpdateItem, toWorld],
  );

  const onBodyPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    groupDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const onResizePointerDown = useCallback(
    (corner: Corner) => (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const w = toWorld(e.clientX, e.clientY);
      resizeRef.current = {
        corner,
        startItem: { x: item.x, y: item.y, w: item.width, h: item.height },
        startWorld: w,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [item.height, item.width, item.x, item.y, toWorld],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - r.startWorld.x;
      const dy = w.y - r.startWorld.y;
      const sx = r.startItem.x;
      const sy = r.startItem.y;
      const sw = r.startItem.w;
      const sh = r.startItem.h;

      let nx = sx;
      let ny = sy;
      let nw = sw;
      let nh = sh;

      switch (r.corner) {
        case "se":
          nw = Math.max(MIN_W, sw + dx);
          nh = Math.max(MIN_H, sh + dy);
          break;
        case "ne":
          nw = Math.max(MIN_W, sw + dx);
          nh = Math.max(MIN_H, sh - dy);
          ny = sy + dy;
          break;
        case "sw":
          nw = Math.max(MIN_W, sw - dx);
          nh = Math.max(MIN_H, sh + dy);
          nx = sx + dx;
          break;
        case "nw":
          nw = Math.max(MIN_W, sw - dx);
          nh = Math.max(MIN_H, sh - dy);
          nx = sx + dx;
          ny = sy + dy;
          break;
        default:
          break;
      }

      onUpdateItem(item.id, { x: nx, y: ny, width: nw, height: nh });
    },
    [item.id, onUpdateItem, toWorld],
  );

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    resizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const handleResizeMove = useCallback(
    (e: React.PointerEvent) => {
      onResizePointerMove(e);
    },
    [onResizePointerMove],
  );

  const handleBodyMove = useCallback(
    (e: React.PointerEvent) => {
      onBodyPointerMove(e);
    },
    [onBodyPointerMove],
  );

  const compact = compactUrlDisplay(item.url);

  return (
    <div
      className={cn(
        "absolute box-border select-none",
        isSelected &&
          "shadow-md ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
      )}
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        touchAction: "none",
      }}
      data-canvas-item={item.id}
    >
      <div
        role="presentation"
        className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
        onPointerDown={onBodyPointerDown}
        onPointerMove={handleBodyMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
      >
        <div className="relative h-[45%] min-h-[72px] shrink-0 bg-muted/40">
          {item.previewStatus === "loading" && (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
              <span className="sr-only">Loading TikTok preview</span>
            </div>
          )}
          {item.previewStatus === "ready" && item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- TikTok CDN thumbnail
            <img
              src={item.thumbnailUrl}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {item.previewStatus === "ready" && !item.thumbnailUrl && (
            <div className="flex h-full items-center justify-center bg-muted/60 text-xs text-muted-foreground">
              No thumbnail
            </div>
          )}
          {item.previewStatus === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-destructive/5 px-2 text-center text-xs text-muted-foreground">
              Preview unavailable
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 p-2 pt-2">
          <p className="line-clamp-2 text-left text-xs font-medium leading-snug">
            {item.title || "TikTok"}
          </p>
          {item.authorName ? (
            <p className="line-clamp-1 text-[10px] text-muted-foreground">
              @{item.authorName.replace(/^@/, "")}
            </p>
          ) : null}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            title={item.url}
            className="mt-auto flex min-h-0 items-center gap-1 text-[10px] text-primary underline-offset-2 hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="min-w-0 truncate">{compact}</span>
            <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
          </a>
        </div>
      </div>

      {isSelected && (
        <>
          {(
            [
              ["nw", "-left-1 -top-1", "nwse-resize"],
              ["ne", "-right-1 -top-1", "nesw-resize"],
              ["sw", "-bottom-1 -left-1", "nesw-resize"],
              ["se", "-bottom-1 -right-1", "nwse-resize"],
            ] as const
          ).map(([corner, pos, cursor]) => (
            <div
              key={corner}
              role="presentation"
              className={cn(
                "absolute z-10 size-3 rounded-sm border border-primary bg-background shadow-sm",
                pos,
              )}
              style={{ cursor }}
              onPointerDown={onResizePointerDown(corner)}
              onPointerMove={handleResizeMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
          ))}
        </>
      )}
    </div>
  );
}
