"use client";

import { Menu } from "@base-ui/react/menu";
import { mergeProps } from "@base-ui/react/merge-props";
import {
  ImagePlus,
  Music2,
  Pin,
  Redo2,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
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
  onAddPinterestSearchClick: () => void;
  onAddPinterestPinUrlClick: () => void;
  onResetView: () => void;
  onDeleteSelected?: () => void;
  hasSelection: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  className?: string;
};

export function CanvasToolbar({
  onUploadClick,
  onAddTikTokClick,
  onAddPinterestSearchClick,
  onAddPinterestPinUrlClick,
  onResetView,
  onDeleteSelected,
  hasSelection,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
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

        <Menu.Root modal={false}>
          <Tooltip>
            <TooltipTrigger
              render={(ttProps) => (
                <Menu.Trigger
                  render={(menuProps) => (
                    <Button
                      {...mergeProps(ttProps, menuProps)}
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Pinterest: search or add pin URL"
                      aria-haspopup="menu"
                    >
                      <Pin className="size-4" />
                    </Button>
                  )}
                />
              )}
            />
            <TooltipContent side="top">Pinterest</TooltipContent>
          </Tooltip>

          <Menu.Portal>
            <Menu.Positioner
              className="isolate z-50 outline-none"
              side="top"
              sideOffset={8}
              align="center"
            >
              <Menu.Popup
                className={cn(
                  "min-w-[14rem] origin-(--transform-anchor) rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-md outline-none",
                  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
                  "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                )}
              >
                <Menu.Item
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
                    "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  )}
                  onClick={onAddPinterestSearchClick}
                >
                  <Search className="size-4 opacity-70" />
                  <span>Search pins…</span>
                </Menu.Item>
                <Menu.Item
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
                    "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                  )}
                  onClick={onAddPinterestPinUrlClick}
                >
                  <Pin className="size-4 opacity-70" />
                  <span>Add pin by URL…</span>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>

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
            disabled={!canUndo}
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Undo"
                disabled={!canUndo}
                onClick={(e) => {
                  props.onClick?.(e);
                  onUndo();
                }}
              >
                <Undo2 className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">
            Undo (⌘Z / Ctrl+Z)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            disabled={!canRedo}
            render={(props) => (
              <Button
                {...props}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Redo"
                disabled={!canRedo}
                onClick={(e) => {
                  props.onClick?.(e);
                  onRedo();
                }}
              >
                <Redo2 className="size-4" />
              </Button>
            )}
          />
          <TooltipContent side="top">
            Redo (⇧⌘Z / Ctrl+Shift+Z or Ctrl+Y)
          </TooltipContent>
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
