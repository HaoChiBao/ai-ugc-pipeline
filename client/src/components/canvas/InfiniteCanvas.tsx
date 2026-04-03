"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { screenToWorld } from "@/lib/canvas/transforms";
import { computeInitialImageSize } from "@/lib/canvas/imageSizing";
import {
  createObjectUrl,
  loadImageNaturalSize,
  revokeObjectUrl,
} from "@/lib/canvas/files";
import type { ImageCanvasItem } from "@/lib/canvas/types";
import { useCanvasViewport } from "@/hooks/canvas/useCanvasViewport";
import { useCanvasState } from "@/hooks/canvas/useCanvasState";
import { useCanvasPaste } from "@/hooks/canvas/useCanvasPaste";
import { useCanvasFileInput } from "@/hooks/canvas/useCanvasFileInput";
import { useCanvasDrop } from "@/hooks/canvas/useCanvasDrop";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasItemsLayer } from "./CanvasItemsLayer";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasDropOverlay } from "./CanvasDropOverlay";

type Placement =
  | { kind: "center" }
  | { kind: "point"; screenX: number; screenY: number };

export function InfiniteCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { viewport, panBy, zoomAtPoint, resetView } = useCanvasViewport();
  const {
    items,
    selectedId,
    addItem,
    removeItem,
    patchItem,
    select,
  } = useCanvasState();

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

  const onPasteImage = useCallback(
    (blob: Blob) => {
      void addImageFromBlob(blob, { kind: "center" }, "paste");
    },
    [addImageFromBlob],
  );

  const onNonImagePaste = useCallback(() => {
    toast.message("No image in clipboard");
  }, []);

  useCanvasPaste({
    onImageBlob: onPasteImage,
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
    toast.message("Image removed");
  }, [removeItem, selectedId]);

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
        onResetView={resetView}
        onDeleteSelected={onDeleteSelected}
        hasSelection={Boolean(selectedId)}
      />

      {selectedId ? (
        <p className="sr-only" aria-live="polite">
          Image selected
        </p>
      ) : null}
    </div>
  );
}
