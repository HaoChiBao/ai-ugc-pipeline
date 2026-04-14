import type { CSSProperties } from "react";
import {
  DEFAULT_CAPTION_FONT_PX,
  type TextCanvasItem,
} from "@/lib/canvas/types";

/** Must match editor + canvas preview so text wraps and scales the same way. */
export const CAPTION_OVERLAY_LINE_HEIGHT = 1.25;

export function captionDefaultsFromTextItem(text: TextCanvasItem): {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
} {
  return {
    fontSize: text.fontSize ?? DEFAULT_CAPTION_FONT_PX,
    fontFamily:
      text.fontFamily ??
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontWeight: text.fontWeight ?? 700,
    color: text.color ?? "#ffffff",
  };
}

/** Typography for caption textarea (editor) and read-only preview (canvas). */
export function captionTypographyStyle(args: {
  fontSizePx: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
}): CSSProperties {
  const { fontSizePx, fontFamily, fontWeight, color } = args;
  return {
    fontSize: fontSizePx,
    fontWeight,
    fontFamily,
    color,
    WebkitTextFillColor: color,
    WebkitTextStroke: "1px rgba(0,0,0,0.75)",
    paintOrder: "stroke fill",
    textShadow: "0 1px 3px rgba(0,0,0,0.85)",
    lineHeight: CAPTION_OVERLAY_LINE_HEIGHT,
  };
}
