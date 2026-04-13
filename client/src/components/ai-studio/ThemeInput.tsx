"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ThemeInputProps = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

/** Hands-free topic: one short theme; the AI plans the full slideshow. */
export function ThemeInput({ value, onChange, disabled }: ThemeInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="ai-theme">Theme or topic</Label>
      <Textarea
        id="ai-theme"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. Top 5 running tips · 6 books every student should read · solo date ideas"
        className="min-h-[100px] resize-y text-sm"
      />
      <p className="text-[11px] text-muted-foreground leading-snug">
        You don’t need to outline each slide — describe the idea in one line and the AI builds the hook,
        list, and CTA, plus image directions.
      </p>
    </div>
  );
}
