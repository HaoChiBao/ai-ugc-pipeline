"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasGroup, CanvasItem, ViewportState } from "@/lib/canvas/types";
import {
  loadCanvasFromStorage,
  saveCanvasToStorage,
} from "@/lib/canvas/canvasPersistence";

const SAVE_DEBOUNCE_MS = 700;

type CanvasSlice = {
  items: CanvasItem[];
  groups: CanvasGroup[];
  loadDoc: (doc: { items: CanvasItem[]; groups: CanvasGroup[] }) => void;
};

type ViewportSlice = {
  viewport: ViewportState;
  setViewport: (v: ViewportState) => void;
};

/**
 * Restores the board from localStorage + IndexedDB on mount, then debounces saves.
 */
export function useCanvasPersistence(
  canvas: CanvasSlice,
  viewport: ViewportSlice,
): { hydrated: boolean } {
  const [hydrated, setHydrated] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadCanvasFromStorage();
        if (cancelled) return;
        if (loaded) {
          canvas.loadDoc({ items: loaded.items, groups: loaded.groups });
          if (loaded.viewport) {
            viewport.setViewport(loaded.viewport);
          }
        }
      } catch {
        // Corrupt storage or IndexedDB failure — start with an empty board.
      } finally {
        if (!cancelled) {
          skipSaveRef.current = false;
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!hydrated || skipSaveRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveCanvasToStorage({
        items: canvas.items,
        groups: canvas.groups,
        viewport: viewport.viewport,
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [hydrated, canvas.items, canvas.groups, viewport.viewport]);

  return { hydrated };
}
