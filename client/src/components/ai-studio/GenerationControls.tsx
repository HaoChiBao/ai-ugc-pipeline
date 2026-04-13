"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { GenerationControlValues } from "@/lib/generation/buildGenerateSlidesRequest";

type GenerationControlsProps = {
  value: GenerationControlValues;
  onChange: (v: GenerationControlValues) => void;
  disabled?: boolean;
};

export function GenerationControls({
  value,
  onChange,
  disabled,
}: GenerationControlsProps) {
  const patch = (p: Partial<GenerationControlValues>) =>
    onChange({ ...value, ...p });

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <Label>Mode</Label>
        <p className="text-[11px] text-muted-foreground">
          Grounded stays plausible; creative allows more expressive storytelling.
        </p>
        <div className="flex gap-2">
          {(
            [
              ["grounded", "Grounded"],
              ["creative", "Creative"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              onClick={() => patch({ mode: k })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                value.mode === k
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-muted/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="slide-count">Slides</Label>
          <input
            id="slide-count"
            type="number"
            min={3}
            max={15}
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={value.slideCount}
            onChange={(e) =>
              patch({ slideCount: Number(e.target.value) || 3 })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="style-preset">Style</Label>
          <select
            id="style-preset"
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            value={value.stylePreset}
            onChange={(e) => patch({ stylePreset: e.target.value })}
          >
            <option value="">Default</option>
            <option value="minimal_clean">Minimal / clean</option>
            <option value="bold_contrast">Bold contrast</option>
            <option value="soft_aesthetic">Soft aesthetic</option>
            <option value="editorial">Editorial</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tone">Tone</Label>
        <input
          id="tone"
          disabled={disabled}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          value={value.tone}
          onChange={(e) => patch({ tone: e.target.value })}
          placeholder="e.g. friendly expert"
        />
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <ToggleRow
          id="use-selected"
          label="Use selected canvas images as style references"
          checked={value.useSelectedCanvasAssets}
          disabled={disabled}
          onCheckedChange={(c) => patch({ useSelectedCanvasAssets: c })}
        />
        <ToggleRow
          id="include-visible"
          label="Include every image on the board in AI context"
          checked={value.includeVisibleCanvasAssets}
          disabled={disabled}
          onCheckedChange={(c) => patch({ includeVisibleCanvasAssets: c })}
        />
        <ToggleRow
          id="gen-visuals"
          label="Generate cohesive slide images (Gemini, uses references when enabled)"
          checked={value.generateVisuals}
          disabled={disabled}
          onCheckedChange={(c) => patch({ generateVisuals: c })}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-xs leading-snug"
    >
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <span>{label}</span>
    </label>
  );
}
