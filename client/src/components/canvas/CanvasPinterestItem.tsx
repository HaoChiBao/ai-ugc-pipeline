"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  CanvasGroup,
  CanvasItem,
  CanvasItemPatch,
  PinterestCanvasItem,
  PinterestSimilarRequest,
  TextCanvasItem,
} from "@/lib/canvas/types";
import type { EffectiveItemLayout } from "@/lib/canvas/groupLayout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Images, Loader2, Pencil } from "lucide-react";
import { AttachedCaptionPreview } from "./AttachedCaptionPreview";
import { PinterestHoverChrome } from "./PinterestHoverChrome";

const MIN_W = 200;
const MIN_H = 140;

type Corner = "nw" | "ne" | "sw" | "se";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

const COLLAPSED_CLICK_DRAG_PX = 6;

type DragMode =
  | {
      kind: "item";
      startDisplayX: number;
      startDisplayY: number;
      startWorld: { x: number; y: number };
    }
  | {
      kind: "collapse";
      groupId: string;
      startWorld: { x: number; y: number };
      startCx: number;
      startCy: number;
    }
  | {
      kind: "pendingCollapsedOpen";
      groupId: string;
      startWorld: { x: number; y: number };
      startCx: number;
      startCy: number;
    };

type CanvasPinterestItemProps = {
  item: PinterestCanvasItem;
  items: CanvasItem[];
  selectedIds: string[];
  isSelected: boolean;
  toWorld: ToWorld;
  onSelect: (additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
  onSimilar: (req: PinterestSimilarRequest) => Promise<void>;
  attachedCaptions?: TextCanvasItem[];
  onOpenPinterestTextEditor?: (pinterestItemId: string) => void;
  layoutOverride?: EffectiveItemLayout | null;
  groupIsCollapsed?: boolean;
  groupCollapseCenter?: { cx: number; cy: number } | null;
  onPatchGroup?: (id: string, patch: Partial<CanvasGroup>) => void;
  onMergeDrop?: (draggedId: string, worldX: number, worldY: number) => void;
  onOpenGroup?: (groupId: string) => void;
  onImageDragWorldMove?: (
    draggedId: string,
    worldX: number,
    worldY: number,
  ) => void;
  onImageDragWorldStart?: (draggedId: string) => void;
  onImageDragWorldEnd?: () => void;
  onGroupMemberDragEnd?: (
    id: string,
    finalX: number,
    finalY: number,
    width: number,
    height: number,
  ) => void;
  getImageWorldTopLeft?: (id: string) => { x: number; y: number } | undefined;
  onImageMultiDragStart?: (imageIds: string[]) => void;
};

export function CanvasPinterestItem({
  item,
  items,
  selectedIds,
  isSelected,
  toWorld,
  onSelect,
  onUpdateItem,
  onSimilar,
  attachedCaptions = [],
  onOpenPinterestTextEditor,
  layoutOverride,
  groupIsCollapsed = false,
  groupCollapseCenter,
  onPatchGroup,
  onMergeDrop,
  onOpenGroup,
  onImageDragWorldMove,
  onImageDragWorldStart,
  onImageDragWorldEnd,
  onGroupMemberDragEnd,
  getImageWorldTopLeft,
  onImageMultiDragStart,
}: CanvasPinterestItemProps) {
  const [similarBusy, setSimilarBusy] = useState(false);
  const [liveDragPos, setLiveDragPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const dragRef = useRef<DragMode | null>(null);
  const layoutOverrideRef = useRef(layoutOverride);
  layoutOverrideRef.current = layoutOverride;

  const mergeMoveRafRef = useRef<number | null>(null);
  const mergeMovePendingRef = useRef<{
    id: string;
    wx: number;
    wy: number;
  } | null>(null);

  const scheduleMergeHoverMove = useCallback(
    (id: string, wx: number, wy: number) => {
      mergeMovePendingRef.current = { id, wx, wy };
      if (mergeMoveRafRef.current !== null) return;
      mergeMoveRafRef.current = requestAnimationFrame(() => {
        mergeMoveRafRef.current = null;
        const p = mergeMovePendingRef.current;
        mergeMovePendingRef.current = null;
        if (p) onImageDragWorldMove?.(p.id, p.wx, p.wy);
      });
    },
    [onImageDragWorldMove],
  );

  useEffect(
    () => () => {
      if (mergeMoveRafRef.current !== null) {
        cancelAnimationFrame(mergeMoveRafRef.current);
      }
    },
    [],
  );

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
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) {
        e.preventDefault();
        onSelect(true);
        return;
      }
      onSelect(false);
      const w = toWorld(e.clientX, e.clientY);
      const multi =
        selectedIds.includes(item.id) && selectedIds.length > 1;
      if (multi) {
        const initialById = new Map<string, { x: number; y: number }>();
        const stackMemberIds: string[] = [];
        for (const id of selectedIds) {
          const it = items.find((i) => i.id === id);
          if (it?.type === "image" || it?.type === "pinterest") {
            stackMemberIds.push(id);
            const p = getImageWorldTopLeft?.(id) ?? { x: it.x, y: it.y };
            initialById.set(id, p);
          } else if (it) {
            initialById.set(id, { x: it.x, y: it.y });
          }
        }
        groupDragRef.current = { startWorld: w, initialById };
        onImageMultiDragStart?.(stackMemberIds);
      } else if (
        groupIsCollapsed &&
        item.groupId &&
        groupCollapseCenter &&
        onPatchGroup
      ) {
        dragRef.current = onOpenGroup
          ? {
              kind: "pendingCollapsedOpen",
              groupId: item.groupId,
              startWorld: w,
              startCx: groupCollapseCenter.cx,
              startCy: groupCollapseCenter.cy,
            }
          : {
              kind: "collapse",
              groupId: item.groupId,
              startWorld: w,
              startCx: groupCollapseCenter.cx,
              startCy: groupCollapseCenter.cy,
            };
      } else {
        const lo = layoutOverrideRef.current;
        const sx = lo?.x ?? item.x;
        const sy = lo?.y ?? item.y;
        setLiveDragPos({ x: sx, y: sy });
        dragRef.current = {
          kind: "item",
          startDisplayX: sx,
          startDisplayY: sy,
          startWorld: w,
        };
        onImageDragWorldStart?.(item.id);
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [
      getImageWorldTopLeft,
      groupCollapseCenter,
      groupIsCollapsed,
      item.groupId,
      item.height,
      item.width,
      item.x,
      item.y,
      item.id,
      items,
      onImageMultiDragStart,
      onImageDragWorldStart,
      onOpenGroup,
      onPatchGroup,
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
      if (d.kind === "pendingCollapsedOpen") {
        const dist = Math.hypot(w.x - d.startWorld.x, w.y - d.startWorld.y);
        if (dist > COLLAPSED_CLICK_DRAG_PX) {
          dragRef.current = {
            kind: "collapse",
            groupId: d.groupId,
            startWorld: w,
            startCx: d.startCx,
            startCy: d.startCy,
          };
        }
        return;
      }
      if (d.kind === "collapse") {
        const dx = w.x - d.startWorld.x;
        const dy = w.y - d.startWorld.y;
        onPatchGroup?.(d.groupId, {
          collapseCenterX: d.startCx + dx,
          collapseCenterY: d.startCy + dy,
        });
        return;
      }
      const dx = w.x - d.startWorld.x;
      const dy = w.y - d.startWorld.y;
      setLiveDragPos({
        x: d.startDisplayX + dx,
        y: d.startDisplayY + dy,
      });
      scheduleMergeHoverMove(item.id, w.x, w.y);
    },
    [item.id, onPatchGroup, onUpdateItem, scheduleMergeHoverMove, toWorld],
  );

  const onBodyPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const hadGroupDrag = Boolean(groupDragRef.current);
      groupDragRef.current = null;
      if (mergeMoveRafRef.current !== null) {
        cancelAnimationFrame(mergeMoveRafRef.current);
        mergeMoveRafRef.current = null;
      }
      mergeMovePendingRef.current = null;
      if (
        d?.kind === "pendingCollapsedOpen" &&
        item.groupId &&
        onOpenGroup
      ) {
        const w = toWorld(e.clientX, e.clientY);
        const dist = Math.hypot(w.x - d.startWorld.x, w.y - d.startWorld.y);
        if (dist <= COLLAPSED_CLICK_DRAG_PX) {
          onOpenGroup(item.groupId);
        }
      }
      dragRef.current = null;
      if (d?.kind === "item" && onMergeDrop) {
        const w = toWorld(e.clientX, e.clientY);
        const dist = Math.hypot(w.x - d.startWorld.x, w.y - d.startWorld.y);
        if (dist > 8) {
          onMergeDrop(item.id, w.x, w.y);
        }
      }
      if (d?.kind === "item") {
        const cancelled = e.type === "pointercancel";
        if (!cancelled) {
          const w = toWorld(e.clientX, e.clientY);
          const fx = d.startDisplayX + (w.x - d.startWorld.x);
          const fy = d.startDisplayY + (w.y - d.startWorld.y);
          flushSync(() => {
            onUpdateItem(item.id, { x: fx, y: fy });
          });
          onGroupMemberDragEnd?.(item.id, fx, fy, item.width, item.height);
        }
        setLiveDragPos(null);
      }
      if (d?.kind === "item" || hadGroupDrag) {
        onImageDragWorldEnd?.();
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [
      item.groupId,
      item.height,
      item.id,
      item.width,
      onGroupMemberDragEnd,
      onImageDragWorldEnd,
      onMergeDrop,
      onOpenGroup,
      onUpdateItem,
      toWorld,
    ],
  );

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

  const handleSimilar = useCallback(async () => {
    if (similarBusy || item.previewStatus === "loading") return;
    setSimilarBusy(true);
    try {
      const ax = liveDragPos?.x ?? layoutOverride?.x ?? item.x;
      const ay = liveDragPos?.y ?? layoutOverride?.y ?? item.y;
      await onSimilar({
        pinUrl: item.url,
        sourcePinterestItemId: item.id,
        anchor: {
          x: ax,
          y: ay,
          width: item.width,
          height: item.height,
        },
      });
    } finally {
      setSimilarBusy(false);
    }
  }, [item, layoutOverride, liveDragPos, onSimilar, similarBusy]);

  const showHoverChrome =
    item.previewStatus === "ready" || item.previewStatus === "error";

  const left = liveDragPos?.x ?? layoutOverride?.x ?? item.x;
  const top = liveDragPos?.y ?? layoutOverride?.y ?? item.y;
  const layoutZ = layoutOverride?.zIndex;
  const zIndex =
    (item.stackPriority ?? 0) * 10_000 + (layoutZ ?? 2);

  return (
    <div
      className={cn(
        "absolute box-border select-none overflow-visible ease-out",
        liveDragPos ? "duration-0" : "transition-[left,top] duration-200",
        isSelected &&
          "shadow-md ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
      )}
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
        tabIndex={0}
        className={cn(
          "group relative h-full w-full overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/60",
        )}
        onPointerDown={onBodyPointerDown}
        onPointerMove={handleBodyMove}
        onPointerUp={onBodyPointerUp}
        onPointerCancel={onBodyPointerUp}
      >
        {item.previewStatus === "loading" && (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2
              className="size-8 animate-spin text-muted-foreground"
              aria-hidden
            />
            <span className="sr-only">Loading Pinterest preview</span>
          </div>
        )}
        {item.previewStatus === "ready" && item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Pinterest oEmbed thumbnail
          <img
            src={item.thumbnailUrl}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : null}
        {item.previewStatus === "ready" && !item.thumbnailUrl && (
          <div className="flex h-full items-center justify-center bg-muted/60 px-2 text-center text-xs text-muted-foreground">
            No thumbnail — hover for link & similar
          </div>
        )}
        {item.previewStatus === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-destructive/5 px-2 text-center text-xs text-muted-foreground">
            Preview unavailable
          </div>
        )}

        <PinterestHoverChrome
          pinPageUrl={item.url}
          similarBusy={similarBusy}
          onSimilar={handleSimilar}
          show={showHoverChrome}
          showSimilarButton={false}
        />
        {showHoverChrome ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="pointer-events-auto absolute bottom-2 right-2 z-20 h-7 gap-1 px-2 text-[10px] shadow-md"
            disabled={similarBusy}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void handleSimilar();
            }}
          >
            {similarBusy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <Images className="size-3" aria-hidden />
            )}
            Similar
          </Button>
        ) : null}
        {isSelected && !groupIsCollapsed && onOpenPinterestTextEditor ? (
          <button
            type="button"
            className="pointer-events-auto absolute right-1 top-1 z-20 flex size-8 items-center justify-center rounded-md border border-primary/40 bg-background/95 text-foreground shadow-md ring-offset-background transition hover:bg-muted"
            aria-label="Edit text on pin"
            title="Edit text on pin"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenPinterestTextEditor(item.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {attachedCaptions.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-[8] overflow-visible"
          aria-hidden
        >
          {attachedCaptions.map((cap) => (
            <AttachedCaptionPreview key={cap.id} text={cap} />
          ))}
        </div>
      ) : null}

      {isSelected && !groupIsCollapsed && (
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
