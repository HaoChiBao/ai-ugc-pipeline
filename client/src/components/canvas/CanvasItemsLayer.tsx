"use client";

import type { CanvasItem, CanvasItemPatch } from "@/lib/canvas/types";
import { CanvasImageItem } from "./CanvasImageItem";
import { CanvasTikTokItem } from "./CanvasTikTokItem";

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

type CanvasItemsLayerProps = {
  items: CanvasItem[];
  selectedId: string | null;
  toWorld: ToWorld;
  onSelect: (id: string | null) => void;
  onUpdateItem: (id: string, patch: CanvasItemPatch) => void;
};

export function CanvasItemsLayer({
  items,
  selectedId,
  toWorld,
  onSelect,
  onUpdateItem,
}: CanvasItemsLayerProps) {
  return (
    <>
      {items.map((item) => {
        if (item.type === "image") {
          return (
            <CanvasImageItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              toWorld={toWorld}
              onSelect={() => onSelect(item.id)}
              onUpdate={(patch) => onUpdateItem(item.id, patch)}
            />
          );
        }
        if (item.type === "tiktok") {
          return (
            <CanvasTikTokItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              toWorld={toWorld}
              onSelect={() => onSelect(item.id)}
              onUpdate={(patch) => onUpdateItem(item.id, patch)}
            />
          );
        }
        return null;
      })}
    </>
  );
}
