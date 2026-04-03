"use client";

/** Large world bounds shared with the pan hit surface (world px). */
export const CANVAS_WORLD_EXTENT = {
  offset: -100_000,
  size: 200_000,
} as const;

const DOT_GRID_PX = 28;

type CanvasDotGridProps = {
  className?: string;
};

/**
 * Repeating dot pattern in world space (moves/scales with pan & zoom).
 */
export function CanvasDotGrid({ className }: CanvasDotGridProps) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        left: CANVAS_WORLD_EXTENT.offset,
        top: CANVAS_WORLD_EXTENT.offset,
        width: CANVAS_WORLD_EXTENT.size,
        height: CANVAS_WORLD_EXTENT.size,
        zIndex: 0,
        pointerEvents: "none",
        backgroundImage:
          "radial-gradient(circle, color-mix(in oklch, var(--foreground) 18%, transparent) 1px, transparent 1px)",
        backgroundSize: `${DOT_GRID_PX}px ${DOT_GRID_PX}px`,
      }}
    />
  );
}
