"use client";

import { useCallback, useMemo } from "react";
import type {
  CanvasGroup,
  CanvasItem,
  CanvasItemPatch,
  PinterestSimilarRequest,
  TextCanvasItem,
  ViewportState,
} from "@/lib/canvas/types";
import {
  computeGroupLayoutMap,
  groupExpanded,
} from "@/lib/canvas/groupLayout";
import type { EffectiveItemLayout } from "@/lib/canvas/groupLayout";
import { CanvasImageItem } from "./CanvasImageItem";
import { CanvasPinterestItem } from "./CanvasPinterestItem";
import { CanvasTextItem } from "./CanvasTextItem";
import { CanvasTikTokItem } from "./CanvasTikTokItem";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasItemsLayerProps = {
  items: CanvasItem[];
  groups: CanvasGroup[];
  viewport: ViewportState;
  /** Viewport size in CSS px; defaults if omitted (SSR / edge cases). */
  viewportPx?: { w: number; h: number } | null;
  hoverPreviewGroupId: string | null;
  selectedIds: string[];
  toWorld: ToWorld;
  onSelectItem: (id: string, additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
  onPinterestSimilar: (req: PinterestSimilarRequest) => Promise<void>;
  onPatchGroup: (id: string, patch: Partial<CanvasGroup>) => void;
  onMergeDrop: (draggedId: string, worldX: number, worldY: number) => void;
  onOpenGroup: (groupId: string) => void;
  onImageDragWorldMove?: (
    draggedId: string,
    worldX: number,
    worldY: number,
  ) => void;
  onImageDragWorldStart?: (draggedId: string) => void;
  onImageDragWorldEnd?: () => void;
  /** Expanded group: these images follow raw x/y while dragging; others stay on grid. */
  activeFreeDragImageIds?: ReadonlySet<string>;
  onGroupMemberDragEnd?: (
    id: string,
    finalX: number,
    finalY: number,
    width: number,
    height: number,
  ) => void;
  onOpenImageTextEditor?: (imageId: string) => void;
  onOpenPinterestTextEditor?: (pinterestItemId: string) => void;
  onRequestSimilarPinUrl?: (imageId: string) => void;
  onImageMultiDragStart?: (imageIds: string[]) => void;
};

export function CanvasItemsLayer({
  items,
  groups,
  viewport,
  viewportPx,
  hoverPreviewGroupId,
  selectedIds,
  toWorld,
  onSelectItem,
  onUpdateItem,
  onPinterestSimilar,
  onPatchGroup,
  onMergeDrop,
  onOpenGroup,
  onImageDragWorldMove,
  onImageDragWorldStart,
  onImageDragWorldEnd,
  onGroupMemberDragEnd,
  activeFreeDragImageIds,
  onOpenImageTextEditor,
  onOpenPinterestTextEditor,
  onRequestSimilarPinUrl,
  onImageMultiDragStart,
}: CanvasItemsLayerProps) {
  const px = viewportPx ?? { w: 800, h: 600 };
  const layoutMap = useMemo(
    () =>
      computeGroupLayoutMap(
        items,
        groups,
        viewport,
        px,
        hoverPreviewGroupId,
      ),
    [items, groups, viewport, px, hoverPreviewGroupId],
  );

  const groupById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );

  const captionsByImageId = useMemo(() => {
    const m = new Map<string, TextCanvasItem[]>();
    for (const i of items) {
      if (i.type !== "text") continue;
      const t = i as TextCanvasItem;
      if (!t.attachedToImageId) continue;
      const list = m.get(t.attachedToImageId) ?? [];
      list.push(t);
      m.set(t.attachedToImageId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return m;
  }, [items]);

  const captionsByPinterestId = useMemo(() => {
    const m = new Map<string, TextCanvasItem[]>();
    for (const i of items) {
      if (i.type !== "text") continue;
      const t = i as TextCanvasItem;
      if (!t.attachedToPinterestItemId) continue;
      const list = m.get(t.attachedToPinterestItemId) ?? [];
      list.push(t);
      m.set(t.attachedToPinterestItemId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return m;
  }, [items]);

  const paintOrder = useMemo(() => {
    const z = (it: CanvasItem) =>
      layoutMap.get(it.id)?.zIndex ?? (it.type === "text" ? 8 : 2);
    return [...items].sort((a, b) => {
      const pa = a.stackPriority ?? 0;
      const pb = b.stackPriority ?? 0;
      if (pa !== pb) return pa - pb;
      const d = z(a) - z(b);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
  }, [items, layoutMap]);

  const selectedSet = new Set(selectedIds);

  const freeDragSet = activeFreeDragImageIds ?? new Set<string>();

  const getImageWorldTopLeft = useCallback(
    (id: string) => {
      const it = items.find((i) => i.id === id);
      if (!it || (it.type !== "image" && it.type !== "pinterest")) {
        return undefined;
      }
      const L = layoutMap.get(id);
      return { x: L?.x ?? it.x, y: L?.y ?? it.y };
    },
    [items, layoutMap],
  );

  return (
    <>
      {paintOrder.map((item) => {
        const L = layoutMap.get(item.id);
        const baseLayoutOverride: EffectiveItemLayout | null = L
          ? { x: L.x, y: L.y, zIndex: L.zIndex }
          : null;

        if (item.type === "image") {
          const g = item.groupId ? groupById.get(item.groupId) : undefined;
          const groupIsCollapsed = Boolean(g && !groupExpanded(g));
          const isExpandedMember = Boolean(g && groupExpanded(g));
          const layoutOverride: EffectiveItemLayout | null =
            isExpandedMember && freeDragSet.has(item.id)
              ? null
              : baseLayoutOverride;
          const groupCollapseCenter =
            g && item.groupId
              ? { cx: g.collapseCenterX, cy: g.collapseCenterY }
              : null;

          return (
            <CanvasImageItem
              key={item.id}
              item={item}
              items={items}
              selectedIds={selectedIds}
              isSelected={selectedSet.has(item.id)}
              toWorld={toWorld}
              onSelect={(additive) => onSelectItem(item.id, additive)}
              onUpdateItem={onUpdateItem}
              onPinterestSimilar={onPinterestSimilar}
              layoutOverride={layoutOverride}
              groupIsCollapsed={groupIsCollapsed}
              groupCollapseCenter={groupCollapseCenter}
              onPatchGroup={onPatchGroup}
              onMergeDrop={onMergeDrop}
              onOpenGroup={onOpenGroup}
              onImageDragWorldMove={onImageDragWorldMove}
              onImageDragWorldStart={onImageDragWorldStart}
              onImageDragWorldEnd={onImageDragWorldEnd}
              onGroupMemberDragEnd={onGroupMemberDragEnd}
              onOpenImageTextEditor={onOpenImageTextEditor}
              onRequestSimilarPinUrl={onRequestSimilarPinUrl}
              getImageWorldTopLeft={getImageWorldTopLeft}
              onImageMultiDragStart={onImageMultiDragStart}
              attachedCaptions={captionsByImageId.get(item.id) ?? []}
            />
          );
        }
        if (item.type === "tiktok") {
          return (
            <CanvasTikTokItem
              key={item.id}
              item={item}
              items={items}
              selectedIds={selectedIds}
              isSelected={selectedSet.has(item.id)}
              toWorld={toWorld}
              onSelect={(additive) => onSelectItem(item.id, additive)}
              onUpdateItem={onUpdateItem}
            />
          );
        }
        if (item.type === "pinterest") {
          const g = item.groupId ? groupById.get(item.groupId) : undefined;
          const groupIsCollapsed = Boolean(g && !groupExpanded(g));
          const isExpandedMember = Boolean(g && groupExpanded(g));
          const layoutOverridePin: EffectiveItemLayout | null =
            isExpandedMember && freeDragSet.has(item.id)
              ? null
              : baseLayoutOverride;
          const groupCollapseCenterPin =
            g && item.groupId
              ? { cx: g.collapseCenterX, cy: g.collapseCenterY }
              : null;

          return (
            <CanvasPinterestItem
              key={item.id}
              item={item}
              items={items}
              selectedIds={selectedIds}
              isSelected={selectedSet.has(item.id)}
              toWorld={toWorld}
              onSelect={(additive) => onSelectItem(item.id, additive)}
              onUpdateItem={onUpdateItem}
              onSimilar={onPinterestSimilar}
              attachedCaptions={captionsByPinterestId.get(item.id) ?? []}
              onOpenPinterestTextEditor={onOpenPinterestTextEditor}
              layoutOverride={layoutOverridePin}
              groupIsCollapsed={groupIsCollapsed}
              groupCollapseCenter={groupCollapseCenterPin}
              onPatchGroup={onPatchGroup}
              onMergeDrop={onMergeDrop}
              onOpenGroup={onOpenGroup}
              onImageDragWorldMove={onImageDragWorldMove}
              onImageDragWorldStart={onImageDragWorldStart}
              onImageDragWorldEnd={onImageDragWorldEnd}
              onGroupMemberDragEnd={onGroupMemberDragEnd}
              getImageWorldTopLeft={getImageWorldTopLeft}
              onImageMultiDragStart={onImageMultiDragStart}
            />
          );
        }
        const layoutOverride = baseLayoutOverride;

        if (item.type === "text") {
          const t = item as TextCanvasItem;
          if (t.attachedToImageId || t.attachedToPinterestItemId) {
            return null;
          }
          return (
            <CanvasTextItem
              key={item.id}
              item={t}
              items={items}
              selectedIds={selectedIds}
              isSelected={selectedSet.has(item.id)}
              toWorld={toWorld}
              onSelect={(additive) => onSelectItem(item.id, additive)}
              onUpdateItem={onUpdateItem}
              layoutOverride={layoutOverride}
            />
          );
        }
        return null;
      })}
    </>
  );
}
