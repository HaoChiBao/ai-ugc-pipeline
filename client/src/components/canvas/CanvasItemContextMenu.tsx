"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ExternalLink,
  Link2,
  Pencil,
  Trash2,
} from "lucide-react";
import type { CanvasItem } from "@/lib/canvas/types";
import { resolveDownloadableItems } from "@/lib/canvas/downloadCanvasItems";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type CanvasItemContextMenuState = {
  x: number;
  y: number;
  targetIds: string[];
};

type CanvasItemContextMenuProps = {
  menu: CanvasItemContextMenuState | null;
  items: CanvasItem[];
  onClose: () => void;
  onDelete: (ids: string[]) => void;
  onDownload: (ids: string[]) => void;
  onEditImageText?: (imageId: string) => void;
  onEditPinterestText?: (pinterestId: string) => void;
};

export function CanvasItemContextMenu({
  menu,
  items,
  onClose,
  onDelete,
  onDownload,
  onEditImageText,
  onEditPinterestText,
}: CanvasItemContextMenuProps) {
  const targetIds = menu?.targetIds ?? [];

  const downloadable = useMemo(
    () => (menu ? resolveDownloadableItems(items, targetIds) : []),
    [items, menu, targetIds],
  );

  const singleItem = useMemo(() => {
    if (!menu || targetIds.length !== 1) return null;
    return items.find((i) => i.id === targetIds[0]) ?? null;
  }, [items, menu, targetIds]);

  const pinUrl = useMemo(() => {
    if (!singleItem) return null;
    if (singleItem.type === "pinterest" && singleItem.url?.trim()) {
      return singleItem.url.trim();
    }
    if (singleItem.type === "image" && singleItem.pinterestPinUrl?.trim()) {
      return singleItem.pinterestPinUrl.trim();
    }
    return null;
  }, [singleItem]);

  useEffect(() => {
    if (!menu) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === "undefined") return null;

  const selectionCount = targetIds.length;
  const showSelectionHeader = selectionCount > 1;
  const canDownload = downloadable.length > 0;
  const canEditImage =
    singleItem?.type === "image" && Boolean(onEditImageText);
  const canEditPinterest =
    singleItem?.type === "pinterest" && Boolean(onEditPinterestText);

  const menuWidth = 220;
  const padding = 8;
  const left = Math.min(menu.x, window.innerWidth - menuWidth - padding);
  const top = Math.min(menu.y, window.innerHeight - 280 - padding);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        aria-hidden
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        onPointerDown={(e) => {
          if (e.button === 0) onClose();
        }}
      />
      <div
        role="menu"
        aria-label="Canvas item actions"
        className={cn(
          "fixed z-[101] min-w-[13.75rem] rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg outline-none",
        )}
        style={{ left, top }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showSelectionHeader ? (
          <>
            <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              {selectionCount} selected
              {canDownload && selectionCount > 1
                ? ` · ${downloadable.length} downloadable`
                : null}
            </div>
            <Separator className="my-1" />
          </>
        ) : null}

        <button
          type="button"
          role="menuitem"
          disabled={!canDownload}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none",
            "hover:bg-accent hover:text-accent-foreground",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={() => {
            if (!canDownload) return;
            onDownload(targetIds);
            onClose();
          }}
        >
          <Download className="size-4 shrink-0 opacity-70" aria-hidden />
          <span>
            Download
            {downloadable.length > 1 ? ` (${downloadable.length})` : null}
          </span>
        </button>

        {canEditImage ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onEditImageText!(singleItem!.id);
              onClose();
            }}
          >
            <Pencil className="size-4 shrink-0 opacity-70" aria-hidden />
            <span>Edit text on image</span>
          </button>
        ) : null}

        {canEditPinterest ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              onEditPinterestText!(singleItem!.id);
              onClose();
            }}
          >
            <Pencil className="size-4 shrink-0 opacity-70" aria-hidden />
            <span>Edit text on pin</span>
          </button>
        ) : null}

        {pinUrl ? (
          <>
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                window.open(pinUrl, "_blank", "noopener,noreferrer");
                onClose();
              }}
            >
              <ExternalLink className="size-4 shrink-0 opacity-70" aria-hidden />
              <span>Open Pinterest pin</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none select-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                void navigator.clipboard.writeText(pinUrl);
                onClose();
              }}
            >
              <Link2 className="size-4 shrink-0 opacity-70" aria-hidden />
              <span>Copy pin URL</span>
            </button>
          </>
        ) : null}

        <Separator className="my-1" />

        <button
          type="button"
          role="menuitem"
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive outline-none select-none hover:bg-destructive/10"
          onClick={() => {
            onDelete(targetIds);
            onClose();
          }}
        >
          <Trash2 className="size-4 shrink-0 opacity-80" aria-hidden />
          <span>Delete</span>
        </button>
      </div>
    </>,
    document.body,
  );
}
