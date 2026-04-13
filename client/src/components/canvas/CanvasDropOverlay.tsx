"use client";

import { cn } from "@/lib/utils";

type CanvasDropOverlayProps = {
  visible: boolean;
  className?: string;
};

export function CanvasDropOverlay({ visible, className }: CanvasDropOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-dashed border-primary/60 bg-primary/[0.06]",
        className,
      )}
      aria-hidden
    />
  );
}
