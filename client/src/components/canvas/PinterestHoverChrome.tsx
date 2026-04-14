"use client";

import { Button } from "@/components/ui/button";
import { compactUrlDisplay } from "@/lib/url-nodes/formatUrl";
import { cn } from "@/lib/utils";
import { ExternalLink, Images, Loader2, Pin } from "lucide-react";

type PinterestHoverChromeProps = {
  pinPageUrl: string;
  similarBusy: boolean;
  onSimilar: () => void;
  /** When false, overlay is hidden (e.g. loading state). */
  show: boolean;
  /** When false, hide the Similar control (e.g. pinned on the card separately). */
  showSimilarButton?: boolean;
  className?: string;
};

/**
 * Pinterest pill, pin URL link, and Similar — shown on hover/focus-within over the image.
 */
export function PinterestHoverChrome({
  pinPageUrl,
  similarBusy,
  onSimilar,
  show,
  showSimilarButton = true,
  className,
}: PinterestHoverChromeProps) {
  if (!show) return null;

  const compact = compactUrlDisplay(pinPageUrl);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] opacity-0 transition-opacity duration-200",
        "group-hover:opacity-100",
        "group-focus-within:opacity-100",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10"
        aria-hidden
      />
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
        <Pin className="size-3 shrink-0" aria-hidden />
        <span>Pinterest</span>
      </div>
      <a
        href={pinPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={pinPageUrl}
        className={cn(
          "pointer-events-auto absolute bottom-10 left-2 flex min-w-0 items-center gap-1 text-[10px] text-white/95 underline-offset-2 hover:underline",
          showSimilarButton ? "right-20" : "right-2",
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate">{compact}</span>
        <ExternalLink className="size-3 shrink-0 opacity-80" aria-hidden />
      </a>
      {showSimilarButton ? (
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
      ) : null}
    </div>
  );
}
