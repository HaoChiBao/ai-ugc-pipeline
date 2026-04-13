"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PromptComposerProps = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
};

export function PromptComposer({
  value,
  onChange,
  disabled,
}: PromptComposerProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="ai-prompt">Prompt</Label>
      <Textarea
        id="ai-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. Top 5 books that changed how I think about money…"
        className="min-h-[120px] resize-y"
      />
    </div>
  );
}
