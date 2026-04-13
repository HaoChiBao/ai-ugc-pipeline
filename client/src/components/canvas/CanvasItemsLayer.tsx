"use client";

import type { CanvasItem, CanvasItemPatch } from "@/lib/canvas/types";
import { CanvasImageItem } from "./CanvasImageItem";
import { CanvasTikTokItem } from "./CanvasTikTokItem";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasItemsLayerProps = {
  items: CanvasItem[];
  selectedIds: string[];
  toWorld: ToWorld;
  onSelectItem: (id: string, additive: boolean) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
};

export function CanvasItemsLayer({
  items,
  selectedIds,
  toWorld,
  onSelectItem,
  onUpdateItem,
}: CanvasItemsLayerProps) {
  const selectedSet = new Set(selectedIds);
  return (
    <>
      {items.map((item) => {
        if (item.type === "image") {
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
        return null;
      })}
    </>
  );
}
