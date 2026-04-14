"use client";

import { useCallback, useRef, useState } from "react";
import {
  DEFAULT_CAPTION_FONT_PX,
  type CanvasItem,
  type CanvasItemPatch,
  type TextCanvasItem,
} from "@/lib/canvas/types";
import type { EffectiveItemLayout } from "@/lib/canvas/groupLayout";
import { cn } from "@/lib/utils";

const MIN_W = 120;
const MIN_H = 48;

type Corner = "nw" | "ne" | "sw" | "se";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasTextItemProps = {
  item: TextCanvasItem;
  items: CanvasItem[];
  selectedIds: string[];
  isSelected: boolean;
  toWorld: ToWorld;
  onSelect: (additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
  layoutOverride?: EffectiveItemLayout | null;
};

type TextDrag = {
  kind: "item";
  startItem: { x: number; y: number; w: number; h: number };
  startWorld: { x: number; y: number };
};

export function CanvasTextItem({
  item,
  items,
  selectedIds,
  isSelected,
  toWorld,
  onSelect,
  onUpdateItem,
  layoutOverride,
}: CanvasTextItemProps) {
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<TextDrag | null>(null);

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
      const fromTextarea = Boolean(
        (e.target as HTMLElement).closest("textarea"),
      );
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (fromTextarea) {
        if (additive) {
          e.preventDefault();
          onSelect(true);
        } else {
          onSelect(false);
        }
        return;
      }
      if (additive) {
        e.preventDefault();
        onSelect(true);
        return;
      }
      onSelect(false);
      setDragging(true);
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
          kind: "item",
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
      if (d.kind !== "item") return;
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
    setDragging(false);
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

  const align = item.textAlign ?? "center";
  const fontPx = item.fontSize ?? DEFAULT_CAPTION_FONT_PX;
  const color = item.color ?? "#ffffff";
  const fontFamily =
    item.fontFamily ??
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const fontWeight = item.fontWeight ?? 700;

  const showFrame =
    isSelected || dragging;

  const left = layoutOverride?.x ?? item.x;
  const top = layoutOverride?.y ?? item.y;
  const layoutZ = layoutOverride?.zIndex;
  const zIndex =
    (item.stackPriority ?? 0) * 10_000 + (layoutZ ?? 8);

  return (
    <div
      className="group absolute box-border select-none transition-[left,top] duration-200 ease-out"
      style={{
        left,
        top,
        width: item.width,
        height: item.height,
        touchAction: "none",
        zIndex,
      }}
      data-canvas-item={item.id}
    >
      <div
        role="presentation"
        className={cn(
          "relative flex h-full w-full flex-col overflow-visible rounded-[2px]",
          !showFrame &&
            "outline-none outline-dashed outline-2 outline-transparent transition-[outline-color] duration-100",
          !showFrame &&
            "group-hover:outline group-hover:outline-2 group-hover:outline-dashed group-hover:outline-primary/55",
          showFrame &&
            "outline outline-2 outline-solid outline-primary outline-offset-[3px]",
        )}
        onPointerDown={onBodyPointerDown}
        onPointerMove={onBodyPointerMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
      >
        <div
          data-caption-grab
          className="h-1.5 w-full shrink-0 cursor-grab touch-none rounded-t-[2px] hover:bg-primary/10"
          aria-label="Drag to move"
          title="Drag to move"
        />
        <textarea
          className={cn(
            "min-h-0 w-full flex-1 resize-none border-0 bg-transparent px-1 py-0.5 outline-none focus-visible:ring-0",
            "[overflow-wrap:anywhere] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
            align === "center" && "text-center",
            align === "right" && "text-right",
            "selection:bg-primary/35",
          )}
          style={{
            fontSize: fontPx,
            fontWeight,
            fontFamily,
            color,
            WebkitTextFillColor: color,
            WebkitTextStroke: "1.15px rgba(0,0,0,0.88)",
            paintOrder: "stroke fill",
            textShadow:
              "0 2px 5px rgba(0,0,0,0.78), 0 0 14px rgba(0,0,0,0.35)",
            caretColor: "#ffffff",
            lineHeight: 1.28,
          }}
          value={item.text}
          onChange={(e) => onUpdateItem(item.id, { text: e.target.value })}
          spellCheck
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
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
            />
          ))}
        </>
      )}
    </div>
  );
}
