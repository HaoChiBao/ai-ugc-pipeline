"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCanvasWorkspace } from "@/components/canvas/CanvasWorkspaceContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildSlideshowAgentReferences } from "@/lib/canvas/buildSlideshowAgentReferenceImages";
import { placeCaptionedSlideshowOnCanvas } from "@/lib/canvas/captionedSlideshowToCanvas";
import {
  buildSelectedTiktokContextBlock,
  selectedSlideshowVisualSources,
  selectedSlideshowVisualStillLoading,
} from "@/lib/canvas/slideshowVisualSources";
import { cn } from "@/lib/utils";
import { Clapperboard, ExternalLink, Loader2, Send } from "lucide-react";

export type SlideshowAgentArtifact = {
  thinking: string;
  plan: string;
  qualityCheck: string;
  slideOutlines: Array<{
    order: number;
    purpose: string;
    headline: string;
    captionGuidance: string;
    recommendedCaption: string;
    shotDirection: string;
    primaryReferenceId: string;
  }>;
  executionPrompt: string;
  assistantMessage: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Props = {
  className?: string;
};

function formatPlanTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function SlideshowAgentChat({ className }: Props) {
  const {
    items,
    selectedIds,
    addItem,
    addGroup,
    getCanvasViewportCenterWorld,
    focusGroupOnCanvas,
  } = useCanvasWorkspace();

  const visualSources = useMemo(
    () => selectedSlideshowVisualSources(items, selectedIds),
    [items, selectedIds],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingSlides, setGeneratingSlides] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<SlideshowAgentArtifact | null>(null);
  const [planMeta, setPlanMeta] = useState<{
    updatedAt: string;
    revision: number;
  } | null>(null);
  const [lastSlideshow, setLastSlideshow] = useState<{
    groupId: string;
    slideCount: number;
    previewUrls: string[];
    createdAt: string;
  } | null>(null);
  /**
   * Canvas item ids used as the visual pool for the latest successful plan.
   * Captured synchronously when the user sends (before any await) so changing
   * selection while the agent runs does not affect generation.
   */
  const [planVisualSourceIds, setPlanVisualSourceIds] = useState<
    string[] | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, lastSlideshow]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || loading || generatingSlides) return;

    const sourceIdsAtSend = visualSources.map((s) => s.item.id);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setDraft("");
    setLoading(true);
    setError(null);

    try {
      let references:
        | Awaited<ReturnType<typeof buildSlideshowAgentReferences>>
        | undefined;
      if (visualSources.length > 0) {
        try {
          references = await buildSlideshowAgentReferences(visualSources);
        } catch (encErr) {
          console.error(encErr);
          toast.error(
            "Could not read selected references for vision; planning without image context.",
          );
        }
      }

      const tiktokBlock = buildSelectedTiktokContextBlock(items, selectedIds);
      const messagesForApi = nextThread.map((m, i) => {
        if (m.role !== "user" || i !== nextThread.length - 1) {
          return { role: m.role, content: m.content };
        }
        const c = tiktokBlock.trim()
          ? `${tiktokBlock}\n\n---\n\n${m.content}`
          : m.content;
        return { role: m.role, content: c };
      });

      const res = await fetch("/api/slideshow/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messagesForApi,
          ...(references && references.length > 0 ? { references } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | SlideshowAgentArtifact
        | { error?: string };

      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Agent request failed",
        );
      }

      const a = data as SlideshowAgentArtifact;
      if (
        typeof a.assistantMessage !== "string" ||
        typeof a.thinking !== "string"
      ) {
        throw new Error("Invalid response from agent");
      }

      const outlines = Array.isArray(a.slideOutlines) ? a.slideOutlines : [];
      setArtifact({
        thinking: a.thinking,
        plan: a.plan,
        qualityCheck: a.qualityCheck,
        slideOutlines: outlines.map((s) => ({
          order: s.order,
          purpose: s.purpose,
          headline: s.headline,
          captionGuidance: s.captionGuidance,
          recommendedCaption: s.recommendedCaption,
          shotDirection: s.shotDirection,
          primaryReferenceId:
            typeof (s as { primaryReferenceId?: string }).primaryReferenceId ===
            "string"
              ? (s as { primaryReferenceId: string }).primaryReferenceId
              : "n/a",
        })),
        executionPrompt: a.executionPrompt,
        assistantMessage: a.assistantMessage,
      });
      setPlanMeta((prev) => ({
        updatedAt: new Date().toISOString(),
        revision: (prev?.revision ?? 0) + 1,
      }));
      setPlanVisualSourceIds(sourceIdsAtSend);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: a.assistantMessage,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [
    draft,
    loading,
    generatingSlides,
    messages,
    visualSources,
    items,
    selectedIds,
  ]);

  const copyExecution = useCallback(async () => {
    if (!artifact?.executionPrompt) return;
    try {
      await navigator.clipboard.writeText(artifact.executionPrompt);
      toast.success("Execution brief copied");
    } catch {
      toast.error("Could not copy");
    }
  }, [artifact]);

  const generateOnCanvas = useCallback(async () => {
    if (!artifact?.executionPrompt.trim()) {
      toast.error("Run the agent first to produce a plan and brief.");
      return;
    }
    const idsForGeneration =
      planVisualSourceIds !== null && planVisualSourceIds.length > 0
        ? planVisualSourceIds
        : selectedIds;
    const sourcesForGeneration = selectedSlideshowVisualSources(
      items,
      idsForGeneration,
    );
    if (sourcesForGeneration.length === 0) {
      if (selectedSlideshowVisualStillLoading(items, idsForGeneration)) {
        toast.error(
          "Wait for Pinterest or TikTok previews to finish loading, then try again.",
        );
      } else {
        toast.error(
          planVisualSourceIds !== null && planVisualSourceIds.length > 0
            ? "The references used for this plan are no longer on the canvas or no longer qualify (Pinterest-tagged image, ready pin, or TikTok with thumbnail). Restore them or send a new prompt with a fresh selection."
            : "Select at least one Pinterest pin, Pinterest-tagged image, or TikTok card with a loaded thumbnail.",
        );
      }
      return;
    }

    setGeneratingSlides(true);
    try {
      const result = await placeCaptionedSlideshowOnCanvas({
        prompt: artifact.executionPrompt.trim(),
        sources: sourcesForGeneration,
        getCanvasViewportCenterWorld,
        addItem,
        addGroup,
      });
      setLastSlideshow({
        groupId: result.groupId,
        slideCount: result.slideCount,
        previewUrls: result.slidePreviewUrls,
        createdAt: new Date().toISOString(),
      });
      toast.success("Slideshow ready", {
        description: `${result.slideCount} slide(s) placed on the canvas. Click the preview below or Open on canvas.`,
        duration: 8000,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Slideshow failed");
    } finally {
      setGeneratingSlides(false);
    }
  }, [
    addGroup,
    addItem,
    artifact,
    getCanvasViewportCenterWorld,
    items,
    planVisualSourceIds,
    selectedIds,
  ]);

  const openLastSlideshowOnCanvas = useCallback(() => {
    if (!lastSlideshow) return;
    focusGroupOnCanvas(lastSlideshow.groupId);
  }, [focusGroupOnCanvas, lastSlideshow]);

  const busy = loading || generatingSlides;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-0 rounded-lg border border-border bg-muted/20",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">Slideshow agent</p>
        <p className="text-[11px] text-muted-foreground">
          Plans with reasoning, recommended captions, and varied shot directions.
          When you are happy with the structured plan, generate slides on the
          canvas. Visual pool = selected Pinterest pins, pin-tagged images, or
          TikTok cards (extracted TikTok context is included in your prompt
          when you select those cards).
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2"
      >
        {messages.length === 0 && !loading ? (
          <p className="text-center text-[11px] text-muted-foreground">
            Describe your slideshow. The agent will plan, recommend captions and
            shots, self-review, then you can generate on the canvas.
          </p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[95%] rounded-lg px-2.5 py-2 text-xs leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto border border-border bg-background",
            )}
          >
            {m.content}
          </div>
        ))}
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
            Planning and reviewing…
          </div>
        ) : null}
        {generatingSlides ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
            Generating slides and captions…
          </div>
        ) : null}
        {error ? (
          <p className="text-[11px] text-destructive">{error}</p>
        ) : null}

        {lastSlideshow ? (
          <div
            role="button"
            tabIndex={0}
            className="group mx-auto max-w-[95%] cursor-pointer rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2 shadow-sm outline-none ring-offset-background transition hover:border-emerald-500/70 hover:bg-emerald-500/15 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => openLastSlideshowOnCanvas()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openLastSlideshowOnCanvas();
              }
            }}
          >
            <div className="flex items-center justify-between gap-2 px-0.5 pb-1.5">
              <p className="text-[11px] font-semibold text-emerald-950 dark:text-emerald-100">
                Latest slideshow on canvas
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 dark:text-emerald-200">
                Open
                <ExternalLink className="size-3" aria-hidden />
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
              {lastSlideshow.previewUrls.slice(0, 8).map((url, i) => (
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt=""
                  className="pointer-events-none h-16 w-11 shrink-0 rounded-md border border-border/60 object-cover"
                />
              ))}
            </div>
            <p className="px-0.5 pt-1 text-center text-[10px] text-muted-foreground group-hover:text-foreground">
              {lastSlideshow.slideCount} slide
              {lastSlideshow.slideCount === 1 ? "" : "s"} — tap to pan and open
              the group
            </p>
          </div>
        ) : null}
      </div>

      {artifact && planMeta ? (
        <div className="max-h-[min(42vh,340px)] shrink-0 space-y-2 overflow-y-auto border-t border-border px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Latest structured plan
            </p>
            <p className="text-[10px] text-muted-foreground">
              <span className="font-medium text-foreground">
                v{planMeta.revision}
              </span>
              <span aria-hidden> · </span>
              <time dateTime={planMeta.updatedAt}>
                Updated {formatPlanTimestamp(planMeta.updatedAt)}
              </time>
            </p>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Tip: ask for changes in the box below (e.g. ‘shorter hook’, ‘more
            B-roll’) — the plan version and time update after each reply.
          </p>

          <details
            open
            className="rounded-md border border-violet-500/35 bg-violet-500/10"
          >
            <summary className="cursor-pointer select-none px-2 py-1.5 text-[11px] font-semibold text-foreground">
              Thinking
            </summary>
            <div className="max-h-40 overflow-y-auto border-t border-violet-500/20 px-2 py-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
              {artifact.thinking}
            </div>
          </details>

          <div className="rounded-md border border-border bg-background px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Plan
            </p>
            <p className="mt-1 text-[11px] whitespace-pre-wrap text-foreground">
              {artifact.plan}
            </p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-amber-900 dark:text-amber-200">
              Double-check
            </p>
            <p className="mt-1 text-[11px] whitespace-pre-wrap text-amber-950/90 dark:text-amber-50/90">
              {artifact.qualityCheck}
            </p>
          </div>

          <div className="rounded-md border border-border bg-background px-2 py-2">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Slides: captions &amp; shots
            </p>
            <ul className="mt-1 max-h-36 space-y-1.5 overflow-y-auto text-[11px]">
              {artifact.slideOutlines.map((s) => (
                <li
                  key={s.order}
                  className="rounded border border-border/80 bg-muted/30 px-2 py-1"
                >
                  <span className="font-medium text-foreground">
                    {s.order}. {s.headline}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {s.purpose}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-foreground">
                    <span className="font-medium">Caption: </span>
                    {s.recommendedCaption || s.captionGuidance}
                  </span>
                  <span className="block text-[10px] italic text-muted-foreground">
                    <span className="font-medium not-italic">Shot: </span>
                    {s.shotDirection}
                  </span>
                  {s.primaryReferenceId !== "n/a" ? (
                    <span className="mt-0.5 block text-[10px] text-violet-700 dark:text-violet-300">
                      <span className="font-medium">Reference: </span>
                      {s.primaryReferenceId}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {planVisualSourceIds !== null && planVisualSourceIds.length > 0 ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              Generate uses the{" "}
              <span className="font-medium text-foreground">
                {planVisualSourceIds.length}
              </span>{" "}
              canvas reference
              {planVisualSourceIds.length === 1 ? "" : "s"} (pins / tagged
              images / TikTok) selected when you last sent a prompt — not the
              current canvas selection.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              className="w-full gap-1.5"
              disabled={busy}
              onClick={() => void generateOnCanvas()}
            >
              {generatingSlides ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Clapperboard className="size-4" aria-hidden />
              )}
              Generate slideshow on canvas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void copyExecution()}
            >
              Copy full generation brief
            </Button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-border p-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            artifact
              ? "Follow up: e.g. more sarcastic, add a B-roll slide, shorter captions…"
              : "e.g. 6-slide morning run tips, funny Gen Z voice, mix hero + detail shots…"
          }
          disabled={busy}
          rows={3}
          className="min-h-[72px] resize-y text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            ⌘/Ctrl+Enter to send
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy || !draft.trim()}
            className="gap-1.5"
            onClick={() => void send()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
