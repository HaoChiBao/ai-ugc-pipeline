"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  type ImageCanvasItem,
  type TikTokCanvasItem,
} from "@/lib/canvas/types";
import { useCanvasViewport } from "@/hooks/canvas/useCanvasViewport";
import { useCanvasState } from "@/hooks/canvas/useCanvasState";
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
  const [tiktokDialogOpen, setTiktokDialogOpen] = useState(false);
  const { viewport, panBy, zoomAtPoint, resetView } = useCanvasViewport();
  const { items, selectedId, addItem, removeItem, patchItem, select } =
    useCanvasState();

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

  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      select(null);
    },
    [select],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const onDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    removeItem(selectedId);
    toast.message("Removed from canvas");
  }, [removeItem, selectedId]);

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
    <div className="relative flex min-h-0 flex-1 flex-col">
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
            selectedId={selectedId}
            toWorld={toWorld}
            onSelect={select}
            onUpdateItem={patchItem}
          />
        </CanvasViewport>
        <CanvasDropOverlay visible={isDraggingFileOver} />
      </div>

      <CanvasToolbar
        onUploadClick={openFileDialog}
        onAddTikTokClick={() => setTiktokDialogOpen(true)}
        onResetView={resetView}
        onDeleteSelected={onDeleteSelected}
        hasSelection={Boolean(selectedId)}
      />

      <TikTokUrlDialog
        open={tiktokDialogOpen}
        onOpenChange={setTiktokDialogOpen}
        onSubmitUrl={onTikTokModalSubmit}
      />

      {selectedId ? (
        <p className="sr-only" aria-live="polite">
          Item selected
        </p>
      ) : null}
    </div>
  );
}
