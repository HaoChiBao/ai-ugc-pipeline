"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCanvasWorkspace } from "@/components/canvas/CanvasWorkspaceContext";
import { selectedPinterestSources } from "@/lib/canvas/pinterestSelection";
import { GenerationHistoryPanel } from "./GenerationHistoryPanel";
import { SlideshowAgentChat } from "./SlideshowAgentChat";

type Tab = "generate" | "history";

export function AIStudioPanel() {
  const { items, selectedIds, projectId } = useCanvasWorkspace();

  const [tab, setTab] = useState<Tab>("generate");

  const pinterestSelectedCount = useMemo(
    () => selectedPinterestSources(items, selectedIds).length,
    [items, selectedIds],
  );

  const historyQuery = useQuery({
    queryKey: ["generations-history", projectId],
    enabled: tab === "history",
    queryFn: async () => {
      const q = projectId ? `?projectId=${projectId}` : "";
      const res = await fetch(`/api/generations${q}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "History unavailable");
      }
      return res.json() as Promise<{
        items: Array<{
          id: string;
          status: string;
          prompt: string;
          createdAt: string;
        }>;
      }>;
    },
  });

  const historyItems = useMemo(() => {
    const rows = historyQuery.data?.items ?? [];
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      prompt: r.prompt,
      createdAt: r.createdAt,
    }));
  }, [historyQuery.data?.items]);

  return (
    <aside className="flex h-svh w-[min(100%,420px)] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex shrink-0 border-b border-border text-sm">
        <button
          type="button"
          className={`flex-1 py-2 font-medium ${tab === "generate" ? "bg-muted/60" : ""}`}
          onClick={() => setTab("generate")}
        >
          Generate
        </button>
        <button
          type="button"
          className={`flex-1 py-2 font-medium ${tab === "history" ? "bg-muted/60" : ""}`}
          onClick={() => setTab("history")}
        >
          History
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {tab === "generate" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <p className="shrink-0 text-sm text-muted-foreground">
              The slideshow agent plans, recommends captions and varied shots,
              self-reviews, then generates on the canvas. Select Pinterest pins
              or Pinterest-tagged images as the visual pool.
            </p>
            <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Selected Pinterest images:{" "}
              <span className="font-medium text-foreground">
                {pinterestSelectedCount}
              </span>
            </div>
            <SlideshowAgentChat className="min-h-0 flex-1" />
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Requires{" "}
              <code className="rounded bg-muted px-1">
                ENABLE_GENERATION_HISTORY=true
              </code>{" "}
              on the server. Listed runs are from the legacy JSON pipeline, not
              this agent.
            </p>
            <GenerationHistoryPanel
              items={historyItems}
              loading={historyQuery.isLoading}
              onSelect={() => {
                toast.message(
                  "This entry is from the legacy server pipeline. Use Generate → slideshow agent for new canvas work.",
                );
              }}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
