"use client";

import { useCallback, useRef } from "react";
import type {
  CanvasItem,
  CanvasItemPatch,
  ImageCanvasItem,
} from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

const MIN_SIZE = 32;

type Corner = "nw" | "ne" | "sw" | "se";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasImageItemProps = {
  item: ImageCanvasItem;
  items: CanvasItem[];
  selectedIds: string[];
  isSelected: boolean;
  toWorld: ToWorld;
  onSelect: (additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
};

export function CanvasImageItem({
  item,
  items,
  selectedIds,
  isSelected,
  toWorld,
  onSelect,
  onUpdateItem,
}: CanvasImageItemProps) {
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
      /** Figma-like: Shift+click toggles; Ctrl/Cmd+click also supported */
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
      /* already released */
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
          nw = Math.max(MIN_SIZE, sw + dx);
          nh = Math.max(MIN_SIZE, sh + dy);
          break;
        case "ne":
          nw = Math.max(MIN_SIZE, sw + dx);
          nh = Math.max(MIN_SIZE, sh - dy);
          ny = sy + dy;
          break;
        case "sw":
          nw = Math.max(MIN_SIZE, sw - dx);
          nh = Math.max(MIN_SIZE, sh + dy);
          nx = sx + dx;
          break;
        case "nw":
          nw = Math.max(MIN_SIZE, sw - dx);
          nh = Math.max(MIN_SIZE, sh - dy);
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
        className="relative h-full w-full overflow-hidden rounded-md bg-card"
        onPointerDown={onBodyPointerDown}
        onPointerMove={handleBodyMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-contain"
        />
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
