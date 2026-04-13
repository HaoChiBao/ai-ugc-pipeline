"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { itemIntersectsWorldRect } from "@/lib/canvas/intersects";
import { screenToWorld } from "@/lib/canvas/transforms";
import { computeInitialImageSize } from "@/lib/canvas/imageSizing";
import {
  createObjectUrl,
  loadImageNaturalSize,
  revokeObjectUrl,
} from "@/lib/canvas/files";
import {
  DEFAULT_TIKTOK_NODE_HEIGHT,
  DEFAULT_TIKTOK_NODE_WIDTH,
  DEFAULT_ZOOM,
  type CanvasItem,
  type ImageCanvasItem,
  type TikTokCanvasItem,
  type ViewportState,
} from "@/lib/canvas/types";
import { useCanvasWorkspace } from "@/components/canvas/CanvasWorkspaceContext";
import { useCanvasPaste } from "@/hooks/canvas/useCanvasPaste";
import { useCanvasFileInput } from "@/hooks/canvas/useCanvasFileInput";
import { useCanvasDrop } from "@/hooks/canvas/useCanvasDrop";
import { fetchTikTokPreview } from "@/lib/url-nodes/tiktok/fetchTikTokPreview";
import { normalizeTikTokUrl } from "@/lib/url-nodes/tiktok/validateTikTokUrl";
import { looksLikeWebUrl } from "@/lib/url-nodes/looksLikeWebUrl";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasItemsLayer } from "./CanvasItemsLayer";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasDropOverlay } from "./CanvasDropOverlay";
import { TikTokUrlDialog } from "./TikTokUrlDialog";

type Placement =
  | { kind: "center" }
  | { kind: "point"; screenX: number; screenY: number };

export function InfiniteCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<CanvasItem[]>([]);
  const viewportStateRef = useRef<ViewportState>({
    panX: 0,
    panY: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [tiktokDialogOpen, setTiktokDialogOpen] = useState(false);
  const [marqueeBox, setMarqueeBox] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const marqueeStartRef = useRef<{ sx: number; sy: number } | null>(null);
  const {
    viewport,
    panBy,
    zoomAtPoint,
    resetView,
    items,
    selectedIds,
    addItem,
    removeItems,
    patchItem,
    select,
    selectMany,
  } = useCanvasWorkspace();

  itemsRef.current = items;
  viewportStateRef.current = viewport;

  const centerWorldPlacement = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const world = screenToWorld(rect.width / 2, rect.height / 2, viewport);
    return world;
  }, [viewport]);

  const addImageFromBlob = useCallback(
    async (
      blob: Blob,
      placement: Placement,
      feedback: "paste" | "upload" | "drop",
      options?: { skipToast?: boolean },
    ): Promise<boolean> => {
      const url = createObjectUrl(blob);
      try {
        const natural = await loadImageNaturalSize(url);
        const { width, height } = computeInitialImageSize(
          natural.width,
          natural.height,
        );
        const el = viewportRef.current;
        if (!el) {
          revokeObjectUrl(url);
          return false;
        }
        const rect = el.getBoundingClientRect();
        let x = 0;
        let y = 0;
        if (placement.kind === "center") {
          const world = screenToWorld(
            rect.width / 2,
            rect.height / 2,
            viewport,
          );
          x = world.x - width / 2;
          y = world.y - height / 2;
        } else {
          const world = screenToWorld(
            placement.screenX,
            placement.screenY,
            viewport,
          );
          x = world.x;
          y = world.y;
        }
        const item: ImageCanvasItem = {
          id: crypto.randomUUID(),
          type: "image",
          x,
          y,
          width,
          height,
          src: url,
        };
        addItem(item);
        if (!options?.skipToast) {
          const label =
            feedback === "paste"
              ? "Image pasted"
              : feedback === "upload"
                ? "Image uploaded"
                : "Image placed";
          toast.success(label);
        }
        return true;
      } catch {
        revokeObjectUrl(url);
        if (!options?.skipToast) {
          toast.error("Could not load that image");
        }
        return false;
      }
    },
    [addItem, viewport],
  );

  const addTikTokFromUrl = useCallback(
    async (canonicalUrl: string) => {
      const world = centerWorldPlacement();
      const id = crypto.randomUUID();
      const w = DEFAULT_TIKTOK_NODE_WIDTH;
      const h = DEFAULT_TIKTOK_NODE_HEIGHT;

      const item: TikTokCanvasItem = {
        id,
        type: "tiktok",
        url: canonicalUrl,
        x: world.x - w / 2,
        y: world.y - h / 2,
        width: w,
        height: h,
        title: "Loading…",
        thumbnailUrl: null,
        authorName: null,
        previewStatus: "loading",
      };
      addItem(item);
      toast.success("TikTok URL added");

      try {
        const preview = await fetchTikTokPreview(canonicalUrl);
        patchItem(id, {
          title: preview.title,
          thumbnailUrl: preview.thumbnailUrl,
          authorName: preview.authorName,
          previewStatus: "ready",
          previewError: undefined,
        });
        if (preview.previewLimited) {
          toast.message("TikTok preview limited", {
            description:
              "Thumbnail/title may be unavailable for this post type; the link is still on the canvas.",
          });
        } else {
          toast.success("TikTok preview loaded");
        }
      } catch {
        patchItem(id, {
          previewStatus: "error",
          previewError: "Preview unavailable",
          title: "TikTok",
        });
        toast.error("TikTok preview failed");
      }
    },
    [addItem, centerWorldPlacement, patchItem],
  );

  const onPasteImage = useCallback(
    (blob: Blob) => {
      void addImageFromBlob(blob, { kind: "center" }, "paste");
    },
    [addImageFromBlob],
  );

  const onPlainTextPaste = useCallback(
    (text: string) => {
      const canonical = normalizeTikTokUrl(text);
      if (canonical) {
        void addTikTokFromUrl(canonical);
        return;
      }
      if (looksLikeWebUrl(text)) {
        toast.message("Not a valid TikTok URL", {
          description: "Use a link from tiktok.com",
        });
      }
    },
    [addTikTokFromUrl],
  );

  const onNonImagePaste = useCallback(() => {
    toast.message("No image in clipboard");
  }, []);

  useCanvasPaste({
    onImageBlob: onPasteImage,
    onPlainText: onPlainTextPaste,
    onNonImagePaste: onNonImagePaste,
  });

  const onFileFromInput = useCallback(
    (file: File) => {
      void addImageFromBlob(file, { kind: "center" }, "upload");
    },
    [addImageFromBlob],
  );

  const onInvalidFile = useCallback(() => {
    toast.error("Please choose a valid image file");
  }, []);

  const { inputRef, openFileDialog, onInputChange } = useCanvasFileInput({
    onFile: onFileFromInput,
    onInvalid: onInvalidFile,
  });

  const onDropFiles = useCallback(
    async (files: File[], screenX: number, screenY: number) => {
      let placed = 0;
      for (let i = 0; i < files.length; i++) {
        const ok = await addImageFromBlob(
          files[i],
          {
            kind: "point",
            screenX: screenX + i * 24,
            screenY: screenY + i * 24,
          },
          "drop",
          { skipToast: true },
        );
        if (ok) placed += 1;
      }
      if (placed === 1) toast.success("Image placed");
      else if (placed > 1) toast.success(`${placed} images placed`);
    },
    [addImageFromBlob],
  );

  const { isDraggingFileOver, dropHandlers } = useCanvasDrop({
    onFiles: onDropFiles,
  });

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return screenToWorld(
        clientX - rect.left,
        clientY - rect.top,
        viewport,
      );
    },
    [viewport],
  );

  /** Figma-style: drag on empty canvas = marquee; tiny movement = click to deselect; Shift+marquee = add */
  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      marqueeStartRef.current = { sx, sy };
      setMarqueeBox({ x1: sx, y1: sy, x2: sx, y2: sy });

      const onMove = (ev: PointerEvent) => {
        const r = viewportRef.current?.getBoundingClientRect();
        const start = marqueeStartRef.current;
        if (!r || !start) return;
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        setMarqueeBox({
          x1: start.sx,
          y1: start.sy,
          x2: x,
          y2: y,
        });
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const start = marqueeStartRef.current;
        marqueeStartRef.current = null;
        setMarqueeBox(null);

        const r = viewportRef.current?.getBoundingClientRect();
        if (!r || !start) return;
        const endX = ev.clientX - r.left;
        const endY = ev.clientY - r.top;
        const dx = Math.abs(endX - start.sx);
        const dy = Math.abs(endY - start.sy);
        if (dx < 4 && dy < 4) {
          select(null);
          return;
        }

        const x1 = Math.min(start.sx, endX);
        const y1 = Math.min(start.sy, endY);
        const x2 = Math.max(start.sx, endX);
        const y2 = Math.max(start.sy, endY);

        const v = viewportStateRef.current;
        const w1 = screenToWorld(x1, y1, v);
        const w2 = screenToWorld(x2, y2, v);
        const wx1 = Math.min(w1.x, w2.x);
        const wy1 = Math.min(w1.y, w2.y);
        const wx2 = Math.max(w1.x, w2.x);
        const wy2 = Math.max(w1.y, w2.y);
        const rw = wx2 - wx1;
        const rh = wy2 - wy1;

        const hit = itemsRef.current.filter((item) =>
          itemIntersectsWorldRect(item, wx1, wy1, rw, rh),
        );
        const ids = hit.map((it) => it.id);
        if (ev.shiftKey) {
          selectMany(ids, { additive: true });
        } else {
          selectMany(ids);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [select, selectMany],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const onDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    removeItems([...selectedIds]);
    toast.message(
      selectedIds.length === 1
        ? "Removed from canvas"
        : `${selectedIds.length} items removed`,
    );
  }, [removeItems, selectedIds]);

  const onTikTokModalSubmit = useCallback(
    (raw: string) => {
      const canonical = normalizeTikTokUrl(raw);
      if (!canonical) {
        toast.error("Not a valid TikTok URL");
        return;
      }
      void addTikTokFromUrl(canonical);
      setTiktokDialogOpen(false);
    },
    [addTikTokFromUrl],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onInputChange}
      />
      <div
        className="relative min-h-0 flex-1"
        {...dropHandlers}
      >
        <CanvasViewport
          ref={viewportRef}
          viewport={viewport}
          onPanBy={panBy}
          onZoomAtPoint={zoomAtPoint}
          onBackgroundPointerDown={onBackgroundPointerDown}
          className="h-full min-h-0"
        >
          <CanvasItemsLayer
            items={items}
            selectedIds={selectedIds}
            toWorld={toWorld}
            onSelectItem={(id, additive) => select(id, { additive })}
            onUpdateItem={patchItem}
          />
        </CanvasViewport>
        {marqueeBox ? (
          <div
            className="pointer-events-none absolute inset-0 z-[25]"
            aria-hidden
          >
            <div
              className="absolute border border-primary bg-primary/15"
              style={{
                left: Math.min(marqueeBox.x1, marqueeBox.x2),
                top: Math.min(marqueeBox.y1, marqueeBox.y2),
                width: Math.abs(marqueeBox.x2 - marqueeBox.x1),
                height: Math.abs(marqueeBox.y2 - marqueeBox.y1),
              }}
            />
          </div>
        ) : null}
        <CanvasDropOverlay visible={isDraggingFileOver} />
      </div>

      <CanvasToolbar
        onUploadClick={openFileDialog}
        onAddTikTokClick={() => setTiktokDialogOpen(true)}
        onResetView={resetView}
        onDeleteSelected={onDeleteSelected}
        hasSelection={selectedIds.length > 0}
      />
      <p className="pointer-events-none absolute bottom-16 left-1/2 z-20 max-w-[min(100%,28rem)] -translate-x-1/2 px-2 text-center text-[10px] text-muted-foreground">
        Shift+click: add/remove · Drag on canvas: box select (Shift adds) · Drag
        selection to move
      </p>

      <TikTokUrlDialog
        open={tiktokDialogOpen}
        onOpenChange={setTiktokDialogOpen}
        onSubmitUrl={onTikTokModalSubmit}
      />

      {selectedIds.length > 0 ? (
        <p className="sr-only" aria-live="polite">
          {selectedIds.length === 1 ? "Item selected" : "Items selected"}
        </p>
      ) : null}
    </div>
  );
}
