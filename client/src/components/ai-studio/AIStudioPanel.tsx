"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCanvasWorkspace } from "@/components/canvas/CanvasWorkspaceContext";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  buildGenerateSlidesRequest,
  defaultGenerationControls,
  type GenerationControlValues,
} from "@/lib/generation/buildGenerateSlidesRequest";
import { ensureCanvasAssetsUploaded } from "@/lib/generation/ensureCanvasAssetsUploaded";
import type { ImageCanvasItem } from "@/lib/canvas/types";
import { ThemeInput } from "./ThemeInput";
import { GenerationControls } from "./GenerationControls";
import { SelectedCanvasAssetsList } from "./SelectedCanvasAssetsList";
import { GenerationProgress } from "./GenerationProgress";
import { GeneratedSlidesPanel } from "./GeneratedSlidesPanel";
import { PythonSlidesPanel } from "./PythonSlidesPanel";
import {
  GenerationHistoryPanel,
  type HistoryItem,
} from "./GenerationHistoryPanel";
import type { GeneratedProjectResultForClient } from "@/lib/generation/assembleClientResult";

type GenerationDetailResponse = {
  generation: {
    id: string;
    status: string;
    errorMessage: string | null;
    prompt: string;
  };
  job: { id: string; status: string; progress: number } | null;
  result: GeneratedProjectResultForClient | null;
  rawResponseJson: unknown;
};

type Tab = "generate" | "history";

export function AIStudioPanel() {
  const {
    items,
    selectedIds,
    viewport,
    projectId,
    setProjectId,
    patchItem,
  } = useCanvasWorkspace();

  const [tab, setTab] = useState<Tab>("generate");
  const [theme, setTheme] = useState("");
  const [controls, setControls] = useState<GenerationControlValues>(() =>
    defaultGenerationControls(),
  );
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(
    null,
  );
  const queryClient = useQueryClient();

  const images = useMemo(
    () => items.filter((i): i is ImageCanvasItem => i.type === "image"),
    [items],
  );

  const detailQuery = useQuery({
    queryKey: ["generation", activeGenerationId],
    enabled: Boolean(activeGenerationId),
    queryFn: async (): Promise<GenerationDetailResponse> => {
      const res = await fetch(`/api/generations/${activeGenerationId}`);
      if (!res.ok) {
        throw new Error("Failed to load generation");
      }
      return res.json() as Promise<GenerationDetailResponse>;
    },
    refetchInterval: (q) => {
      const s = q.state.data?.generation.status;
      if (!s || s === "completed" || s === "failed") return false;
      return 2000;
    },
  });

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

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!theme.trim()) {
        throw new Error("Enter a theme or topic first.");
      }

      const imageIdsForUpload = controls.useSelectedCanvasAssets
        ? selectedIds.filter((id) => images.some((im) => im.id === id))
        : [];

      const pid = await ensureCanvasAssetsUploaded({
        items,
        imageItemIds: imageIdsForUpload,
        projectId,
        setProjectId,
        patchItem,
      });

      const body = buildGenerateSlidesRequest({
        theme,
        controls,
        items,
        selectedIds,
        viewport,
        projectId: pid,
      });

      const res = await fetch("/api/generate-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        generationId?: string;
        status?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Generation request failed");
      }
      return data as { generationId: string; status: string };
    },
    onSuccess: (data) => {
      setActiveGenerationId(data.generationId);
      void queryClient.invalidateQueries({
        queryKey: ["generation", data.generationId],
      });
      toast.success(
        data.status === "completed"
          ? "Generation finished"
          : "Generation queued — watch progress",
      );
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const onRegenerate = useCallback(async () => {
    if (!activeGenerationId) return;
    const res = await fetch(`/api/generations/${activeGenerationId}/regenerate`, {
      method: "POST",
    });
    if (res.status === 501) {
      toast.message("Regenerate will be available in a later iteration.");
    }
  }, [activeGenerationId]);

  const historyItems: HistoryItem[] = useMemo(() => {
    const rows = historyQuery.data?.items ?? [];
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      prompt: r.prompt,
      createdAt: r.createdAt,
    }));
  }, [historyQuery.data?.items]);

  const gen = detailQuery.data?.generation;
  const progress = detailQuery.data?.job?.progress ?? 0;
  const status = gen?.status ?? null;
  const err =
    gen?.status === "failed"
      ? (gen.errorMessage ?? "Generation failed")
      : detailQuery.isError
        ? detailQuery.error.message
        : null;

  return (
    <aside className="flex w-[min(100%,380px)] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex border-b border-border text-sm">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "generate" ? (
          <div className="flex flex-col gap-4">
            <ThemeInput
              value={theme}
              onChange={setTheme}
              disabled={generateMutation.isPending}
            />
            <section className="space-y-2">
              <h3 className="text-sm font-medium">Reference images</h3>
              <p className="text-[11px] text-muted-foreground">
                Selected canvas images are used as visual style context when enabled below.
              </p>
              <SelectedCanvasAssetsList
                images={images}
                selectedIds={selectedIds}
              />
            </section>
            <GenerationControls
              value={controls}
              onChange={setControls}
              disabled={generateMutation.isPending}
            />
            <PythonSlidesPanel />
            <GenerationProgress
              status={status}
              progress={progress}
              error={err}
            />
            <Button
              type="button"
              className="w-full"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? "Working…" : "Generate slideshow"}
            </Button>

            {detailQuery.data?.result ? (
              <>
                <Separator className="my-2" />
                <GeneratedSlidesPanel
                  result={detailQuery.data.result}
                  rawJson={
                    detailQuery.data.rawResponseJson ??
                    detailQuery.data.result
                  }
                  onRegenerateRequest={() => void onRegenerate()}
                />
              </>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Requires{" "}
              <code className="rounded bg-muted px-1">ENABLE_GENERATION_HISTORY=true</code>{" "}
              on the server.
            </p>
            <GenerationHistoryPanel
              items={historyItems}
              loading={historyQuery.isLoading}
              onSelect={(id) => {
                setActiveGenerationId(id);
                setTab("generate");
                void queryClient.invalidateQueries({
                  queryKey: ["generation", id],
                });
              }}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
