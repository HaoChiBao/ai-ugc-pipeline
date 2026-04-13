"use client";

import { Button } from "@/components/ui/button";

export type HistoryItem = {
  id: string;
  status: string;
  /** Theme/topic (legacy API field may be `prompt`). */
  prompt: string;
  createdAt: string;
};

type GenerationHistoryPanelProps = {
  items: HistoryItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  disabled?: boolean;
};

export function GenerationHistoryPanel({
  items,
  loading,
  onSelect,
  disabled,
}: GenerationHistoryPanelProps) {
  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading history…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No generations yet.</p>
    );
  }

  return (
    <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
      {items.map((item) => (
        <li key={item.id}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-auto w-full justify-start whitespace-normal py-2 text-left text-xs"
            disabled={disabled}
            onClick={() => onSelect(item.id)}
          >
            <span className="line-clamp-2 font-normal">
              <span className="mr-1 text-[10px] uppercase text-muted-foreground">
                Theme
              </span>
              {item.prompt}
            </span>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {item.status} · {new Date(item.createdAt).toLocaleString()}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}
