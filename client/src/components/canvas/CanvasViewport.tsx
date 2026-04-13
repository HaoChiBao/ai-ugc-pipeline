"use client";

import { forwardRef, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ViewportState } from "@/lib/canvas/types";
import { CanvasDotGrid, CANVAS_WORLD_EXTENT } from "./CanvasDotGrid";

type CanvasViewportProps = {
  viewport: ViewportState;
  onPanBy: (dx: number, dy: number) => void;
  onZoomAtPoint: (nextZoom: number, screenX: number, screenY: number) => void;
  onBackgroundPointerDown?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
  className?: string;
};

export const CanvasViewport = forwardRef<
  HTMLDivElement,
  CanvasViewportProps
>(function CanvasViewport(
  {
    viewport,
    onPanBy,
    onZoomAtPoint,
    onBackgroundPointerDown,
    children,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );
  const viewportRef = useRef(viewport);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const v = viewportRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.001);
        const nextZoom = v.zoom * factor;
        onZoomAtPoint(nextZoom, sx, sy);
      } else {
        onPanBy(-e.deltaX, -e.deltaY);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onPanBy, onZoomAtPoint]);

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        e.preventDefault();
        let lastX = e.clientX;
        let lastY = e.clientY;
        const onMove = (ev: PointerEvent) => {
          const dx = ev.clientX - lastX;
          const dy = ev.clientY - lastY;
          lastX = ev.clientX;
          lastY = ev.clientY;
          onPanBy(dx, dy);
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }
      onBackgroundPointerDown?.(e);
    },
    [onBackgroundPointerDown, onPanBy],
  );

  return (
    <div
      ref={setContainerRef}
      className={cn(
        "relative h-full w-full touch-none overflow-hidden rounded-lg border border-border/60 bg-muted/20",
        className,
      )}
      role="application"
      aria-label="Infinite canvas"
    >
      <div
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
        }}
      >
        <CanvasDotGrid />
        <div
          className="absolute z-[1] bg-transparent"
          style={{
            left: CANVAS_WORLD_EXTENT.offset,
            top: CANVAS_WORLD_EXTENT.offset,
            width: CANVAS_WORLD_EXTENT.size,
            height: CANVAS_WORLD_EXTENT.size,
          }}
          onPointerDown={handleBackgroundPointerDown}
        />
        <div className="relative z-[2]">{children}</div>
      </div>
    </div>
  );
});

CanvasViewport.displayName = "CanvasViewport";
