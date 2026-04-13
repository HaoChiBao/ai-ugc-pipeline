"use client";

import type { GeneratedProjectResultForClient } from "@/lib/generation/assembleClientResult";
import { SlideResultCard } from "./SlideResultCard";
import { CaptionPackageCard } from "./CaptionPackageCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type GeneratedSlidesPanelProps = {
  result: GeneratedProjectResultForClient;
  rawJson: unknown;
  onRegenerateRequest: () => void;
};

export function GeneratedSlidesPanel({
  result,
  rawJson,
  onRegenerateRequest,
}: GeneratedSlidesPanelProps) {
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
      toast.success("JSON copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const continuity = result.styleDirection.continuityNotes;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{result.title}</h2>
          <p className="text-xs capitalize text-muted-foreground">
            {result.contentType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copyJson}>
            Copy JSON
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onRegenerateRequest}>
            Regenerate
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Strategy</h3>
        <p className="text-xs text-muted-foreground">{result.strategySummary}</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Style and visuals</h3>
        <ul className="list-inside list-disc text-xs text-muted-foreground">
          {result.styleDirection.designNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        {continuity?.length ? (
          <div className="rounded-md border border-border/80 bg-muted/30 px-2 py-1.5">
            <p className="text-[11px] font-medium text-foreground">Continuity</p>
            <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
              {continuity.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Slides</h3>
        <div className="flex max-h-[min(50vh,420px)] flex-col gap-2 overflow-y-auto pr-1">
          {result.slides.map((s) => (
            <SlideResultCard key={s.order} slide={s} />
          ))}
        </div>
      </section>

      <CaptionPackageCard pkg={result.captionPackage} />

      <details className="rounded-md border border-dashed border-border p-2 text-xs">
        <summary className="cursor-pointer font-medium">Developer: raw JSON</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
          {JSON.stringify(rawJson, null, 2)}
        </pre>
      </details>
    </div>
  );
}
