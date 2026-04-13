"use client";

import { useCallback, useState } from "react";
import {
  clampZoom,
  zoomAtScreenPoint,
} from "@/lib/canvas/transforms";
import {
  DEFAULT_ZOOM,
  type ViewportState,
} from "@/lib/canvas/types";

export function useCanvasViewport(initial?: Partial<ViewportState>) {
  const [viewport, setViewport] = useState<ViewportState>(() => ({
    panX: initial?.panX ?? 0,
    panY: initial?.panY ?? 0,
    zoom: initial?.zoom ?? DEFAULT_ZOOM,
  }));

  const setPan = useCallback((panX: number, panY: number) => {
    setViewport((v) => ({ ...v, panX, panY }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setViewport((v) => ({ ...v, zoom: clampZoom(zoom) }));
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((v) => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
  }, []);

  const zoomAtPoint = useCallback(
    (nextZoom: number, screenX: number, screenY: number) => {
      setViewport((v) => zoomAtScreenPoint(v, nextZoom, screenX, screenY));
    },
    [],
  );

  const resetView = useCallback(() => {
    setViewport({
      panX: 0,
      panY: 0,
      zoom: DEFAULT_ZOOM,
    });
  }, []);

  return {
    viewport,
    setViewport,
    setPan,
    setZoom,
    panBy,
    zoomAtPoint,
    resetView,
  };
}
