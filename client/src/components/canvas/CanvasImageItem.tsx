"use client";

import { useCallback, useRef } from "react";
import type { ImageCanvasItem } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

const MIN_SIZE = 32;

type Corner = "nw" | "ne" | "sw" | "se";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasImageItemProps = {
  item: ImageCanvasItem;
  isSelected: boolean;
  toWorld: ToWorld;
  onSelect: () => void;
  onUpdate: (
    patch: Partial<Pick<ImageCanvasItem, "x" | "y" | "width" | "height">>,
  ) => void;
};

export function CanvasImageItem({
  item,
  isSelected,
  toWorld,
  onSelect,
  onUpdate,
}: CanvasImageItemProps) {
  const dragRef = useRef<{
    startItem: { x: number; y: number; w: number; h: number };
    startWorld: { x: number; y: number };
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
      onSelect();
      const w = toWorld(e.clientX, e.clientY);
      dragRef.current = {
        startItem: { x: item.x, y: item.y, w: item.width, h: item.height },
        startWorld: w,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [item.height, item.width, item.x, item.y, onSelect, toWorld],
  );

  const onBodyPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - d.startWorld.x;
      const dy = w.y - d.startWorld.y;
      onUpdate({
        x: d.startItem.x + dx,
        y: d.startItem.y + dy,
      });
    },
    [onUpdate, toWorld],
  );

  const onBodyPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
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
      onSelect();
      const w = toWorld(e.clientX, e.clientY);
      resizeRef.current = {
        corner,
        startItem: { x: item.x, y: item.y, w: item.width, h: item.height },
        startWorld: w,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [item.height, item.width, item.x, item.y, onSelect, toWorld],
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

      onUpdate({ x: nx, y: ny, width: nw, height: nh });
    },
    [onUpdate, toWorld],
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
