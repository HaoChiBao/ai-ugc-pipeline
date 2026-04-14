import {
  captionDefaultsFromTextItem,
  captionTypographyStyle,
} from "@/lib/canvas/captionOverlay";
import type { TextCanvasItem } from "@/lib/canvas/types";
import { cn } from "@/lib/utils";

export function AttachedCaptionPreview({ text }: { text: TextCanvasItem }) {
  const fx = text.overlayFractionX ?? 0.5;
  const fy = text.overlayFractionY ?? 0.42;
  const align = text.textAlign ?? "center";
  const d = captionDefaultsFromTextItem(text);

  return (
    <div
      className="pointer-events-none absolute overflow-visible select-none"
      style={{
        left: `${fx * 100}%`,
        top: `${fy * 100}%`,
        width: text.width,
        height: text.height,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className={cn(
          "box-border h-full w-full overflow-hidden whitespace-pre-wrap rounded-md border-2 border-transparent bg-transparent p-2 [overflow-wrap:anywhere]",
          align === "center" && "text-center",
          align === "right" && "text-right",
        )}
        style={captionTypographyStyle({
          fontSizePx: d.fontSize,
          fontFamily: d.fontFamily,
          fontWeight: d.fontWeight,
          color: d.color,
        })}
      >
        {text.text}
      </div>
    </div>
  );
}
