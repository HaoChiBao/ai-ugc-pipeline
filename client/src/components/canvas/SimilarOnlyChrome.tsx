"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Images, Loader2 } from "lucide-react";

type SimilarOnlyChromeProps = {
  similarBusy: boolean;
  onSimilar: () => void;
  show: boolean;
};

/**
 * Hover “Similar” for images without a Pinterest pin URL (e.g. uploads).
 * Opens pin-URL flow in the parent.
 */
export function SimilarOnlyChrome({
  similarBusy,
  onSimilar,
  show,
}: SimilarOnlyChromeProps) {
  if (!show) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] opacity-0 transition-opacity duration-200",
        "group-hover:opacity-100",
        "group-focus-within:opacity-100",
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
        aria-hidden
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="pointer-events-auto absolute bottom-2 right-2 h-7 gap-1 px-2 text-[10px] shadow-md"
        disabled={similarBusy}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void onSimilar();
        }}
      >
        {similarBusy ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Images className="size-3" aria-hidden />
        )}
        Similar
      </Button>
    </div>
  );
}
