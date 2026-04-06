"use client";

import {
  ImagePlus,
  Music2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type CanvasToolbarProps = {
  onUploadClick: () => void;
  onAddTikTokClick: () => void;
  onResetView: () => void;
  onDeleteSelected?: () => void;
  hasSelection: boolean;
  className?: string;
};

export function CanvasToolbar({
  onUploadClick,
  onAddTikTokClick,
  onResetView,
  onDeleteSelected,
  hasSelection,
  className,
}: CanvasToolbarProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-lg backdrop-blur-sm",
        className,
      )}
      role="toolbar"
      aria-label="Canvas actions"
    >
      <div className="pointer-events-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Upload image"
                onClick={(e) => {
                  props.onClick?.(e);
                  onUploadClick();
                }}
              >
                <ImagePlus className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">Upload image</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Add TikTok URL"
                onClick={(e) => {
                  props.onClick?.(e);
                  onAddTikTokClick();
                }}
              >
                <Music2 className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">Add TikTok URL</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Reset pan and zoom"
                onClick={(e) => {
                  props.onClick?.(e);
                  onResetView();
                }}
              >
                <RefreshCw className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">Reset view</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-6" />

        <Tooltip>
          <TooltipTrigger
            disabled={!hasSelection}
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove selected item"
                disabled={!hasSelection}
                onClick={(e) => {
                  props.onClick?.(e);
                  onDeleteSelected?.();
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">Delete selected</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
