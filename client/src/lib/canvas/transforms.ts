import { MAX_ZOOM, MIN_ZOOM, type ViewportState } from "./types";

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Viewport-relative coordinates (px) → world (canvas) coordinates */
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { x: number; y: number } {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}

/** World coordinates → viewport-relative coordinates (px) */
export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: ViewportState,
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.panX,
    y: worldY * viewport.zoom + viewport.panY,
  };
}

/**
 * Zoom toward a fixed screen point so the world point under the cursor stays fixed.
 * screenX/screenY are relative to the viewport element (same coords as pan).
 */
export function zoomAtScreenPoint(
  viewport: ViewportState,
  nextZoom: number,
  screenX: number,
  screenY: number,
): ViewportState {
  const z = clampZoom(nextZoom);
  if (z === viewport.zoom) return viewport;
  const ratio = z / viewport.zoom;
  return {
    zoom: z,
    panX: screenX - (screenX - viewport.panX) * ratio,
    panY: screenY - (screenY - viewport.panY) * ratio,
  };
}
